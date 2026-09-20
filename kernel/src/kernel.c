/* kernel.c — the settle, as data over an arena. See declare_kernel.h and
 * docs/system-design/kernel.md. Freestanding C11: no libc, no allocation
 * after kernel_load. The semantics are the runtime's reactive.ts /
 * attributes.ts, kept line for line where they matter:
 *   · a write updates now, dependents recompute at the settle, once each
 *   · FIFO by invalidation order with fixpoint re-queue; phase 0 before 1
 *   · the equality gate is ==, so a NaN write always propagates (as ===)
 *   · one owner per slot; a yielding owner is displaced, another is an error
 *   · CYCLE_LIMIT runs of one rule in one settle is a cycle
 *   · the close: afterSettle steps, then change events; each loops back */
#include "declare_kernel.h"

#define NONE 0xffffffffu

/* ── the host, both ways ────────────────────────────────────────────────────
 * Natively the callbacks are the function pointers in dk_host. Under
 * WebAssembly a C function pointer cannot name a JS function, so the same
 * five calls are IMPORTS (module "host") and dk_host is ignored. */
#ifdef __wasm__
#define IMPORT(name) __attribute__((import_module("host"), import_name(name)))
/* no libm in a freestanding wasm module: the host's Math.* (reached only off
 * the identity fast path — a rotated or skewed view) */
IMPORT("sin") double dk_sin(double);
IMPORT("cos") double dk_cos(double);
IMPORT("tan") double dk_tan(double);
IMPORT("body")         double host_body(uint32_t rule, uint32_t elem, int32_t target);
IMPORT("after_steps")  int    host_after_steps(void);
IMPORT("fire_changes") int    host_fire_changes(void);
IMPORT("end_chain")    void   host_end_chain(void);
IMPORT("error")        void   host_error(int code, uint32_t rule);
IMPORT("schedule")     void   host_schedule(void);
IMPORT("decline")      void   host_decline(uint32_t rule);
#define CALL_BODY(k, r, e, t)   host_body((r), (e), (t))
#define CALL_AFTER(k)           host_after_steps()
#define CALL_CHANGES(k)         host_fire_changes()
#define CALL_END(k)             host_end_chain()
#define CALL_ERROR(k, c, r)     host_error((c), (r))
#define CALL_SCHEDULE(k)        host_schedule()
#define CALL_DECLINE(k, r)      host_decline((r))
#else
#define CALL_BODY(k, r, e, t)   (k)->host.body((k)->host.ctx, (r), (e), (t))
#define CALL_AFTER(k)           (k)->host.after_steps((k)->host.ctx)
#define CALL_CHANGES(k)         (k)->host.fire_changes((k)->host.ctx)
#define CALL_END(k)             (k)->host.end_chain((k)->host.ctx)
#define CALL_ERROR(k, c, r)     do { if ((k)->host.error) (k)->host.error((k)->host.ctx, (c), (r)); } while (0)
#define CALL_SCHEDULE(k)        do { if ((k)->host.schedule) (k)->host.schedule((k)->host.ctx); } while (0)
#define CALL_DECLINE(k, r)      do { if ((k)->host.decline) (k)->host.decline((k)->host.ctx, (r)); } while (0)
double sin(double); double cos(double); double tan(double);   /* libm, linked by the host */
#define dk_sin sin
#define dk_cos cos
#define dk_tan tan
#endif

/* ── rule state ─────────────────────────────────────────────────────────── */
#define ST_QUEUED     1
#define ST_DEAD       2
#define ST_SUSPENDED  4
#define ST_REWIRE     8
#define ST_UNLANDED  16   /* never run: a JS Constraint subscribes only once it has run */

typedef struct { uint32_t base, parent, nslots; } Elem;

typedef struct {
  int32_t  target;
  uint32_t elem;
  uint8_t  kind, flags, state, phase;
  uint32_t edge0, nedge;      /* static edges (image rules) into k->edges */
  uint32_t code0, ncode;      /* EXPR bytecode into k->code */
  uint32_t body;              /* host body id */
  uint32_t stamp, runs;
  uint32_t dyn_head;          /* this rule's dynamic dep nodes (NONE = none) */
  uint32_t serial;            /* the run during which cell_mark == serial means "already tracked" */
  int32_t  owns;              /* the cell this rule OWNS (kernel_own; -1 none): the pull's key, cleared at dispose */
} Rule;

/* A dynamic edge: on the cell's subscriber list and on the rule's dep list. */
typedef struct { uint32_t rule, cell, next_cell, prev_cell, next_rule; } Node;

struct dk_kernel {
  dk_host host;
  /* capacities */
  uint32_t cell_cap, rule_cap, elem_cap, node_cap;
  /* counts */
  uint32_t ncells, nrules, nelems, nedges_static, ncode, nconsts;
  uint32_t nstatic;           /* the image's cells: the only ones with static (CSR) subscribers */
  uint32_t node_hw;           /* nodes handed out so far: the free list, then fresh ones */
  /* tables */
  double   *slots;
  uint8_t  *cell_kind;        /* DK_F64 / DK_REF, bit 7 = structural */
  uint8_t  *cell_set;         /* author-set mark */
  int32_t  *cell_owner;       /* rule id or -1 */
  uint32_t *cell_elem;
  uint8_t  *cell_dirty;
  uint32_t *dirty_list; uint32_t ndirty;
  uint32_t *cell_dyn;         /* head node of the cell's dynamic subscribers */
  uint32_t *cell_dyn_tail;    /* … and its tail: subscribers wake in LINK order (the JS core's Set order) */
  uint32_t *cell_mark;        /* dedupe for kernel_track: the serial of the run that last tracked it */
  uint32_t serial;
  Elem     *elems;
  Rule     *rules;
  uint32_t *sub_off;          /* CSR: static subscribers per cell (image rules) */
  uint32_t *sub;
  uint32_t *edges;            /* static edge cells, per image rule */
  uint32_t *code;
  double   *consts;
  Node     *nodes; uint32_t node_free, nodes_used;
  /* the scheduler */
  uint32_t *q[2]; uint32_t qhead[2], qtail[2], qcap;
  uint32_t *fill;
  uint32_t *ring; uint32_t ring_cap; uint32_t ring_count;
  uint32_t *tring; uint32_t tring_cap; uint32_t tring_count;   /* the track ring */
  dk_view_layout vl; int vl_set; uint32_t dpr_cell;
  uint32_t code_cap, const_cap;            /* arenas (image + runtime) */
  uint8_t  *cell_kdirty; uint32_t *kdirty_list; uint32_t nkdirty;
  uint32_t view_free;
  uint32_t stamp;
  int32_t  active;
  int      flushing;
  int      pending;
  int      aborted;
  uint32_t cell_free;         /* free-list head over cell_owner (-2 - next) */
  uint32_t rule_free;         /* free-list head over Rule.dyn_head           */
};

/* ── freestanding helpers ───────────────────────────────────────────────── */
static void zero(void *p, uint32_t n) { uint8_t *b = (uint8_t *)p; for (uint32_t i = 0; i < n; i++) b[i] = 0; }
static uint32_t rd32(const uint8_t *p) { return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24); }
static double rdf64(const uint8_t *p) {
  union { uint64_t u; double d; } u;
  u.u = (uint64_t)rd32(p) | ((uint64_t)rd32(p + 4) << 32);
  return u.d;
}
static uint32_t align8(uint32_t n) { return (n + 7u) & ~7u; }

/* ── the image ──────────────────────────────────────────────────────────── */
typedef struct {
  uint32_t nelems, ncells, nrules, nedges, ncode, nconsts;
  const uint8_t *cells, *elems, *rules, *edges, *code, *consts, *init;
} Image;

