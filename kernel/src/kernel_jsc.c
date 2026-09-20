/* kernel_jsc — the kernel's ABI as JavaScriptCore functions (declare_kernel_jsc.h).
 *
 * Numbers only cross: every argument and result is a JS number; pointers
 * travel as their address in a double (exact below 2^53 — every user-space
 * address on macOS). The runtime allocates what it needs with `alloc` and
 * takes `view`s over it and over the kernel's own arrays (the table, the
 * rings, the active-rule word), exactly as it takes views over WASM memory.
 * The host callbacks (body, after_steps, …) are JS functions the runtime
 * hands over with `setHost`. */
#include "declare_kernel.h"
#include "declare_kernel_jsc.h"
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

static struct {
  JSGlobalContextRef ctx;
  JSObjectRef body, after_steps, fire_changes, end_chain, error, schedule, decline;
} G;

static double num(JSContextRef ctx, size_t argc, const JSValueRef argv[], size_t i) {
  return i < argc ? JSValueToNumber(ctx, argv[i], NULL) : 0;
}
#define A(i)  num(ctx, argc, argv, (i))
#define U(i)  ((uint32_t)A(i))
#define I(i)  ((int32_t)A(i))
#define P(i)  ((void *)(uintptr_t)A(i))
#define K     ((dk_kernel *)P(0))
#define N(v)  JSValueMakeNumber(ctx, (double)(v))
#define PTR(p) JSValueMakeNumber(ctx, (double)(uintptr_t)(p))
#define FN(name) static JSValueRef name(JSContextRef ctx, JSObjectRef function, JSObjectRef thisObject, size_t argc, const JSValueRef argv[], JSValueRef *exception)

/* ── host callbacks: C → JS ─────────────────────────────────────────────── */
static double call(JSObjectRef fn, size_t n, const JSValueRef *args) {
  if (!fn) return 0;
  JSValueRef exc = NULL;
  JSValueRef r = JSObjectCallAsFunction(G.ctx, fn, NULL, n, args, &exc);
  if (exc || !r) return 0;
  return JSValueIsNumber(G.ctx, r) ? JSValueToNumber(G.ctx, r, NULL) : (JSValueToBoolean(G.ctx, r) ? 1 : 0);
}
static double h_body(void *c, uint32_t rule, uint32_t elem, int32_t target) {
  JSValueRef a[3] = { JSValueMakeNumber(G.ctx, rule), JSValueMakeNumber(G.ctx, elem), JSValueMakeNumber(G.ctx, target) };
  return call(G.body, 3, a);
}
static int h_after(void *c) { return call(G.after_steps, 0, NULL) != 0; }
static int h_changes(void *c) { return call(G.fire_changes, 0, NULL) != 0; }
static void h_end(void *c) { call(G.end_chain, 0, NULL); }
static void h_error(void *c, int code, uint32_t rule) { JSValueRef a[2] = { JSValueMakeNumber(G.ctx, code), JSValueMakeNumber(G.ctx, rule) }; call(G.error, 2, a); }
static void h_schedule(void *c) { call(G.schedule, 0, NULL); }
static void h_decline(void *c, uint32_t rule) { JSValueRef a[1] = { JSValueMakeNumber(G.ctx, rule) }; call(G.decline, 1, a); }
static dk_host HOST;

