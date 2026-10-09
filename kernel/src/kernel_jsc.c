/* kernel_jsc — the kernel's ABI as JavaScriptCore functions (declare_kernel_jsc.h).
 *
 * Numbers only cross: every argument and result is a number; pointers travel
 * as their address in a double (exact below 2^53 — every user-space address on
 * macOS). ARGUMENTS TRAVEL THROUGH MEMORY, NOT AS JS VALUES: a call's arguments
 * are written into the kernel object's `args` block and the function is called
 * with none; a callback's into its `io` block, its result written back there.
 * Each JSValue converted across the C API takes the API lock — a 2-argument
 * call cost 197 ns that way and 75 through the block, a 3-argument callback
 * 133 against 70 (JavaScriptCore on an M-series Mac, 2026-09-27). Neither
 * block can be clobbered by a nested call: a function reads its arguments
 * before it can call back, and a callback's JS reads them before it calls in.
 * The runtime allocates what it needs with `alloc` and
 * takes `view`s over it and over the kernel's own arrays (the table, the
 * rings, the active-rule word), exactly as it takes views over WASM memory.
 * The host callbacks (body, after_steps, …) are JS functions the runtime
 * hands over with `setHost`.
 *
 * ONE HOST PER CONTEXT. The Mac app runs a JavaScript context per window, and
 * each installs its own kernel object; the callbacks, and the context they are
 * called in, belong to that object (its private data), never to the process —
 * a second window must not take over the first one's kernel. */
#include "declare_kernel.h"
#include "declare_kernel_jsc.h"
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <mach/mach_time.h>

typedef struct {
  JSGlobalContextRef ctx;
  JSObjectRef body, after_steps, fire_changes, end_chain, error, schedule, decline, reserve;
  dk_host host;                 /* what kernel_load hands the kernel; its ctx is this record */
  double args[16];              /* a call's arguments, written by the runtime (viewed as `args`) */
  double io[8];                 /* a callback's arguments [0..2] and result [3] (viewed as `io`) */
  /* THE SPLIT, for measuring (`prof`): a settle's time, and the part of it spent
   * in its callbacks into JS — the rest is the kernel's own logic. Off unless
   * `prof(1)` turned it on; outermost settle and outermost callback only. */
  int timing, in_settle, in_cb;
  uint64_t t_settle, t_cb, n_settle, n_cb;
} jsc_host;

/* The record of the kernel object a function was called on (`nk.setHost(…)`,
 * `nk.kernel_load(…)` — the runtime calls them as methods). */
static jsc_host *host_of(JSObjectRef thisObject) {
  return thisObject ? (jsc_host *)JSObjectGetPrivate(thisObject) : NULL;
}