static int read_image(const void *image, uint32_t bytes, Image *im) {
  const uint8_t *p = (const uint8_t *)image;
  if (bytes < 32 || rd32(p) != DK_MAGIC || rd32(p + 4) != DK_VERSION) return DK_ERR_IMAGE;
  im->nelems = rd32(p + 8); im->ncells = rd32(p + 12); im->nrules = rd32(p + 16);
  im->nedges = rd32(p + 20); im->ncode = rd32(p + 24); im->nconsts = rd32(p + 28);
  uint32_t o = 32;
  im->cells  = p + o; o += align8(im->ncells);
  im->elems  = p + o; o += align8(12 * im->nelems);
  im->rules  = p + o; o += align8(28 * im->nrules);
  im->edges  = p + o; o += align8(4 * im->nedges);
  im->code   = p + o; o += align8(4 * im->ncode);
  im->consts = p + o; o += align8(8 * im->nconsts);
  im->init   = p + o; o += align8(8 * im->ncells);
  return o <= bytes ? DK_OK : DK_ERR_IMAGE;
}

/* The arena layout, computed once for sizing and once for placing. */
typedef struct { uint32_t off; uint8_t *base; } Bump;
static void *take(Bump *b, uint32_t bytes) {
  void *p = b->base ? b->base + b->off : (void *)0;
  b->off += align8(bytes);
  return p;
}

static uint32_t layout(dk_kernel **out, const Image *im, const dk_caps *caps, uint8_t *base) {
  Bump b = { 0, base };
  uint32_t cells = im->ncells + caps->extra_cells, rules = im->nrules + caps->extra_rules;
  uint32_t elems = im->nelems + caps->extra_elems, nodes = caps->dyn_edges;
  uint32_t qcap = rules + 1;
  dk_kernel *k = (dk_kernel *)take(&b, sizeof(dk_kernel));
  double   *slots = (double *)take(&b, 8 * cells);
  uint8_t  *kind = (uint8_t *)take(&b, cells), *set = (uint8_t *)take(&b, cells), *dirty = (uint8_t *)take(&b, cells);
  int32_t  *owner = (int32_t *)take(&b, 4 * cells);
  uint32_t *celem = (uint32_t *)take(&b, 4 * cells), *dlist = (uint32_t *)take(&b, 4 * cells), *cdyn = (uint32_t *)take(&b, 4 * cells);
  uint32_t *ctail = (uint32_t *)take(&b, 4 * cells), *cmark = (uint32_t *)take(&b, 4 * cells);
  Elem     *el = (Elem *)take(&b, sizeof(Elem) * elems);
  Rule     *ru = (Rule *)take(&b, sizeof(Rule) * rules);
  uint32_t *soff = (uint32_t *)take(&b, 4 * (im->ncells + 1)), *sub = (uint32_t *)take(&b, 4 * im->nedges);
  uint32_t code_cap = im->ncode + caps->code_words, const_cap = im->nconsts + caps->consts;
  uint32_t *edges = (uint32_t *)take(&b, 4 * im->nedges), *code = (uint32_t *)take(&b, 4 * code_cap);
  double   *consts = (double *)take(&b, 8 * const_cap);
  uint8_t  *kdirty = (uint8_t *)take(&b, cells); uint32_t *kdlist = (uint32_t *)take(&b, 4 * cells);
  Node     *nd = (Node *)take(&b, sizeof(Node) * nodes);
  uint32_t *q0 = (uint32_t *)take(&b, 4 * qcap), *q1 = (uint32_t *)take(&b, 4 * qcap);
  uint32_t *fill = (uint32_t *)take(&b, 4 * (im->ncells + 1));   /* load-time scratch for the CSR */
  uint32_t ring_cap = caps->ring ? caps->ring : 4096;
  uint32_t *ring = (uint32_t *)take(&b, 4 * ring_cap);
  uint32_t tring_cap = caps->track_ring ? caps->track_ring : 4096;
  uint32_t *tring = (uint32_t *)take(&b, 4 * tring_cap);
  if (base) {
    zero(k, sizeof(dk_kernel));
    k->cell_cap = cells; k->rule_cap = rules; k->elem_cap = elems; k->node_cap = nodes;
    k->slots = slots; k->cell_kind = kind; k->cell_set = set; k->cell_dirty = dirty; k->cell_owner = owner;
    k->cell_elem = celem; k->dirty_list = dlist; k->cell_dyn = cdyn; k->cell_dyn_tail = ctail; k->cell_mark = cmark; k->elems = el; k->rules = ru;
    k->sub_off = soff; k->sub = sub; k->edges = edges; k->code = code; k->consts = consts;
    k->nodes = nd; k->q[0] = q0; k->q[1] = q1; k->qcap = qcap; k->fill = fill;
    k->ring = ring; k->ring_cap = ring_cap; k->ring_count = 0;
    k->tring = tring; k->tring_cap = tring_cap; k->tring_count = 0;
    k->code_cap = code_cap; k->const_cap = const_cap; k->cell_kdirty = kdirty; k->kdirty_list = kdlist; k->nkdirty = 0;
    k->vl_set = 0; k->dpr_cell = NONE; k->view_free = NONE;
    *out = k;
  }
  return b.off;
}

uint32_t kernel_arena_size(const void *image, uint32_t bytes, const dk_caps *caps) {
  Image im; dk_kernel *k = 0;
  if (read_image(image, bytes, &im) != DK_OK) return 0;
  return layout(&k, &im, caps, (uint8_t *)0);
}

static uint32_t elem_of(dk_kernel *k, int32_t cell) { return cell < 0 ? NONE : k->cell_elem[cell]; }

dk_kernel *kernel_load(const void *image, uint32_t bytes, const dk_caps *caps,
                       void *arena, uint32_t arena_bytes, const dk_host *host) {
  Image im; dk_kernel *k = 0;
  if (read_image(image, bytes, &im) != DK_OK) return 0;
  uint32_t need = layout(&k, &im, caps, (uint8_t *)0);
  if (need > arena_bytes) return 0;
  layout(&k, &im, caps, (uint8_t *)arena);
  if (host) k->host = *host;
  k->ncells = im.ncells; k->nrules = im.nrules; k->nelems = im.nelems;
  k->nedges_static = im.nedges; k->ncode = im.ncode; k->nconsts = im.nconsts;
  k->active = -1; k->cell_free = NONE; k->rule_free = NONE;
  k->nstatic = im.ncells; k->node_hw = 0;
  /* ONLY the image's cells are initialized here: runtime cells are set up by
   * kernel_add_cell as they are handed out, so the capacity beyond the image
   * is reserved address space the host never has to touch. */
  for (uint32_t i = 0; i < im.ncells; i++) { k->cell_owner[i] = -1; k->cell_dyn[i] = NONE; k->cell_dyn_tail[i] = NONE; k->cell_mark[i] = 0; k->cell_set[i] = 0; k->cell_dirty[i] = 0; k->cell_kdirty[i] = 0; }
  for (uint32_t i = 0; i < im.nelems; i++) {
    const uint8_t *p = im.elems + 12 * i;
    k->elems[i].base = rd32(p); k->elems[i].parent = rd32(p + 4); k->elems[i].nslots = rd32(p + 8);
    for (uint32_t s = 0; s < k->elems[i].nslots; s++) k->cell_elem[k->elems[i].base + s] = i;
  }
  for (uint32_t c = 0; c < im.ncells; c++) { k->cell_kind[c] = im.cells[c]; k->slots[c] = rdf64(im.init + 8 * c); }
  for (uint32_t i = 0; i < im.nedges; i++) k->edges[i] = rd32(im.edges + 4 * i);
  for (uint32_t i = 0; i < im.ncode; i++) k->code[i] = rd32(im.code + 4 * i);
  for (uint32_t i = 0; i < im.nconsts; i++) k->consts[i] = rdf64(im.consts + 8 * i);
  /* rules, and the CSR of static subscribers (counting sort by cell) */
  for (uint32_t c = 0; c <= im.ncells; c++) k->sub_off[c] = 0;
  for (uint32_t i = 0; i < im.nrules; i++) {
    const uint8_t *p = im.rules + 28 * i; Rule *r = &k->rules[i];
    r->target = (int32_t)rd32(p); r->kind = p[4]; r->flags = p[5]; r->state = ST_UNLANDED;
    r->phase = (r->flags & DK_PHASE1) ? 1 : 0;
    r->edge0 = rd32(p + 8); r->nedge = rd32(p + 12); r->code0 = rd32(p + 16); r->ncode = rd32(p + 20); r->body = rd32(p + 24);
    r->stamp = 0; r->runs = 0; r->dyn_head = NONE; r->serial = 0; r->owns = -1;
    r->elem = elem_of(k, r->target);
    if (r->target >= (int32_t)k->ncells || r->edge0 + r->nedge > im.nedges || r->code0 + r->ncode > im.ncode) return 0;
    for (uint32_t e = 0; e < r->nedge; e++) { uint32_t c = k->edges[r->edge0 + e]; if (c >= k->ncells) return 0; k->sub_off[c + 1]++; }
  }
  for (uint32_t c = 0; c < im.ncells; c++) k->sub_off[c + 1] += k->sub_off[c];
  {
    uint32_t *fill = k->fill;
    for (uint32_t c = 0; c < im.ncells; c++) fill[c] = k->sub_off[c];
    for (uint32_t i = 0; i < im.nrules; i++) {
      Rule *r = &k->rules[i];
      for (uint32_t e = 0; e < r->nedge; e++) k->sub[fill[k->edges[r->edge0 + e]]++] = i;
    }
  }
  k->node_free = NONE;   /* nodes come from the high-water mark until one is freed */
  return k;
}