/* ── memory for the runtime: alloc + views ──────────────────────────────── */
FN(js_alloc) { size_t n = (size_t)A(0); void *p = calloc(n ? n : 1, 1); return PTR(p); }
FN(js_view) {
  /* view(addr, kind, count): kind 0 = Uint8, 1 = Uint32, 2 = Float64, 3 = Int32 */
  void *p = P(0); uint32_t kind = U(1); size_t count = (size_t)A(2);
  JSTypedArrayType t = kind == 0 ? kJSTypedArrayTypeUint8Array : kind == 1 ? kJSTypedArrayTypeUint32Array : kind == 2 ? kJSTypedArrayTypeFloat64Array : kJSTypedArrayTypeInt32Array;
  size_t bytes = count * (kind == 0 ? 1 : kind == 2 ? 8 : 4);
  return JSObjectMakeTypedArrayWithBytesNoCopy(ctx, t, p, bytes, NULL, NULL, exception);
}
FN(js_setHost) {
  JSObjectRef *slots[7] = { &G.body, &G.after_steps, &G.fire_changes, &G.end_chain, &G.error, &G.schedule, &G.decline };
  for (size_t i = 0; i < 7; i++) {
    if (*slots[i]) { JSValueUnprotect(ctx, *slots[i]); *slots[i] = NULL; }
    if (i < argc && JSValueIsObject(ctx, argv[i])) { *slots[i] = JSValueToObject(ctx, argv[i], NULL); JSValueProtect(ctx, *slots[i]); }
  }
  return JSValueMakeUndefined(ctx);
}

/* ── the ABI, one function each ─────────────────────────────────────────── */
FN(js_arena_size)   { return N(kernel_arena_size(P(0), U(1), (const dk_caps *)P(2))); }
FN(js_load)         { return PTR(kernel_load(P(0), U(1), (const dk_caps *)P(2), P(3), U(4), &HOST)); }
FN(js_table)        { return PTR(kernel_table(K)); }
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
FN(js_settle)       { return N(kernel_settle(K)); }
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
FN(js_extent_rewire){ return N(kernel_extent_rewire(K, U(1), (const uint32_t *)P(2), U(3))); }
FN(js_add_code)     { return N(kernel_add_code(K, (const uint32_t *)P(1), U(2))); }
FN(js_add_const)    { return N(kernel_add_const(K, A(1))); }
FN(js_kdirty)       { return N(kernel_kdirty(K, (uint32_t *)P(1), U(2))); }
FN(js_add_rule)     { return N(kernel_add_rule(K, I(1), (uint8_t)U(2), (uint8_t)U(3), (const uint32_t *)P(4), U(5), (const uint32_t *)P(6), U(7), U(8))); }

static void def(JSGlobalContextRef ctx, JSObjectRef o, const char *name, JSObjectCallAsFunctionCallback fn) {
  JSStringRef s = JSStringCreateWithUTF8CString(name);
  JSObjectSetProperty(ctx, o, s, JSObjectMakeFunctionWithCallback(ctx, s, fn), kJSPropertyAttributeReadOnly | kJSPropertyAttributeDontDelete, NULL);
  JSStringRelease(s);
}

void declare_kernel_install(JSGlobalContextRef ctx) {
  G.ctx = ctx;
  HOST.ctx = ctx; HOST.body = h_body; HOST.after_steps = h_after; HOST.fire_changes = h_changes; HOST.end_chain = h_end;
  HOST.error = h_error; HOST.schedule = h_schedule; HOST.decline = h_decline;
  JSObjectRef o = JSObjectMake(ctx, NULL, NULL);
  def(ctx, o, "alloc", js_alloc); def(ctx, o, "view", js_view); def(ctx, o, "setHost", js_setHost);
  def(ctx, o, "kernel_arena_size", js_arena_size); def(ctx, o, "kernel_load", js_load);
  def(ctx, o, "kernel_table", js_table); def(ctx, o, "kernel_cells", js_cells); def(ctx, o, "kernel_rules", js_rules); def(ctx, o, "kernel_elems", js_elems);
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
  def(ctx, o, "kernel_vis_rewire", js_vis_rewire); def(ctx, o, "kernel_extent_add", js_extent_add); def(ctx, o, "kernel_extent_rewire", js_extent_rewire);
  def(ctx, o, "kernel_add_code", js_add_code); def(ctx, o, "kernel_add_const", js_add_const); def(ctx, o, "kernel_kdirty", js_kdirty);
  def(ctx, o, "kernel_add_rule", js_add_rule);
  JSStringRef name = JSStringCreateWithUTF8CString("__declareNativeKernel");
  JSObjectSetProperty(ctx, JSContextGetGlobalObject(ctx), name, o, kJSPropertyAttributeDontDelete, NULL);
  JSStringRelease(name);
}
