/* declare_kernel.h — the runtime's stable core, as one C ABI.
 *
 * What lives here (docs/system-design/kernel.md): slot tables, static and
 * dynamic edges, the settle (two phases, FIFO with re-queue, equality-gated
 * writes, one owner per slot, the cycle guard, afterSettle steps and change
 * events at the close), EXPR rules the kernel evaluates itself and BODY rules
 * it calls the host for. Numbers and integers only across this boundary; the
 * host reads the slot table directly (a Float64Array over kernel memory in the
 * browser, a double* on the Mac). Freestanding: no libc, no allocation after
 * kernel_load — everything comes from the arena the host hands in.
 *
 * The same header serves the native library and the WebAssembly module: on
 * the wasm side the callbacks are imports (module "host"), on the native side
 * they are the function pointers in dk_host. */
#ifndef DECLARE_KERNEL_H
#define DECLARE_KERNEL_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ── the image (what the compiler emits; kernel/image.mjs builds it) ──────
 * Little-endian words. Every table is 8-byte aligned. */
#define DK_MAGIC    0x4C4E524B  /* "KRNL" */
#define DK_VERSION  1

/* cell kinds */
#define DK_F64  0   /* stored in the slot table; the kernel gates on == */
#define DK_REF  1   /* stored by the host; the kernel only carries the wake */

/* rule kinds */
#define DK_EXPR     0   /* class (A): bytecode over cells, kernel-evaluated  */
#define DK_BODY     1   /* class (B): host body(rule, elem) -> value/changed  */
#define DK_DYNAMIC  2   /* a BODY whose read set is discovered per run        */
#define DK_VIS      3   /* built-in: a view's visibility facts (kernel_vis_add) */
#define DK_EXTENT   4   /* built-in: a container's auto-extent on one axis (kernel_extent_add) */

/* rule flags (image + runtime) */
#define DK_YIELDING   1   /* a runtime derive: an author write displaces it   */
#define DK_PHASE1     2   /* draw phase: runs after every phase-0 rule         */
#define DK_PERCENT    4   /* a percent binding: auto-extent skips the child slot it owns */
#define DK_STRUCTURAL 4   /* (cell flag) a child-list cell: wakes re-probe     */

/* EXPR opcodes: a stack machine over doubles. Operands are u32 words. */
enum {
  DK_OP_END = 0,
  DK_OP_LOAD,     /* cell            → push slots[cell]                       */
  DK_OP_CONST,    /* const index     → push consts[i]                         */
  DK_OP_ADD, DK_OP_SUB, DK_OP_MUL, DK_OP_DIV, DK_OP_MOD, DK_OP_NEG,
  DK_OP_MIN, DK_OP_MAX, DK_OP_ABS, DK_OP_FLOOR, DK_OP_CEIL, DK_OP_ROUND, DK_OP_SQRT,
  DK_OP_LT, DK_OP_LE, DK_OP_GT, DK_OP_GE, DK_OP_EQ, DK_OP_NE,
  DK_OP_AND, DK_OP_OR, DK_OP_NOT,
  DK_OP_SELECT,   /* c a b → c ? a : b (both evaluated; pure)                  */
  DK_OP_CLAMP,    /* x lo hi                                                  */
  DK_OP__COUNT
};

/* ── results ─────────────────────────────────────────────────────────────── */
#define DK_OK              0
#define DK_ERR_IMAGE      -1   /* bad magic/version/bounds                     */
#define DK_ERR_ARENA      -2   /* arena too small for the image + capacities   */
#define DK_ERR_OWNED      -3   /* author write to a slot a constraint owns     */
#define DK_ERR_CYCLE      -4   /* a rule re-ran CYCLE_LIMIT times in one settle */
#define DK_ERR_AFTER      -5   /* afterSettle/onChange re-armed AFTER_LIMIT×    */
#define DK_ERR_BOUND      -6   /* already bound (non-yielding prior owner)     */
#define DK_ERR_FULL       -7   /* a capacity (rules, cells, dyn edges) is spent */
#define DK_ERR_BAD        -8   /* bad argument                                 */
#define DK_ERR_ABORT      -9   /* the host aborted the settle (a body threw)   */