double *kernel_table(dk_kernel *k) { return k->slots; }
uint32_t kernel_cells(dk_kernel *k) { return k->ncells; }
uint32_t kernel_rules(dk_kernel *k) { return k->nrules; }
uint32_t kernel_elems(dk_kernel *k) { return k->nelems; }
uint32_t kernel_cell(dk_kernel *k, uint32_t elem, uint32_t slot) { return k->elems[elem].base + slot; }
int32_t kernel_active(dk_kernel *k) { return k->active; }
int32_t *kernel_active_ptr(dk_kernel *k) { return &k->active; }
/* Work outstanding: a scheduled settle, unflushed writes, or — inside a settle —
 * rules still queued (the table lags the world until they run). */
int kernel_pending(dk_kernel *k) { return k->pending || k->ring_count > 0 || k->qhead[0] != k->qtail[0] || k->qhead[1] != k->qtail[1]; }
int kernel_is_set(dk_kernel *k, uint32_t cell) { return cell < k->ncells ? k->cell_set[cell] : 0; }
int32_t kernel_owner(dk_kernel *k, uint32_t cell) { return cell < k->ncells ? k->cell_owner[cell] : -1; }

/* ── dynamic edges ──────────────────────────────────────────────────────── */
static void drain_track(dk_kernel *k);
static int link(dk_kernel *k, uint32_t rule, uint32_t cell) {
  uint32_t n;
  if (k->node_free != NONE) { n = k->node_free; k->node_free = k->nodes[n].next_rule; }
  else { if (k->node_hw >= k->node_cap) return DK_ERR_FULL; n = k->node_hw++; }
  Node *nd = &k->nodes[n];
  nd->rule = rule; nd->cell = cell;
  nd->next_cell = NONE; nd->prev_cell = k->cell_dyn_tail[cell];
  if (k->cell_dyn[cell] == NONE) k->cell_dyn[cell] = n; else k->nodes[k->cell_dyn_tail[cell]].next_cell = n;
  k->cell_dyn_tail[cell] = n;
  nd->next_rule = k->rules[rule].dyn_head; k->rules[rule].dyn_head = n;
  k->nodes_used++;
  return DK_OK;
}

/* Take a node out of its cell's list: O(1), both directions linked. */
static void unlink_cell(dk_kernel *k, uint32_t n) {
  Node *nd = &k->nodes[n];
  if (nd->prev_cell == NONE) k->cell_dyn[nd->cell] = nd->next_cell; else k->nodes[nd->prev_cell].next_cell = nd->next_cell;
  if (nd->next_cell == NONE) k->cell_dyn_tail[nd->cell] = nd->prev_cell; else k->nodes[nd->next_cell].prev_cell = nd->prev_cell;
}

static void unlink_all(dk_kernel *k, uint32_t rule) {
  Rule *r = &k->rules[rule];
  uint32_t n = r->dyn_head;
  while (n != NONE) {
    Node *nd = &k->nodes[n];
    uint32_t next = nd->next_rule;
    unlink_cell(k, n);
    nd->next_rule = k->node_free; k->node_free = n; k->nodes_used--;
    n = next;
  }
  r->dyn_head = NONE;
}

int kernel_track(dk_kernel *k, uint32_t cell) {
  if (k->active < 0 || cell >= k->ncells) return DK_OK;
  /* coalesce: a body reading one cell many times links it once — O(1) via
   * the cell's mark (the serial of the run that last linked it) */
  uint32_t serial = k->rules[k->active].serial;
  if (k->cell_mark[cell] == serial) return DK_OK;
  k->cell_mark[cell] = serial;
  return link(k, (uint32_t)k->active, cell);
}

/* ── the scheduler ──────────────────────────────────────────────────────── */
static void enqueue(dk_kernel *k, uint32_t rule) {
  uint32_t ph = k->rules[rule].phase;
  k->q[ph][k->qtail[ph]] = rule;
  k->qtail[ph] = (k->qtail[ph] + 1) % k->qcap;
  if (!k->flushing && !k->pending) { k->pending = 1; CALL_SCHEDULE(k); }
}

static void invalidate(dk_kernel *k, uint32_t rule, uint32_t from_cell) {
  Rule *r = &k->rules[rule];
  if (from_cell != NONE && (k->cell_kind[from_cell] & 0x80)) r->state |= ST_REWIRE;
  if (r->state & (ST_QUEUED | ST_DEAD | ST_SUSPENDED | ST_UNLANDED)) return;
  r->state |= ST_QUEUED;
  enqueue(k, rule);
}

void kernel_invalidate(dk_kernel *k, uint32_t rule) { drain_track(k); if (rule < k->nrules) invalidate(k, rule, NONE); }

static void wake(dk_kernel *k, uint32_t cell) {
  if (cell < k->ncells) {
    if (cell < k->nstatic)
      for (uint32_t i = k->sub_off[cell]; i < k->sub_off[cell + 1]; i++) invalidate(k, k->sub[i], cell);
    for (uint32_t n = k->cell_dyn[cell]; n != NONE; n = k->nodes[n].next_cell) invalidate(k, k->nodes[n].rule, cell);
  }
}

static void mark_dirty(dk_kernel *k, uint32_t cell) {
  if (!k->cell_dirty[cell]) { k->cell_dirty[cell] = 1; k->dirty_list[k->ndirty++] = cell; }
}

/* The write ring: every id the host appended is a cell whose value changed
 * (F64, gated in the table by the host) or a REF cell that moved. */
static void drain(dk_kernel *k) {
  uint32_t n = k->ring_count;
  if (n == 0) return;
  if (n > k->ring_cap) n = k->ring_cap;
  k->ring_count = 0;
  for (uint32_t i = 0; i < n; i++) {
    uint32_t cell = k->ring[i];
    if (cell >= k->ncells) continue;
    if ((k->cell_kind[cell] & 0x7f) == DK_F64) mark_dirty(k, cell);
    wake(k, cell);
  }
}

uint32_t *kernel_ring(dk_kernel *k, uint32_t *capacity_out) { if (capacity_out) *capacity_out = k->ring_cap; return k->ring; }
uint32_t *kernel_track_ring(dk_kernel *k, uint32_t *capacity_out) { if (capacity_out) *capacity_out = k->tring_cap; return k->tring; }
uint32_t *kernel_track_count(dk_kernel *k) { return &k->tring_count; }
/* Link every cell the host appended since the last drain to the ACTIVE rule. */
static void drain_track(dk_kernel *k) {
  uint32_t n = k->tring_count;
  if (n == 0) return;
  if (n > k->tring_cap) n = k->tring_cap;
  k->tring_count = 0;
  if (k->active < 0) return;
  for (uint32_t i = 0; i < n; i++) kernel_track(k, k->tring[i]);
}
uint32_t *kernel_ring_count(dk_kernel *k) { return &k->ring_count; }
void kernel_flush(dk_kernel *k) { drain_track(k); drain(k); }