static const double NO_ARGS[16] = { 0 };
#define A(i)  (a_[(i)])
#define U(i)  ((uint32_t)A(i))
#define I(i)  ((int32_t)A(i))
#define P(i)  ((void *)(uintptr_t)A(i))
#define K     ((dk_kernel *)P(0))
#define N(v)  JSValueMakeNumber(ctx, (double)(v))
#define PTR(p) JSValueMakeNumber(ctx, (double)(uintptr_t)(p))
/* A function of the ABI: its record's argument block fetched once, then read as A(i). */
#define FN(name) \
  static JSValueRef name##_(JSContextRef ctx, JSObjectRef thisObject, const double *a_, JSValueRef *exception); \
  static JSValueRef name(JSContextRef ctx, JSObjectRef function, JSObjectRef thisObject, size_t argc, const JSValueRef argv[], JSValueRef *exception) { \
    jsc_host *h_ = host_of(thisObject); return name##_(ctx, thisObject, h_ ? h_->args : NO_ARGS, exception); } \
  static JSValueRef name##_(JSContextRef ctx, JSObjectRef thisObject, const double *a_, JSValueRef *exception)

/* ── host callbacks: C → JS ─────────────────────────────────────────────── */
/* A callback: its arguments already in io[0..2]; called with none, its result
 * read back from io[3] (0 when it threw — the runtime reports its own errors). */
static double call(jsc_host *h, JSObjectRef fn) {
  if (!fn) return 0;
  JSValueRef exc = NULL;
  h->io[3] = 0;
  if (h->timing && h->in_settle && !h->in_cb) {
    uint64_t t0 = mach_absolute_time();
    h->in_cb = 1;
    JSObjectCallAsFunction(h->ctx, fn, NULL, 0, NULL, &exc);
    h->in_cb = 0;
    h->t_cb += mach_absolute_time() - t0; h->n_cb++;
  } else JSObjectCallAsFunction(h->ctx, fn, NULL, 0, NULL, &exc);
  return exc ? 0 : h->io[3];
}
#define H ((jsc_host *)c)
static double h_body(void *c, uint32_t rule, uint32_t elem, int32_t target) {
  H->io[0] = rule; H->io[1] = elem; H->io[2] = target;
  return call(H, H->body);
}
static int h_after(void *c) { return call(H, H->after_steps) != 0; }
static int h_changes(void *c) { return call(H, H->fire_changes) != 0; }
static void h_end(void *c) { call(H, H->end_chain); }
static void h_error(void *c, int code, uint32_t rule) { H->io[0] = code; H->io[1] = rule; call(H, H->error); }
static void h_schedule(void *c) { call(H, H->schedule); }
static void h_decline(void *c, uint32_t rule) { H->io[0] = rule; call(H, H->decline); }
static void h_reserve(void *c, uint32_t nodes) { H->io[0] = nodes; call(H, H->reserve); }
#undef H

/* ── memory for the runtime: alloc + views ──────────────────────────────── */
FN(js_alloc) { size_t n = (size_t)A(0); void *p = calloc(n ? n : 1, 1); return PTR(p); }
FN(js_view) {
  /* view(addr, kind, count): kind 0 = Uint8, 1 = Uint32, 2 = Float64, 3 = Int32 */
  void *p = P(0); uint32_t kind = U(1); size_t count = (size_t)A(2);
  JSTypedArrayType t = kind == 0 ? kJSTypedArrayTypeUint8Array : kind == 1 ? kJSTypedArrayTypeUint32Array : kind == 2 ? kJSTypedArrayTypeFloat64Array : kJSTypedArrayTypeInt32Array;
  size_t bytes = count * (kind == 0 ? 1 : kind == 2 ? 8 : 4);
  return JSObjectMakeTypedArrayWithBytesNoCopy(ctx, t, p, bytes, NULL, NULL, exception);
}
static JSValueRef js_setHost(JSContextRef ctx, JSObjectRef function, JSObjectRef thisObject, size_t argc, const JSValueRef argv[], JSValueRef *exception) {
  jsc_host *h = host_of(thisObject);
  if (!h) return JSValueMakeUndefined(ctx);
  JSObjectRef *slots[8] = { &h->body, &h->after_steps, &h->fire_changes, &h->end_chain, &h->error, &h->schedule, &h->decline, &h->reserve };
  for (size_t i = 0; i < 8; i++) {
    if (*slots[i]) { JSValueUnprotect(ctx, *slots[i]); *slots[i] = NULL; }
    if (i < argc && JSValueIsObject(ctx, argv[i])) { *slots[i] = JSValueToObject(ctx, argv[i], NULL); JSValueProtect(ctx, *slots[i]); }
  }
  return JSValueMakeUndefined(ctx);
}

/* ── the ABI, one function each ─────────────────────────────────────────── */
FN(js_arena_size)   { return N(kernel_arena_size(P(0), U(1), (const dk_caps *)P(2))); }
FN(js_load)         { jsc_host *h = host_of(thisObject); return h ? PTR(kernel_load(P(0), U(1), (const dk_caps *)P(2), P(3), U(4), &h->host)) : N(0); }
FN(js_table)        { return PTR(kernel_table(K)); }
FN(js_nulls)        { return PTR(kernel_nulls(K)); }
FN(js_body_null)    { return PTR(kernel_body_null(K)); }
FN(js_cells)        { return N(kernel_cells(K)); }
FN(js_rules)        { return N(kernel_rules(K)); }
FN(js_elems)        { return N(kernel_elems(K)); }
FN(js_cell)         { return N(kernel_cell(K, U(1), U(2))); }
FN(js_write)        { return N(kernel_write(K, U(1), A(2))); }
FN(js_set)          { return N(kernel_set(K, U(1), A(2))); }
FN(js_touch)        { kernel_touch(K, U(1)); return JSValueMakeUndefined(ctx); }
FN(js_is_set)       { return N(kernel_is_set(K, U(1))); }
FN(js_own)          { return N(kernel_own(K, U(1), U(2))); }
FN(js_release)      { kernel_release(K, U(1), U(2)); return JSValueMakeUndefined(ctx); }
FN(js_owner)        { return N(kernel_owner(K, U(1))); }
FN(js_run)          { return N(kernel_run(K, U(1))); }
FN(js_invalidate)   { kernel_invalidate(K, U(1)); return JSValueMakeUndefined(ctx); }
FN(js_dispose)      { kernel_dispose(K, U(1)); return JSValueMakeUndefined(ctx); }
FN(js_suspend)      { kernel_suspend(K, U(1)); return JSValueMakeUndefined(ctx); }
FN(js_resume)       { return N(kernel_resume(K, U(1))); }
FN(js_active)       { return N(kernel_active(K)); }
FN(js_track)        { return N(kernel_track(K, U(1))); }
FN(js_active_ptr)   { return PTR(kernel_active_ptr(K)); }
FN(js_settle) {
  jsc_host *h = host_of(thisObject);
  if (!h || !h->timing || h->in_settle || h->in_cb) return N(kernel_settle(K));
  uint64_t t0 = mach_absolute_time();
  h->in_settle = 1;
  int32_t r = kernel_settle(K);
  h->in_settle = 0;
  h->t_settle += mach_absolute_time() - t0; h->n_settle++;
  return N(r);
}
/* prof(on): reset and switch the split on (1) or off (0); after it, args[10..13]
 * hold settle ns, callback ns, settles, callbacks — the totals before the reset. */
static JSValueRef js_prof(JSContextRef ctx, JSObjectRef function, JSObjectRef thisObject, size_t argc, const JSValueRef argv[], JSValueRef *exception) {
  jsc_host *h = host_of(thisObject);
  if (!h) return JSValueMakeUndefined(ctx);
  mach_timebase_info_data_t tb; mach_timebase_info(&tb);
  h->args[10] = (double)h->t_settle * tb.numer / tb.denom; h->args[11] = (double)h->t_cb * tb.numer / tb.denom;
  h->args[12] = (double)h->n_settle; h->args[13] = (double)h->n_cb;
  h->t_settle = h->t_cb = h->n_settle = h->n_cb = 0;
  h->timing = argc > 0 && JSValueToBoolean(ctx, argv[0]);
  return JSValueMakeUndefined(ctx);
}
FN(js_pending)      { return N(kernel_pending(K)); }
FN(js_dirty)        { return N(kernel_dirty(K, (uint32_t *)P(1), U(2))); }
FN(js_add_cell)     { return N(kernel_add_cell(K, (uint8_t)U(1), I(2))); }
FN(js_free_cell)    { kernel_free_cell(K, U(1)); return JSValueMakeUndefined(ctx); }
FN(js_add_cells)    { return N(kernel_add_cells(K, U(1), (uint8_t)U(2))); }
FN(js_clear_cells)  { kernel_clear_cells(K, U(1), U(2)); return JSValueMakeUndefined(ctx); }
FN(js_ring)         { return PTR(kernel_ring(K, (uint32_t *)P(1))); }
FN(js_track_ring)   { return PTR(kernel_track_ring(K, (uint32_t *)P(1))); }
FN(js_track_count)  { return PTR(kernel_track_count(K)); }
FN(js_ring_count)   { return PTR(kernel_ring_count(K)); }
FN(js_flush)        { kernel_flush(K); return JSValueMakeUndefined(ctx); }
FN(js_rewire)       { return N(kernel_rewire(K, U(1), (const uint32_t *)P(2), U(3))); }
FN(js_deps)         { return N(kernel_deps(K, U(1), (uint32_t *)P(2), U(3))); }
FN(js_state)        { return N(kernel_state(K, U(1))); }
FN(js_abort)        { kernel_abort(K); return JSValueMakeUndefined(ctx); }
FN(js_state_ptr)    { return PTR(kernel_state_ptr(K, (uint32_t *)P(1))); }
FN(js_rule_cap)     { return N(kernel_rule_cap(K)); }
FN(js_pending_ptr)  { return PTR(kernel_pending_ptr(K)); }
FN(js_cell_dyn_ptr) { return PTR(kernel_cell_dyn_ptr(K)); }
FN(js_static_cells) { return N(kernel_static_cells(K)); }
FN(js_view_layout)  { kernel_view_layout(K, (const dk_view_layout *)P(1)); return JSValueMakeUndefined(ctx); }
FN(js_view_dpr_cell){ kernel_view_dpr_cell(K, U(1)); return JSValueMakeUndefined(ctx); }
FN(js_view_add)     { return N(kernel_view_add(K, U(1), I(2))); }
FN(js_view_parent)  { kernel_view_parent(K, U(1), I(2)); return JSValueMakeUndefined(ctx); }
FN(js_view_remove)  { kernel_view_remove(K, U(1)); return JSValueMakeUndefined(ctx); }
FN(js_vis_add)      { return N(kernel_vis_add(K, U(1), U(2))); }
FN(js_vis_rewire)   { return N(kernel_vis_rewire(K, U(1))); }
FN(js_extent_add)   { return N(kernel_extent_add(K, U(1), U(2), (const uint32_t *)P(3), U(4))); }
FN(js_grow)         { return PTR(kernel_grow(K, P(1), U(2), (const dk_caps *)P(3), P(4), U(5))); }
FN(js_usage)        { kernel_usage(K, (uint32_t *)P(1)); return JSValueMakeUndefined(ctx); }
FN(js_extent_rewire){ return N(kernel_extent_rewire(K, U(1), (const uint32_t *)P(2), U(3))); }
FN(js_layout_add)   { return N(kernel_layout_add(K, U(1), (const uint32_t *)P(2), U(3))); }
FN(js_add_code)     { return N(kernel_add_code(K, (const uint32_t *)P(1), U(2))); }
FN(js_add_const)    { return N(kernel_add_const(K, A(1))); }
FN(js_kdirty)       { return N(kernel_kdirty(K, (uint32_t *)P(1), U(2))); }
FN(js_add_rule)     { return N(kernel_add_rule(K, I(1), (uint8_t)U(2), (uint8_t)U(3), (const uint32_t *)P(4), U(5), (const uint32_t *)P(6), U(7), U(8))); }

static void def(JSGlobalContextRef ctx, JSObjectRef o, const char *name, JSObjectCallAsFunctionCallback fn) {
  JSStringRef s = JSStringCreateWithUTF8CString(name);
  JSObjectSetProperty(ctx, o, s, JSObjectMakeFunctionWithCallback(ctx, s, fn), kJSPropertyAttributeReadOnly | kJSPropertyAttributeDontDelete, NULL);
  JSStringRelease(s);
}

/* The record goes with its kernel object: freed when the context collects it. */
static void host_finalize(JSObjectRef o) { free(JSObjectGetPrivate(o)); }

void declare_kernel_install(JSGlobalContextRef ctx) {
  static JSClassRef cls = NULL;
  if (!cls) {
    JSClassDefinition d = kJSClassDefinitionEmpty;
    d.className = "DeclareNativeKernel";
    d.finalize = host_finalize;
    cls = JSClassCreate(&d);
  }
  jsc_host *h = calloc(1, sizeof *h);
  h->ctx = ctx;
  h->host.ctx = h; h->host.body = h_body; h->host.after_steps = h_after; h->host.fire_changes = h_changes; h->host.end_chain = h_end;
  h->host.error = h_error; h->host.schedule = h_schedule; h->host.decline = h_decline; h->host.reserve = h_reserve;
  JSObjectRef o = JSObjectMake(ctx, cls, h);
  def(ctx, o, "alloc", js_alloc); def(ctx, o, "view", js_view); def(ctx, o, "setHost", js_setHost); def(ctx, o, "prof", js_prof);
  def(ctx, o, "kernel_arena_size", js_arena_size); def(ctx, o, "kernel_load", js_load);
  def(ctx, o, "kernel_table", js_table); def(ctx, o, "kernel_nulls", js_nulls); def(ctx, o, "kernel_body_null", js_body_null); def(ctx, o, "kernel_cells", js_cells); def(ctx, o, "kernel_rules", js_rules); def(ctx, o, "kernel_elems", js_elems);
  def(ctx, o, "kernel_cell", js_cell); def(ctx, o, "kernel_write", js_write); def(ctx, o, "kernel_set", js_set); def(ctx, o, "kernel_touch", js_touch);
  def(ctx, o, "kernel_is_set", js_is_set); def(ctx, o, "kernel_own", js_own); def(ctx, o, "kernel_release", js_release); def(ctx, o, "kernel_owner", js_owner);
  def(ctx, o, "kernel_run", js_run); def(ctx, o, "kernel_invalidate", js_invalidate); def(ctx, o, "kernel_dispose", js_dispose);
  def(ctx, o, "kernel_suspend", js_suspend); def(ctx, o, "kernel_resume", js_resume); def(ctx, o, "kernel_active", js_active);
  def(ctx, o, "kernel_track", js_track); def(ctx, o, "kernel_active_ptr", js_active_ptr); def(ctx, o, "kernel_settle", js_settle);
  def(ctx, o, "kernel_pending", js_pending); def(ctx, o, "kernel_dirty", js_dirty); def(ctx, o, "kernel_add_cell", js_add_cell);
  def(ctx, o, "kernel_free_cell", js_free_cell); def(ctx, o, "kernel_add_cells", js_add_cells); def(ctx, o, "kernel_clear_cells", js_clear_cells);
  def(ctx, o, "kernel_ring", js_ring); def(ctx, o, "kernel_track_ring", js_track_ring); def(ctx, o, "kernel_track_count", js_track_count);
  def(ctx, o, "kernel_ring_count", js_ring_count); def(ctx, o, "kernel_flush", js_flush); def(ctx, o, "kernel_rewire", js_rewire);
  def(ctx, o, "kernel_deps", js_deps); def(ctx, o, "kernel_state", js_state); def(ctx, o, "kernel_abort", js_abort);
  def(ctx, o, "kernel_state_ptr", js_state_ptr); def(ctx, o, "kernel_rule_cap", js_rule_cap); def(ctx, o, "kernel_pending_ptr", js_pending_ptr);
  def(ctx, o, "kernel_cell_dyn_ptr", js_cell_dyn_ptr); def(ctx, o, "kernel_static_cells", js_static_cells);
  def(ctx, o, "kernel_view_layout", js_view_layout); def(ctx, o, "kernel_view_dpr_cell", js_view_dpr_cell); def(ctx, o, "kernel_view_add", js_view_add);
  def(ctx, o, "kernel_view_parent", js_view_parent); def(ctx, o, "kernel_view_remove", js_view_remove); def(ctx, o, "kernel_vis_add", js_vis_add);
  def(ctx, o, "kernel_vis_rewire", js_vis_rewire); def(ctx, o, "kernel_extent_add", js_extent_add); def(ctx, o, "kernel_extent_rewire", js_extent_rewire); def(ctx, o, "kernel_layout_add", js_layout_add);
  def(ctx, o, "kernel_add_code", js_add_code); def(ctx, o, "kernel_add_const", js_add_const); def(ctx, o, "kernel_kdirty", js_kdirty);
  def(ctx, o, "kernel_add_rule", js_add_rule); def(ctx, o, "kernel_grow", js_grow); def(ctx, o, "kernel_usage", js_usage);
  const struct { const char *name; double *at; size_t n; } blocks[] = { { "args", h->args, 16 }, { "io", h->io, 8 } };
  for (size_t i = 0; i < 2; i++) {
    JSObjectRef view = JSObjectMakeTypedArrayWithBytesNoCopy(ctx, kJSTypedArrayTypeFloat64Array, blocks[i].at, blocks[i].n * sizeof(double), NULL, NULL, NULL);
    JSStringRef s = JSStringCreateWithUTF8CString(blocks[i].name);
    JSObjectSetProperty(ctx, o, s, view, kJSPropertyAttributeReadOnly | kJSPropertyAttributeDontDelete, NULL);
    JSStringRelease(s);
  }
  JSStringRef name = JSStringCreateWithUTF8CString("__declareNativeKernel");
  JSObjectSetProperty(ctx, JSContextGetGlobalObject(ctx), name, o, kJSPropertyAttributeDontDelete, NULL);
  JSStringRelease(name);
}