#define DK_CYCLE_LIMIT 100
#define DK_AFTER_LIMIT 100

/* ── host callbacks ──────────────────────────────────────────────────────── */
typedef struct dk_host {
  void *ctx;
  /* A BODY/DYNAMIC rule: compute and — for a REF target or a side-effect rule
   * (target < 0) — apply it too. Returns the value for an F64 target; for the
   * others returns 1.0 if the host's stored value changed, else 0.0. */
  double (*body)(void *ctx, uint32_t rule, uint32_t elem, int32_t target);
  /* The settle's close, in this order: drain afterSettle steps (return 1 if
   * any ran), then deliver change events (return 1 if any fired). Either may
   * write; the settle loops back to quiescence. */
  int (*after_steps)(void *ctx);
  int (*fire_changes)(void *ctx);
  /* A settle ended (clean or by error): the host clears its chain state. */
  void (*end_chain)(void *ctx);
  /* A cycle or limit tripped: the offending rule, for the message. */
  void (*error)(void *ctx, int code, uint32_t rule);
  /* Work was queued outside a settle: the host schedules one (a microtask). */
  void (*schedule)(void *ctx);
  /* A built-in rule met a case it does not compute (an auto-extent over a 3D
   * child): the host replaces it with its own computation. May be NULL. */
  void (*decline)(void *ctx, uint32_t rule);
} dk_host;

typedef struct dk_kernel dk_kernel;

/* ── capacities beyond the image (rows stamped later, dynamic edges) ─────── */
typedef struct dk_caps {
  uint32_t extra_elems, extra_cells, extra_rules, dyn_edges;
  uint32_t ring;   /* write-ring capacity (0 → 4096) */
  uint32_t code_words, consts;   /* arenas for EXPR rules added at runtime */
  uint32_t track_ring;   /* track-ring capacity (0 → 4096) — see kernel_track_ring */
} dk_caps;

/* Bytes of arena kernel_load needs for this image and these capacities. */
uint32_t kernel_arena_size(const void *image, uint32_t bytes, const dk_caps *caps);

dk_kernel *kernel_load(const void *image, uint32_t bytes, const dk_caps *caps,
                       void *arena, uint32_t arena_bytes, const dk_host *host);

/* The slot table (F64 cells; REF cells hold nothing the host reads). */
double *kernel_table(dk_kernel *k);
uint32_t kernel_cells(dk_kernel *k);
uint32_t kernel_rules(dk_kernel *k);
uint32_t kernel_elems(dk_kernel *k);
/* A cell id from (elem, slot). */
uint32_t kernel_cell(dk_kernel *k, uint32_t elem, uint32_t slot);

/* The AUTHOR write (a setter): one-owner check (a yielding owner is disposed;
 * any other → DK_ERR_OWNED), the set mark, the equality gate, the wake. */
int kernel_write(dk_kernel *k, uint32_t cell, double v);
/* The RUNTIME write (setBound): gate + wake, no ownership consulted. */
int kernel_set(dk_kernel *k, uint32_t cell, double v);
/* A REF cell moved on the host side: wake its subscribers. */
void kernel_touch(dk_kernel *k, uint32_t cell);
/* Was the cell ever author-set (isSet)? */
int kernel_is_set(dk_kernel *k, uint32_t cell);

/* Ownership (own / release / ownerOf): -1 = none. */
int kernel_own(dk_kernel *k, uint32_t cell, uint32_t rule);
void kernel_release(dk_kernel *k, uint32_t cell, uint32_t rule);
int32_t kernel_owner(dk_kernel *k, uint32_t cell);

/* Rule lifecycle. */
int kernel_run(dk_kernel *k, uint32_t rule);          /* evaluate now (first landing) */
void kernel_invalidate(dk_kernel *k, uint32_t rule);  /* queue for the next settle */
void kernel_dispose(dk_kernel *k, uint32_t rule);
void kernel_suspend(dk_kernel *k, uint32_t rule);
int kernel_resume(dk_kernel *k, uint32_t rule);

/* Dynamic tracking: while a DYNAMIC rule runs, kernel_active() is its id and
 * the host's readers call kernel_track(cell) for every cell they read. */