/* the one write path: gate, store, dirty, wake */
static int set_value(dk_kernel *k, uint32_t cell, double v) {
  if (cell >= k->ncells) return DK_ERR_BAD;
  if ((k->cell_kind[cell] & 0x7f) != DK_F64) { wake(k, cell); return DK_OK; }
  if (k->slots[cell] == v) return DK_OK;           /* === : NaN never gates */
  k->slots[cell] = v;
  mark_dirty(k, cell);
  if (!k->cell_kdirty[cell]) { k->cell_kdirty[cell] = 1; k->kdirty_list[k->nkdirty++] = cell; }
  wake(k, cell);
  return DK_OK;
}

uint32_t kernel_kdirty(dk_kernel *k, uint32_t *out, uint32_t cap) {
  uint32_t n = k->nkdirty;
  for (uint32_t i = 0; i < n; i++) { if (i < cap) out[i] = k->kdirty_list[i]; k->cell_kdirty[k->kdirty_list[i]] = 0; }
  k->nkdirty = 0;
  return n;
}

int kernel_set(dk_kernel *k, uint32_t cell, double v) {
  drain_track(k);
  /* a host write: the host pushed already, so not a kernel-written cell */
  int r = set_value(k, cell, v);
  if (r == DK_OK && cell < k->ncells && k->cell_kdirty[cell] && k->nkdirty > 0 && k->kdirty_list[k->nkdirty - 1] == cell) { k->cell_kdirty[cell] = 0; k->nkdirty--; }
  return r;
}
void kernel_touch(dk_kernel *k, uint32_t cell) { drain_track(k); if (cell < k->ncells) wake(k, cell); }

static void free_rule(dk_kernel *k, uint32_t rule) {
  Rule *r = &k->rules[rule];
  r->dyn_head = k->rule_free; k->rule_free = rule;
}

void kernel_dispose(dk_kernel *k, uint32_t rule) {
  if (rule >= k->nrules) return;
  Rule *r = &k->rules[rule];
  if (r->state & ST_DEAD) return;
  r->state |= ST_DEAD;
  unlink_all(k, rule);
  if (r->owns >= 0 && k->cell_owner[r->owns] == (int32_t)rule) k->cell_owner[r->owns] = -1;
  r->owns = -1;
  if (!(r->state & ST_QUEUED)) free_rule(k, rule);   /* else: freed when its queue entry drains */
}

int kernel_write(dk_kernel *k, uint32_t cell, double v) {
  drain_track(k);
  if (cell >= k->ncells) return DK_ERR_BAD;
  int32_t owner = k->cell_owner[cell];
  if (owner >= 0) {
    if (!(k->rules[owner].flags & DK_YIELDING)) return DK_ERR_OWNED;
    kernel_dispose(k, (uint32_t)owner);
    k->cell_owner[cell] = -1;
  }
  k->cell_set[cell] = 1;
  int r = set_value(k, cell, v);
  if (r == DK_OK && k->cell_kdirty[cell] && k->nkdirty > 0 && k->kdirty_list[k->nkdirty - 1] == cell) { k->cell_kdirty[cell] = 0; k->nkdirty--; }
  return r;
}

int kernel_own(dk_kernel *k, uint32_t cell, uint32_t rule) {
  if (cell >= k->ncells || rule >= k->nrules) return DK_ERR_BAD;
  int32_t prior = k->cell_owner[cell];
  if (prior >= 0 && (k->rules[prior].flags & DK_YIELDING)) { kernel_dispose(k, (uint32_t)prior); }
  else if (prior >= 0) return DK_ERR_BOUND;
  k->cell_owner[cell] = (int32_t)rule;
  k->rules[rule].owns = (int32_t)cell;
  return DK_OK;
}

void kernel_release(dk_kernel *k, uint32_t cell, uint32_t rule) {
  if (cell < k->ncells && k->cell_owner[cell] == (int32_t)rule) k->cell_owner[cell] = -1;
}

/* ── EXPR ───────────────────────────────────────────────────────────────── */
#define STACK 64
static double eval(dk_kernel *k, const Rule *r) {
  double st[STACK]; uint32_t sp = 0;
  const uint32_t *c = k->code + r->code0, *end = c + r->ncode;
#define POP() (st[--sp])
#define PUSH(x) do { if (sp < STACK) st[sp++] = (x); } while (0)
#define BIN(expr) do { double b = POP(), a = POP(); PUSH(expr); } while (0)
  while (c < end) {
    switch (*c++) {
      case DK_OP_END: goto done;
      case DK_OP_LOAD: { uint32_t cell = *c++; PUSH(cell < k->ncells ? k->slots[cell] : 0.0); break; }
      case DK_OP_CONST: { uint32_t i = *c++; PUSH(i < k->nconsts ? k->consts[i] : 0.0); break; }
      case DK_OP_ADD: BIN(a + b); break;
      case DK_OP_SUB: BIN(a - b); break;
      case DK_OP_MUL: BIN(a * b); break;
      case DK_OP_DIV: BIN(a / b); break;
      case DK_OP_MOD: BIN(a - b * __builtin_trunc(a / b)); break;
      case DK_OP_NEG: { double a = POP(); PUSH(-a); break; }
      case DK_OP_MIN: BIN(a < b ? a : (b < a ? b : (a != a ? a : b))); break;
      case DK_OP_MAX: BIN(a > b ? a : (b > a ? b : (a != a ? a : b))); break;
      case DK_OP_ABS: { double a = POP(); PUSH(__builtin_fabs(a)); break; }
      case DK_OP_FLOOR: { double a = POP(); PUSH(__builtin_floor(a)); break; }
      case DK_OP_CEIL: { double a = POP(); PUSH(__builtin_ceil(a)); break; }
      case DK_OP_ROUND: { double a = POP(); PUSH(__builtin_floor(a + 0.5)); break; }   /* Math.round */
      case DK_OP_SQRT: { double a = POP(); PUSH(__builtin_sqrt(a)); break; }
      case DK_OP_LT: BIN(a < b ? 1.0 : 0.0); break;
      case DK_OP_LE: BIN(a <= b ? 1.0 : 0.0); break;
      case DK_OP_GT: BIN(a > b ? 1.0 : 0.0); break;
      case DK_OP_GE: BIN(a >= b ? 1.0 : 0.0); break;
      case DK_OP_EQ: BIN(a == b ? 1.0 : 0.0); break;
      case DK_OP_NE: BIN(a != b ? 1.0 : 0.0); break;
      /* JS truthiness: 0, -0 and NaN are false */
#define TRUTHY(x) ((x) == (x) && (x) != 0.0)
      case DK_OP_AND: BIN((TRUTHY(a) && TRUTHY(b)) ? 1.0 : 0.0); break;
      case DK_OP_OR: BIN((TRUTHY(a) || TRUTHY(b)) ? 1.0 : 0.0); break;
      case DK_OP_NOT: { double a = POP(); PUSH(TRUTHY(a) ? 0.0 : 1.0); break; }
      case DK_OP_SELECT: { double b = POP(), a = POP(), cnd = POP(); PUSH(TRUTHY(cnd) ? a : b); break; }
      case DK_OP_CLAMP: { double hi = POP(), lo = POP(), x = POP(); PUSH(x < lo ? lo : (x > hi ? hi : x)); break; }
      default: goto done;
    }
  }
done:
  return sp ? st[sp - 1] : 0.0;
#undef POP
#undef PUSH
#undef BIN
}

/* ── run ────────────────────────────────────────────────────────────────── */
static double vis_run(dk_kernel *k, Rule *r);
static double extent_run(dk_kernel *k, Rule *r);
static void apply(dk_kernel *k, Rule *r, double v) {
  if (r->target < 0) return;                          /* the host applied it */
  uint32_t cell = (uint32_t)r->target;
  if ((k->cell_kind[cell] & 0x7f) == DK_REF) { if (v != 0.0) wake(k, cell); return; }
  set_value(k, cell, v);
}

static int run(dk_kernel *k, uint32_t rule) {
  Rule *r = &k->rules[rule];
  double v;
  drain_track(k);   /* reads appended by the rule that is active now (a nested run) link to it before we switch */
  drain(k);   /* writes the host made since the last drain wake their dependents before this run */
  switch (r->kind) {
    case DK_EXPR: v = eval(k, r); break;
    case DK_BODY: v = CALL_BODY(k, rule, r->elem, r->target); break;
    case DK_VIS: v = vis_run(k, r); break;
    case DK_EXTENT: v = extent_run(k, r); break;
    case DK_DYNAMIC: {
      unlink_all(k, rule);
      r->serial = ++k->serial; if (r->serial == 0) r->serial = ++k->serial;   /* 0 = never */
      int32_t prev = k->active; k->active = (int32_t)rule;
      v = CALL_BODY(k, rule, r->elem, r->target);
      drain_track(k);   /* the body's reads, appended while it ran */
      k->active = prev;
      break;
    }
    default: return DK_ERR_BAD;
  }
  r->state &= (uint8_t)~(ST_REWIRE | ST_UNLANDED);
  apply(k, r, v);
  drain(k);   /* … and the writes the body made wake theirs */
  return DK_OK;
}

/* THE PULL. A host-initiated run (a rule's first evaluation at bind, in the
 * install batch) reads cells whose OWNING rules may still be queued — their
 * inputs moved and the settle that recomputes them has not come. Running those
 * first, in dependency order, gives the rule its inputs' current values: the
 * first computed value a spring primes from, or an init handler reads, is the
 * value the world settles to. Settle-time runs keep the queue's order. */
static int run_queued(dk_kernel *k, uint32_t rule);
static int pull(dk_kernel *k, uint32_t rule, int depth) {
  if (depth > 64) return DK_OK;
  Rule *r = &k->rules[rule];
  for (uint32_t i = 0; i < r->nedge; i++) {
    int32_t o = k->cell_owner[k->edges[r->edge0 + i]];
    if (o >= 0 && (uint32_t)o != rule && (k->rules[o].state & ST_QUEUED) && !(k->rules[o].state & (ST_DEAD | ST_SUSPENDED))) { int e = pull(k, (uint32_t)o, depth + 1); if (e != DK_OK) return e; e = run_queued(k, (uint32_t)o); if (e != DK_OK) return e; }
  }
  for (uint32_t n = r->dyn_head; n != NONE; n = k->nodes[n].next_rule) {
    int32_t o = k->cell_owner[k->nodes[n].cell];
    if (o >= 0 && (uint32_t)o != rule && (k->rules[o].state & ST_QUEUED) && !(k->rules[o].state & (ST_DEAD | ST_SUSPENDED))) { int e = pull(k, (uint32_t)o, depth + 1); if (e != DK_OK) return e; e = run_queued(k, (uint32_t)o); if (e != DK_OK) return e; }
  }
  return DK_OK;
}
int kernel_run(dk_kernel *k, uint32_t rule) {
  if (rule >= k->nrules) return DK_ERR_BAD;
  drain(k);
  int e = pull(k, rule, 0);
  if (e != DK_OK) return e;
  return run(k, rule);
}

void kernel_suspend(dk_kernel *k, uint32_t rule) {
  if (rule >= k->nrules) return;
  Rule *r = &k->rules[rule];
  r->state |= ST_SUSPENDED; r->state &= (uint8_t)~ST_QUEUED;
  unlink_all(k, rule);
  r->state |= ST_REWIRE;
}

int kernel_resume(dk_kernel *k, uint32_t rule) {
  if (rule >= k->nrules) return DK_ERR_BAD;
  Rule *r = &k->rules[rule];
  if (!(r->state & ST_SUSPENDED)) return DK_OK;
  r->state &= (uint8_t)~ST_SUSPENDED;
  return run(k, rule);
}

static int run_queued(dk_kernel *k, uint32_t rule) {
  Rule *r = &k->rules[rule];
  if (!(r->state & ST_QUEUED)) return DK_OK;   /* a stale queue entry: the pull ran it already */
  r->state &= (uint8_t)~ST_QUEUED;
  if (r->state & ST_DEAD) { free_rule(k, rule); return DK_OK; }
  if (r->state & ST_SUSPENDED) return DK_OK;
  if (r->stamp != k->stamp) { r->stamp = k->stamp; r->runs = 0; }
  if (++r->runs > DK_CYCLE_LIMIT) return DK_ERR_CYCLE;
  return run(k, rule);
}

static void abandon(dk_kernel *k) {
  for (int ph = 0; ph < 2; ph++) {
    for (uint32_t i = k->qhead[ph]; i != k->qtail[ph]; i = (i + 1) % k->qcap) {
      Rule *r = &k->rules[k->q[ph][i]];
      r->state &= (uint8_t)~ST_QUEUED;
      if (r->state & ST_DEAD) free_rule(k, k->q[ph][i]);
    }
    k->qhead[ph] = k->qtail[ph] = 0;
  }
}

int32_t kernel_settle(dk_kernel *k) {
  if (k->flushing) return 0;
  k->pending = 0; k->aborted = 0;
  k->flushing = 1;
  drain(k);
  int32_t runs = 0; int err = DK_OK; uint32_t bad = NONE;
  for (uint32_t passes = 0;;) {
    k->stamp++;
    for (;;) {
      int ph = k->qhead[0] != k->qtail[0] ? 0 : (k->qhead[1] != k->qtail[1] ? 1 : -1);
      if (ph < 0) break;
      uint32_t rule = k->q[ph][k->qhead[ph]];
      k->qhead[ph] = (k->qhead[ph] + 1) % k->qcap;
      runs++;
      err = run_queued(k, rule);
      if (err != DK_OK) { bad = rule; goto out; }
      if (k->aborted) { err = DK_ERR_ABORT; bad = rule; goto out; }
    }
    if (k->aborted) { err = DK_ERR_ABORT; goto out; }
    if (!CALL_AFTER(k)) {
      if (k->aborted) { err = DK_ERR_ABORT; goto out; }
      int fired = CALL_CHANGES(k);
      drain(k);
      if (!fired && k->qhead[0] == k->qtail[0] && k->qhead[1] == k->qtail[1]) break;
      if (k->aborted) { err = DK_ERR_ABORT; goto out; }
      if (++passes > DK_AFTER_LIMIT) { err = DK_ERR_AFTER; goto out; }
      continue;
    }
    drain(k);
    if (++passes > DK_AFTER_LIMIT) { err = DK_ERR_AFTER; goto out; }
  }
out:
  k->flushing = 0; k->aborted = 0;
  abandon(k);
  CALL_END(k);
  if (err != DK_OK) { CALL_ERROR(k, err, bad); return err; }
  return runs;
}

uint32_t kernel_dirty(dk_kernel *k, uint32_t *out, uint32_t cap) {
  uint32_t n = k->ndirty;
  for (uint32_t i = 0; i < n; i++) { if (i < cap) out[i] = k->dirty_list[i]; k->cell_dirty[k->dirty_list[i]] = 0; }
  k->ndirty = 0;
  return n;
}