int32_t kernel_active(dk_kernel *k);
int kernel_track(dk_kernel *k, uint32_t cell);
/* The address of the active-rule word, so a host can poll it with no call. */
int32_t *kernel_active_ptr(dk_kernel *k);

/* The settle: to quiescence, both phases, then the close. Returns the number
 * of rule runs, or a DK_ERR_ code. Pending work is queued by writes; a settle
 * with nothing queued returns 0 at once. */
int32_t kernel_settle(dk_kernel *k);
int kernel_pending(dk_kernel *k);

/* Cells whose F64 value changed since the last drain — the applier's list.
 * Fills `out` up to `cap`, returns how many there were (may exceed cap). */
uint32_t kernel_dirty(dk_kernel *k, uint32_t *out, uint32_t cap);

/* Cells at runtime (the runtime's lazily created Cells): a free list keeps
 * ids compact. A freed cell's subscribers are dropped. */
int32_t kernel_add_cell(dk_kernel *k, uint8_t kind, int structural);
void kernel_free_cell(dk_kernel *k, uint32_t cell);
/* A contiguous BLOCK of n runtime cells (one instance's numeric slots):
 * returns the first id, or a DK_ERR_ code. Blocks are never returned to the
 * kernel — the host keeps them for reuse and clears them between lives. */
int32_t kernel_add_cells(dk_kernel *k, uint32_t n, uint8_t kind);
/* Reset a block for reuse: subscribers dropped, marks and ownership cleared,
 * values zeroed (the host writes the defaults). */
void kernel_clear_cells(dk_kernel *k, uint32_t base, uint32_t n);

/* THE WRITE RING — writes without a call. The host stores the new value in
 * the table itself (having gated on == there) and appends the cell id to this
 * ring; the kernel drains it — marking dirty and waking subscribers — at the
 * start of a settle, after every rule run, and whenever the host asks
 * (kernel_flush). A REF cell's change goes through the same ring. `count` is
 * the fill (the host bumps it); the kernel resets it to 0 when it drains. */
uint32_t *kernel_ring(dk_kernel *k, uint32_t *capacity_out);
/* THE TRACK RING: a tracked read appends the cell it read — `tring[count++] =
 * cell`, no call — while a DYNAMIC rule's body runs; the kernel drains it
 * (linking each cell to the active rule, coalesced) when the body returns,
 * at the next run's entry, and at kernel_flush. The same ring serves the WASM
 * host (a call saved per read) and a native host (where a call is ~1 µs). */
uint32_t *kernel_track_ring(dk_kernel *k, uint32_t *capacity_out);
uint32_t *kernel_track_count(dk_kernel *k);
uint32_t *kernel_ring_count(dk_kernel *k);
void kernel_flush(dk_kernel *k);

/* Replace a runtime rule's edge set (a wired constraint re-probing after a
 * structural wake). */
int kernel_rewire(dk_kernel *k, uint32_t rule, const uint32_t *edges, uint32_t nedges);
/* A rule's dependency cells (static edges, then dynamic ones): fills `out`
 * up to `cap`, returns how many there are. Tooling and tests. */
uint32_t kernel_deps(dk_kernel *k, uint32_t rule, uint32_t *out, uint32_t cap);
/* Rule state bits: 1 queued · 2 dead · 4 suspended · 8 needs rewire · 16 unlanded. */
uint32_t kernel_state(dk_kernel *k, uint32_t rule);
/* The rules' state bytes as an array the host VIEWS (no call per check):
 * rule r's state is at ptr[r * stride]; `cap` rules are laid out. */
uint8_t *kernel_state_ptr(dk_kernel *k, uint32_t *stride_out);
uint32_t kernel_rule_cap(dk_kernel *k);
/* The scheduled-settle flag (set by a wake outside a settle, cleared as one
 * starts), for the host to view; with the ring counts and its own in-settle
 * knowledge the host answers "is work pending" without a call. */
int32_t *kernel_pending_ptr(dk_kernel *k);
/* Per cell, the head of its dynamic subscriber list (0xFFFFFFFF = none), and
 * the count of image cells (whose static subscribers are not in that list):
 * a host that stores a value itself skips the wake when nobody listens. */