int32_t kernel_add_rule(dk_kernel *k, int32_t target, uint8_t kind, uint8_t flags,
                        const uint32_t *edges, uint32_t nedges,
                        const uint32_t *code, uint32_t ncode, uint32_t body) {
  if (target >= (int32_t)k->ncells) return DK_ERR_BAD;
  uint32_t code0 = 0;
  if (kind == DK_EXPR) {
    code0 = (uint32_t)(uintptr_t)code;   /* an offset from kernel_add_code */
    if (code0 + ncode > k->ncode) return DK_ERR_BAD;
  }
  uint32_t id;
  if (k->rule_free != NONE) { id = k->rule_free; k->rule_free = k->rules[id].dyn_head; }
  else { if (k->nrules >= k->rule_cap) return DK_ERR_FULL; id = k->nrules++; }
  Rule *r = &k->rules[id];
  r->target = target; r->elem = elem_of(k, target); r->kind = kind; r->flags = flags; r->state = 0;
  r->phase = (flags & DK_PHASE1) ? 1 : 0;
  r->edge0 = 0; r->nedge = 0; r->code0 = code0; r->ncode = kind == DK_EXPR ? ncode : 0; r->body = body;
  r->stamp = 0; r->runs = 0; r->dyn_head = NONE; r->serial = 0; r->owns = -1;
  for (uint32_t i = 0; i < nedges; i++) {
    if (edges[i] >= k->ncells) { r->state |= ST_DEAD; return DK_ERR_BAD; }
    int e = link(k, id, edges[i]);
    if (e != DK_OK) { unlink_all(k, id); r->state |= ST_DEAD; return e; }
  }
  return (int32_t)id;
}

/* ── runtime cells, rewiring, state, abort ──────────────────────────────── */
int32_t kernel_add_cell(dk_kernel *k, uint8_t kind, int structural) {
  uint32_t id;
  if (k->cell_free != NONE) { id = k->cell_free; k->cell_free = (uint32_t)(-2 - k->cell_owner[id]); }
  else { if (k->ncells >= k->cell_cap) return DK_ERR_FULL; id = k->ncells++; }
  k->cell_kind[id] = (uint8_t)((kind & 0x7f) | (structural ? 0x80 : 0));
  k->cell_owner[id] = -1; k->cell_set[id] = 0; k->cell_dirty[id] = 0; k->cell_dyn[id] = NONE; k->cell_dyn_tail[id] = NONE; k->cell_mark[id] = 0;
  k->cell_elem[id] = NONE; k->slots[id] = 0.0; k->cell_kdirty[id] = 0;
  return (int32_t)id;
}

void kernel_free_cell(dk_kernel *k, uint32_t cell) {
  if (cell >= k->ncells || k->cell_owner[cell] < -1) return;   /* bad or already free */
  /* drop every dynamic subscription on it (the subscribers keep their other edges) */
  uint32_t n = k->cell_dyn[cell];
  while (n != NONE) {
    Node *nd = &k->nodes[n]; uint32_t next = nd->next_cell;
    uint32_t *pp = &k->rules[nd->rule].dyn_head;
    while (*pp != NONE && *pp != n) pp = &k->nodes[*pp].next_rule;
    if (*pp == n) *pp = nd->next_rule;
    nd->next_rule = k->node_free; k->node_free = n; k->nodes_used--;
    n = next;
  }
  k->cell_dyn[cell] = NONE; k->cell_dyn_tail[cell] = NONE; k->cell_mark[cell] = 0;
  if (k->cell_dirty[cell]) k->cell_dirty[cell] = 0;   /* its entry in dirty_list drains harmlessly */
  k->cell_owner[cell] = -2 - (int32_t)k->cell_free;    /* link into the free list */
  k->cell_free = cell;
}

int kernel_rewire(dk_kernel *k, uint32_t rule, const uint32_t *edges, uint32_t nedges) {
  if (rule >= k->nrules || (k->rules[rule].state & ST_DEAD)) return DK_ERR_BAD;
  unlink_all(k, rule);
  k->rules[rule].serial = ++k->serial;
  for (uint32_t i = 0; i < nedges; i++) {
    if (edges[i] >= k->ncells) return DK_ERR_BAD;
    int e = link(k, rule, edges[i]);
    if (e != DK_OK) return e;
  }
  k->rules[rule].state &= (uint8_t)~ST_REWIRE;
  return DK_OK;
}

uint32_t kernel_state(dk_kernel *k, uint32_t rule) { return rule < k->nrules ? k->rules[rule].state : (uint32_t)ST_DEAD; }
uint8_t *kernel_state_ptr(dk_kernel *k, uint32_t *stride_out) { if (stride_out) *stride_out = (uint32_t)sizeof(Rule); return &k->rules[0].state; }
uint32_t kernel_rule_cap(dk_kernel *k) { return k->rule_cap; }
int32_t *kernel_pending_ptr(dk_kernel *k) { return &k->pending; }
uint32_t *kernel_cell_dyn_ptr(dk_kernel *k) { return k->cell_dyn; }
uint32_t kernel_static_cells(dk_kernel *k) { return k->nstatic; }
void kernel_abort(dk_kernel *k) { k->aborted = 1; }

uint32_t kernel_deps(dk_kernel *k, uint32_t rule, uint32_t *out, uint32_t cap) {
  if (rule >= k->nrules) return 0;
  const Rule *r = &k->rules[rule];
  uint32_t n = 0;
  for (uint32_t e = 0; e < r->nedge; e++) { if (n < cap) out[n] = k->edges[r->edge0 + e]; n++; }
  for (uint32_t nd = r->dyn_head; nd != NONE; nd = k->nodes[nd].next_rule) { if (n < cap) out[n] = k->nodes[nd].cell; n++; }
  return n;
}

int32_t kernel_add_cells(dk_kernel *k, uint32_t n, uint8_t kind) {
  if (n == 0) return DK_ERR_BAD;
  if (k->ncells + n > k->cell_cap) return DK_ERR_FULL;
  uint32_t base = k->ncells; k->ncells += n;
  for (uint32_t id = base; id < base + n; id++) {
    k->cell_kind[id] = (uint8_t)(kind & 0x7f);
    k->cell_owner[id] = -1; k->cell_set[id] = 0; k->cell_dirty[id] = 0; k->cell_dyn[id] = NONE; k->cell_dyn_tail[id] = NONE; k->cell_mark[id] = 0;
    k->cell_elem[id] = NONE; k->slots[id] = 0.0; k->cell_kdirty[id] = 0;
  }
  return (int32_t)base;
}

void kernel_clear_cells(dk_kernel *k, uint32_t base, uint32_t n) {
  if (base + n > k->ncells) return;
  for (uint32_t cell = base; cell < base + n; cell++) {
    uint32_t nd = k->cell_dyn[cell];
    while (nd != NONE) {
      Node *node = &k->nodes[nd]; uint32_t next = node->next_cell;
      uint32_t *pp = &k->rules[node->rule].dyn_head;
      while (*pp != NONE && *pp != nd) pp = &k->nodes[*pp].next_rule;
      if (*pp == nd) *pp = node->next_rule;
      node->next_rule = k->node_free; k->node_free = nd; k->nodes_used--;
      nd = next;
    }
    k->cell_dyn[cell] = NONE; k->cell_dyn_tail[cell] = NONE; k->cell_mark[cell] = 0;
    k->cell_owner[cell] = -1; k->cell_set[cell] = 0; k->cell_dirty[cell] = 0; k->slots[cell] = 0.0;
  }
}

/* ── views + the visibility rule ────────────────────────────────────────── */
void kernel_view_layout(dk_kernel *k, const dk_view_layout *layout) { k->vl = *layout; k->vl_set = 1; }
void kernel_view_dpr_cell(dk_kernel *k, uint32_t cell) { k->dpr_cell = cell; }

int32_t kernel_view_add(dk_kernel *k, uint32_t base, int32_t parent_view) {
  uint32_t id;
  if (k->view_free != NONE) { id = k->view_free; k->view_free = k->elems[id].nslots; }
  else { if (k->nelems >= k->elem_cap) return DK_ERR_FULL; id = k->nelems++; }
  k->elems[id].base = base; k->elems[id].parent = parent_view < 0 ? NONE : (uint32_t)parent_view; k->elems[id].nslots = 0;
  return (int32_t)id;
}
void kernel_view_parent(dk_kernel *k, uint32_t view, int32_t parent_view) {
  if (view < k->nelems) k->elems[view].parent = parent_view < 0 ? NONE : (uint32_t)parent_view;
}
void kernel_view_remove(dk_kernel *k, uint32_t view) {
  if (view >= k->nelems) return;
  k->elems[view].base = NONE; k->elems[view].parent = NONE;
  k->elems[view].nslots = k->view_free; k->view_free = view;   /* nslots doubles as the free link */
}

#define VS(view, field) (k->slots[k->elems[view].base + k->vl.field])

/* The affine walk — affine.ts fromParts/compose/boxThrough/scaleOf, term for term. */
static int vis_own(dk_kernel *k, uint32_t n, double m[6]) {   /* localAffine(n); returns 0 when identity */
  double sc = VS(n, scale), sx = VS(n, scaleX), sy = VS(n, scaleY), rot = VS(n, rotation), kx = VS(n, skewX), ky = VS(n, skewY);
  if (sc == 1 && sx == 1 && sy == 1 && rot == 0 && kx == 0 && ky == 0) return 0;
  double px = VS(n, pivotX), py = VS(n, pivotY);
  double SX = sc * sx, SY = sc * sy;
  double tkx = dk_tan((kx * 3.141592653589793) / 180), tky = dk_tan((ky * 3.141592653589793) / 180);
  double r = (rot * 3.141592653589793) / 180, cr = dk_cos(r), sr = dk_sin(r);
  double a0 = SX, b0 = tky * SX, c0 = tkx * SY, d0 = SY;
  double a = cr * a0 - sr * b0, b = sr * a0 + cr * b0;
  double c = cr * c0 - sr * d0, d = sr * c0 + cr * d0;
  m[0] = a; m[1] = b; m[2] = c; m[3] = d; m[4] = px - (a * px + c * py); m[5] = py - (b * px + d * py);
  return 1;
}
static void vis_compose(const double *m1, const double *m2, double *o) {   /* compose(m1, m2) */
  double r0 = m1[0] * m2[0] + m1[2] * m2[1], r1 = m1[1] * m2[0] + m1[3] * m2[1];
  double r2 = m1[0] * m2[2] + m1[2] * m2[3], r3 = m1[1] * m2[2] + m1[3] * m2[3];
  double r4 = m1[0] * m2[4] + m1[2] * m2[5] + m1[4], r5 = m1[1] * m2[4] + m1[3] * m2[5] + m1[5];
  o[0] = r0; o[1] = r1; o[2] = r2; o[3] = r3; o[4] = r4; o[5] = r5;
}

static double vis_run(dk_kernel *k, Rule *r) {
  uint32_t self = r->body, root = r->elem;   /* elem field carries the root view here */
  if (!k->vl_set || self >= k->nelems || k->elems[self].base == NONE) return 0;
  uint32_t b = k->elems[self].base;
  double dpr = k->dpr_cell != NONE && k->dpr_cell < k->ncells ? k->slots[k->dpr_cell] : 1;
  /* 3D anywhere on the chain: the host's walk owns this view */
  for (uint32_t n = self; n != NONE; n = k->elems[n].parent)
    if (VS(n, rotateX) != 0 || VS(n, rotateY) != 0 || VS(n, translateZ) != 0) { set_value(k, b + k->vl.visMode, 0); return 0; }
  /* rootTransform */
  double m[6] = { 1, 0, 0, 1, 0, 0 }, own[6], t[6];
  for (uint32_t n = self; n != NONE; ) {
    uint32_t p = k->elems[n].parent;
    if (vis_own(k, n, own)) { vis_compose(own, m, t); for (int i = 0; i < 6; i++) m[i] = t[i]; }
    double tr[6] = { 1, 0, 0, 1, VS(n, x), VS(n, y) };
    vis_compose(tr, m, t); for (int i = 0; i < 6; i++) m[i] = t[i];
    if (p == NONE) break;
    if (VS(p, scrollsOn) != 0 && VS(n, ignoreScroll) == 0) {
      double sc[6] = { 1, 0, 0, 1, -VS(p, scrollX), -VS(p, scrollY) };
      vis_compose(sc, m, t); for (int i = 0; i < 6; i++) m[i] = t[i];
    }
    n = p;
  }
  double scale = __builtin_sqrt(__builtin_fabs(m[0] * m[3] - m[1] * m[2]));
  /* hidden anywhere up the chain = off */
  int on = 1;
  for (uint32_t n = self; n != NONE; n = k->elems[n].parent) if (VS(n, visible) == 0) { on = 0; break; }
  double bx = 0, by = 0, bw = 0, bh = 0;
  if (on) {
    /* boxThrough(m, 0, 0, width, height) */
    double w = VS(self, width), h = VS(self, height);
    double minX = 1.0 / 0.0, minY = 1.0 / 0.0, maxX = -1.0 / 0.0, maxY = -1.0 / 0.0;
    const double px[4] = { 0, w, 0, w }, py[4] = { 0, 0, h, h };
    for (int i = 0; i < 4; i++) {
      double fx = m[0] * px[i] + m[2] * py[i] + m[4], fy = m[1] * px[i] + m[3] * py[i] + m[5];
      if (fx < minX) minX = fx; if (fx > maxX) maxX = fx;
      if (fy < minY) minY = fy; if (fy > maxY) maxY = fy;
    }
    bx = minX; by = minY; bw = maxX - minX; bh = maxY - minY;
    double rw = root < k->nelems ? VS(root, width) : 0, rh = root < k->nelems ? VS(root, height) : 0;
    double ix = bx > 0 ? bx : 0, iy = by > 0 ? by : 0;
    double iw = (bx + bw < rw ? bx + bw : rw) - ix, ih = (by + bh < rh ? by + bh : rh) - iy;
    if (iw <= 0 || ih <= 0) on = 0;
    else {
      double kk = scale == 0 ? 1 : scale;
      set_value(k, b + k->vl.visX, (ix - bx) / kk); set_value(k, b + k->vl.visY, (iy - by) / kk);
      set_value(k, b + k->vl.visW, iw / kk); set_value(k, b + k->vl.visH, ih / kk);
    }
  }
  if (!on) { set_value(k, b + k->vl.visX, 0); set_value(k, b + k->vl.visY, 0); set_value(k, b + k->vl.visW, 0); set_value(k, b + k->vl.visH, 0); }
  set_value(k, b + k->vl.onScreen, on ? 1 : 0);
  set_value(k, b + k->vl.apparentScale, scale * dpr);
  set_value(k, b + k->vl.visMode, 1);
  return 0;
}

/* The chain's read set: every slot the walk may read, on every ancestor. */
static int vis_link_chain(dk_kernel *k, uint32_t rule, uint32_t self, uint32_t root) {
  const uint32_t fields[] = { k->vl.x, k->vl.y, k->vl.visible, k->vl.scale, k->vl.scaleX, k->vl.scaleY, k->vl.rotation, k->vl.skewX, k->vl.skewY,
                              k->vl.pivotX, k->vl.pivotY, k->vl.scrollX, k->vl.scrollY, k->vl.ignoreScroll, k->vl.scrollsOn, k->vl.rotateX, k->vl.rotateY, k->vl.translateZ };
  for (uint32_t n = self; n != NONE; n = k->elems[n].parent) {
    if (k->elems[n].base == NONE) break;
    for (uint32_t i = 0; i < sizeof fields / sizeof fields[0]; i++) { int e = link(k, rule, k->elems[n].base + fields[i]); if (e != DK_OK) return e; }
  }
  int e = link(k, rule, k->elems[self].base + k->vl.width); if (e != DK_OK) return e;
  e = link(k, rule, k->elems[self].base + k->vl.height); if (e != DK_OK) return e;
  if (root < k->nelems && k->elems[root].base != NONE) {
    e = link(k, rule, k->elems[root].base + k->vl.width); if (e != DK_OK) return e;
    e = link(k, rule, k->elems[root].base + k->vl.height); if (e != DK_OK) return e;
  }
  if (k->dpr_cell != NONE) { e = link(k, rule, k->dpr_cell); if (e != DK_OK) return e; }
  return DK_OK;
}