uint32_t *kernel_cell_dyn_ptr(dk_kernel *k);
uint32_t kernel_static_cells(dk_kernel *k);
/* The host hit an exception inside a body: end the settle at the next
 * opportunity with DK_ERR_ABORT (its finally still runs). */
void kernel_abort(dk_kernel *k);

/* ── views and the built-in visibility rule ─────────────────────────────
 * A VIEW is an element whose numeric block follows the View class layout:
 * the host declares that layout's slot indices once (kernel_view_layout),
 * then registers each view it wants kernel rules for (its block's first cell
 * and its parent view). The visibility rule for a view walks the parent
 * chain in the table — the exact arithmetic of the runtime's readVisibility
 * (rootTransform ∘ boxThrough ∩ the root's frame, scale × dpr) — and writes
 * the view's six output cells: onScreen, apparentScale, visX, visY, visW,
 * visH. A chain with a 3D transform (rotateX/Y, translateZ) is beyond the
 * affine walk: the rule then writes visMode = 0 and the host computes. */
typedef struct dk_view_layout {
  uint32_t x, y, width, height, visible;
  uint32_t scale, scaleX, scaleY, rotation, skewX, skewY, pivotX, pivotY;
  uint32_t scrollX, scrollY, ignoreScroll, scrollsOn;
  uint32_t rotateX, rotateY, translateZ;
  uint32_t onScreen, apparentScale, visX, visY, visW, visH, visMode;
  uint32_t ignoreClip;
} dk_view_layout;
void kernel_view_layout(dk_kernel *k, const dk_view_layout *layout);
/* The device pixel ratio lives in a cell the host owns (so a change wakes). */
void kernel_view_dpr_cell(dk_kernel *k, uint32_t cell);
int32_t kernel_view_add(dk_kernel *k, uint32_t base, int32_t parent_view);
void kernel_view_parent(dk_kernel *k, uint32_t view, int32_t parent_view);
void kernel_view_remove(dk_kernel *k, uint32_t view);
/* The rule: edges are the chain's slots (rewired by kernel_vis_rewire after
 * a reparent), the root is the view whose frame clips. Returns the rule id. */
int32_t kernel_vis_add(dk_kernel *k, uint32_t view, uint32_t root_view);

/* AUTO-EXTENT (view.ts extentOf): a container's unset width (axis 0) or height
 * (axis 1) is the max over its visible, unclipped, non-percent children of
 * x + footprint's lead + footprint's extent — the transformed box, as paint
 * and the hit walk see it. `words` = [ the container's child-list cell (or
 * NONE), then each child's numeric BLOCK base ]; the rule's edges are those
 * cells (rewired by kernel_extent_rewire when the child list changes). A 3D
 * child is declined to the host (dk_host.decline). YIELDING, like every
 * runtime derive. Returns the rule id. */
int32_t kernel_extent_add(dk_kernel *k, uint32_t axis, uint32_t target, const uint32_t *words, uint32_t n);
int kernel_extent_rewire(dk_kernel *k, uint32_t rule, const uint32_t *words, uint32_t n);
int kernel_vis_rewire(dk_kernel *k, uint32_t rule);

/* EXPR code and constants at runtime: append words, get their offset/index.
 * A runtime EXPR rule names its code by OFFSET (kernel_add_rule's `code`
 * argument cast to an offset when kind == DK_EXPR). */
int32_t kernel_add_code(dk_kernel *k, const uint32_t *words, uint32_t n);
int32_t kernel_add_const(dk_kernel *k, double v);
/* Cells written BY RULES (EXPR, VIS — not by the host through the ring) since
 * the last drain: the host runs their Surface pushes after a settle. */
uint32_t kernel_kdirty(dk_kernel *k, uint32_t *out, uint32_t cap);

/* Add a rule at runtime (the runtime-built derives; rows come later). For an
 * EXPR rule `code` is an offset from kernel_add_code (not a pointer). */
int32_t kernel_add_rule(dk_kernel *k, int32_t target, uint8_t kind, uint8_t flags,
                        const uint32_t *edges, uint32_t nedges,
                        const uint32_t *code, uint32_t ncode, uint32_t body);

#ifdef __cplusplus
}
#endif
#endif