int32_t kernel_vis_add(dk_kernel *k, uint32_t view, uint32_t root_view) {
  if (!k->vl_set || view >= k->nelems) return DK_ERR_BAD;
  int32_t id = kernel_add_rule(k, -1, DK_VIS, 0, (const uint32_t *)0, 0, (const uint32_t *)0, 0, view);
  if (id < 0) return id;
  k->rules[id].elem = root_view;
  int e = vis_link_chain(k, (uint32_t)id, view, root_view);
  if (e != DK_OK) { kernel_dispose(k, (uint32_t)id); return e; }
  return id;
}

int kernel_vis_rewire(dk_kernel *k, uint32_t rule) {
  if (rule >= k->nrules || k->rules[rule].kind != DK_VIS) return DK_ERR_BAD;
  unlink_all(k, rule);
  return vis_link_chain(k, rule, k->rules[rule].body, k->rules[rule].elem);
}

/* ── auto-extent ────────────────────────────────────────────────────────── */
#define VB(base, field) (k->slots[(base) + k->vl.field])

/* The child's own affine, by block base (vis_own by view id). */
static int own_affine(dk_kernel *k, uint32_t base, double m[6]) {
  double sc = VB(base, scale), sx = VB(base, scaleX), sy = VB(base, scaleY), rot = VB(base, rotation), kx = VB(base, skewX), ky = VB(base, skewY);
  if (sc == 1 && sx == 1 && sy == 1 && rot == 0 && kx == 0 && ky == 0) return 0;
  double px = VB(base, pivotX), py = VB(base, pivotY);
  double SX = sc * sx, SY = sc * sy;
  double tkx = dk_tan((kx * 3.141592653589793) / 180), tky = dk_tan((ky * 3.141592653589793) / 180);
  double r = (rot * 3.141592653589793) / 180, cr = dk_cos(r), sr = dk_sin(r);
  double a0 = SX, b0 = tky * SX, c0 = tkx * SY, d0 = SY;
  double a = cr * a0 - sr * b0, b = sr * a0 + cr * b0;
  double c = cr * c0 - sr * d0, d = sr * c0 + cr * d0;
  m[0] = a; m[1] = b; m[2] = c; m[3] = d; m[4] = px - (a * px + c * py); m[5] = py - (b * px + d * py);
  return 1;
}

/* The words: [ list cell | NONE, child base… ]; kept in the code arena at
 * (code0, capacity ncode), count in body; a longer list moves to a fresh
 * range of twice the size (geometric, so the arena's dead space stays bounded). */
static int extent_store(dk_kernel *k, uint32_t rule, const uint32_t *words, uint32_t n) {
  Rule *r = &k->rules[rule];
  if (n > r->ncode) {
    uint32_t cap = n * 2 > 8 ? n * 2 : 8;
    if (k->ncode + cap > k->code_cap) return DK_ERR_FULL;
    r->code0 = k->ncode; r->ncode = cap; k->ncode += cap;
  }
  for (uint32_t i = 0; i < n; i++) k->code[r->code0 + i] = words[i];
  r->body = n;
  return DK_OK;
}
static int extent_link(dk_kernel *k, uint32_t rule) {
  Rule *r = &k->rules[rule];
  const uint32_t *w = &k->code[r->code0];
  uint32_t n = r->body;
  if (n == 0) return DK_OK;
  if (w[0] != NONE && w[0] < k->ncells) { int e = link(k, rule, w[0]); if (e != DK_OK) return e; }
  const uint32_t fields[] = { k->vl.x, k->vl.y, k->vl.width, k->vl.height, k->vl.visible, k->vl.ignoreClip, k->vl.scale, k->vl.scaleX, k->vl.scaleY,
                              k->vl.rotation, k->vl.skewX, k->vl.skewY, k->vl.pivotX, k->vl.pivotY, k->vl.rotateX, k->vl.rotateY, k->vl.translateZ };
  for (uint32_t i = 1; i < n; i++)
    for (uint32_t f = 0; f < sizeof fields / sizeof fields[0]; f++) { int e = link(k, rule, w[i] + fields[f]); if (e != DK_OK) return e; }
  return DK_OK;
}
static int percent_owned(dk_kernel *k, uint32_t cell) {
  int32_t o = cell < k->ncells ? k->cell_owner[cell] : -1;
  return o >= 0 && (k->rules[o].flags & DK_PERCENT) != 0;
}
static double extent_run(dk_kernel *k, Rule *r) {
  const uint32_t *w = &k->code[r->code0];
  uint32_t n = r->body, axis = r->elem;
  double max = 0;
  for (uint32_t i = 1; i < n; i++) {
    uint32_t base = w[i];
    if (VB(base, visible) == 0 || VB(base, ignoreClip) != 0) continue;
    if (percent_owned(k, base + (axis == 0 ? k->vl.x : k->vl.y)) || percent_owned(k, base + (axis == 0 ? k->vl.width : k->vl.height))) continue;
    if (VB(base, rotateX) != 0 || VB(base, rotateY) != 0 || VB(base, translateZ) != 0) {
      /* out of the plane: the host's footprint3D — decline, leave the value */
      CALL_DECLINE(k, (uint32_t)(r - k->rules));
      return r->target >= 0 ? k->slots[r->target] : 0;
    }
    double wd = VB(base, width), ht = VB(base, height), lead = 0, ext = axis == 0 ? wd : ht;
    double m[6];
    if (own_affine(k, base, m)) {
      double minX = 1.0 / 0.0, minY = 1.0 / 0.0, maxX = -1.0 / 0.0, maxY = -1.0 / 0.0;
      const double px[4] = { 0, wd, 0, wd }, py[4] = { 0, 0, ht, ht };
      for (int c = 0; c < 4; c++) {
        double fx = m[0] * px[c] + m[2] * py[c] + m[4], fy = m[1] * px[c] + m[3] * py[c] + m[5];
        if (fx < minX) minX = fx; if (fx > maxX) maxX = fx;
        if (fy < minY) minY = fy; if (fy > maxY) maxY = fy;
      }
      lead = axis == 0 ? minX : minY; ext = axis == 0 ? maxX - minX : maxY - minY;
    }
    double e = (axis == 0 ? VB(base, x) : VB(base, y)) + lead + ext;
    if (e > max) max = e;
  }
  return max;
}
int32_t kernel_extent_add(dk_kernel *k, uint32_t axis, uint32_t target, const uint32_t *words, uint32_t n) {
  if (!k->vl_set || target >= k->ncells || n == 0) return DK_ERR_BAD;
  int32_t id = kernel_add_rule(k, (int32_t)target, DK_EXTENT, DK_YIELDING, (const uint32_t *)0, 0, (const uint32_t *)0, 0, 0);
  if (id < 0) return id;
  k->rules[id].elem = axis; k->rules[id].code0 = 0; k->rules[id].ncode = 0;
  int e = extent_store(k, (uint32_t)id, words, n);
  if (e == DK_OK) e = extent_link(k, (uint32_t)id);
  if (e != DK_OK) { kernel_dispose(k, (uint32_t)id); return e; }
  return id;
}
int kernel_extent_rewire(dk_kernel *k, uint32_t rule, const uint32_t *words, uint32_t n) {
  if (rule >= k->nrules || k->rules[rule].kind != DK_EXTENT || n == 0) return DK_ERR_BAD;
  unlink_all(k, rule);
  int e = extent_store(k, rule, words, n);
  if (e != DK_OK) return e;
  return extent_link(k, rule);
}

int32_t kernel_add_code(dk_kernel *k, const uint32_t *words, uint32_t n) {
  if (k->ncode + n > k->code_cap) return DK_ERR_FULL;
  uint32_t off = k->ncode;
  for (uint32_t i = 0; i < n; i++) k->code[off + i] = words[i];
  k->ncode += n;
  return (int32_t)off;
}
int32_t kernel_add_const(dk_kernel *k, double v) {
  if (k->nconsts >= k->const_cap) return DK_ERR_FULL;
  k->consts[k->nconsts] = v;
  return (int32_t)k->nconsts++;
}
