/* kernel-test — the reactive core's contract, over the C ABI. Mirrors what
 * test/static-constraint.test.mjs and the runtime's unit tests pin for
 * reactive.ts / attributes.ts. A host program: libc is fine here. */
#include "declare_kernel.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

static int fails = 0, checks = 0;
#define CHECK(c) do { checks++; if (!(c)) { fails++; printf("  ✗ %s:%d  %s\n", __FILE__, __LINE__, #c); } } while (0)

/* ── an image, by hand (the same layout kernel/image.mjs writes) ────────── */
typedef struct { unsigned char *p; uint32_t n, cap; } Buf;
static void put(Buf *b, const void *d, uint32_t n) { if (b->n + n > b->cap) { b->cap = (b->n + n) * 2 + 64; b->p = realloc(b->p, b->cap); } memcpy(b->p + b->n, d, n); b->n += n; }
static void pad8(Buf *b) { static const unsigned char z[8]; uint32_t r = b->n % 8; if (r) put(b, z, 8 - r); }
static void u32(Buf *b, uint32_t v) { put(b, &v, 4); }
static void f64(Buf *b, double v) { put(b, &v, 8); }

typedef struct { int32_t target; uint8_t kind, flags; uint32_t *edges; uint32_t nedges; uint32_t *code; uint32_t ncode; uint32_t body; } R;

static Buf image(uint32_t nelems, const uint32_t *nslots, const uint8_t *kinds, const double *init,
                 const R *rules, uint32_t nrules, const double *consts, uint32_t nconsts) {
  Buf b = { 0, 0, 0 };
  uint32_t ncells = 0, nedges = 0, ncode = 0;
  for (uint32_t i = 0; i < nelems; i++) ncells += nslots[i];
  for (uint32_t i = 0; i < nrules; i++) { nedges += rules[i].nedges; ncode += rules[i].ncode; }
  u32(&b, DK_MAGIC); u32(&b, DK_VERSION); u32(&b, nelems); u32(&b, ncells); u32(&b, nrules); u32(&b, nedges); u32(&b, ncode); u32(&b, nconsts);
  put(&b, kinds, ncells); pad8(&b);
  for (uint32_t i = 0, base = 0; i < nelems; i++) { u32(&b, base); u32(&b, 0xffffffffu); u32(&b, nslots[i]); base += nslots[i]; } pad8(&b);
  for (uint32_t i = 0, e0 = 0, c0 = 0; i < nrules; i++) {
    const R *r = &rules[i];
    put(&b, &r->target, 4); put(&b, &r->kind, 1); put(&b, &r->flags, 1); { uint16_t z = 0; put(&b, &z, 2); }
    u32(&b, e0); u32(&b, r->nedges); u32(&b, c0); u32(&b, r->ncode); u32(&b, r->body);
    e0 += r->nedges; c0 += r->ncode;
  } pad8(&b);
  for (uint32_t i = 0; i < nrules; i++) for (uint32_t e = 0; e < rules[i].nedges; e++) u32(&b, rules[i].edges[e]); pad8(&b);
  for (uint32_t i = 0; i < nrules; i++) for (uint32_t c = 0; c < rules[i].ncode; c++) u32(&b, rules[i].code[c]); pad8(&b);
  for (uint32_t i = 0; i < nconsts; i++) f64(&b, consts[i]); pad8(&b);
  for (uint32_t i = 0; i < ncells; i++) f64(&b, init ? init[i] : 0.0); pad8(&b);
  return b;
}

/* ── the host: bodies as C functions, a log of what ran ─────────────────── */
static dk_kernel *K;
static char logbuf[4096]; static int logn;
static void logf_(const char *s) { logn += snprintf(logbuf + logn, sizeof logbuf - logn, "%s ", s); }
static int after_count, change_count, after_arm, change_arm, ended;
static double body_value[64]; static int body_runs[64];
static double (*body_fn[64])(dk_kernel *k, uint32_t rule);

static double body(void *ctx, uint32_t rule, uint32_t elem, int32_t target) {
  (void)ctx; (void)elem; (void)target;
  body_runs[rule]++;
  char s[32]; snprintf(s, sizeof s, "b%u", rule); logf_(s);
  return body_fn[rule] ? body_fn[rule](K, rule) : body_value[rule];
}
static int after_steps(void *ctx) { (void)ctx; if (after_arm > 0) { after_arm--; after_count++; logf_("after"); return 1; } return 0; }
static int fire_changes(void *ctx) { (void)ctx; if (change_arm > 0) { change_arm--; change_count++; logf_("change"); return 1; } return 0; }
static void end_chain(void *ctx) { (void)ctx; ended++; }
static int last_err; static uint32_t last_bad;
static void on_error(void *ctx, int code, uint32_t rule) { (void)ctx; last_err = code; last_bad = rule; }
static const dk_host HOST = { 0, body, after_steps, fire_changes, end_chain, on_error };

static dk_kernel *load(Buf *b, dk_caps caps) {
  uint32_t need = kernel_arena_size(b->p, b->n, &caps);
  void *arena = malloc(need);
  dk_kernel *k = kernel_load(b->p, b->n, &caps, arena, need, &HOST);
  K = k; logn = 0; logbuf[0] = 0;
  memset(body_runs, 0, sizeof body_runs); memset(body_fn, 0, sizeof body_fn);
  return k;
}

/* ── scenarios ──────────────────────────────────────────────────────────── */

/* 1. a chain of EXPR rules: c1 = c0*2, c2 = c1+1 — one settle, in order, gated */
static void test_chain(void) {
  uint32_t nslots[1] = { 3 }; uint8_t kinds[3] = { 0, 0, 0 }; double init[3] = { 1, 0, 0 };
  double consts[2] = { 2, 1 };
  uint32_t e1[1] = { 0 }, code1[] = { DK_OP_LOAD, 0, DK_OP_CONST, 0, DK_OP_MUL, DK_OP_END };
  uint32_t e2[1] = { 1 }, code2[] = { DK_OP_LOAD, 1, DK_OP_CONST, 1, DK_OP_ADD, DK_OP_END };
  R rules[2] = { { 1, DK_EXPR, 0, e1, 1, code1, 6, 0 }, { 2, DK_EXPR, 0, e2, 1, code2, 6, 0 } };
  Buf b = image(1, nslots, kinds, init, rules, 2, consts, 2);
  dk_kernel *k = load(&b, (dk_caps){ 0, 0, 0, 0 });
  CHECK(k != 0);
  double *t = kernel_table(k);
  kernel_run(k, 0); kernel_run(k, 1);
  CHECK(t[1] == 2 && t[2] == 3);
  kernel_settle(k);                        /* the landings' own wakes drain, as in the JS core */
  CHECK(kernel_write(k, 0, 10) == DK_OK);
  CHECK(kernel_pending(k) == 1);
  CHECK(t[1] == 2);                       /* dependents recompute at the settle, not at the write */
  int32_t runs = kernel_settle(k);
  CHECK(runs == 2 && t[1] == 20 && t[2] == 21);
  CHECK(kernel_settle(k) == 0);           /* quiescent */
  kernel_write(k, 0, 10);                  /* equal value: gated, nothing queued */
  CHECK(kernel_pending(k) == 0 && kernel_settle(k) == 0);
  uint32_t dirty[8]; CHECK(kernel_dirty(k, dirty, 8) == 3);  /* 0, 1, 2 moved since load */
  CHECK(kernel_dirty(k, dirty, 8) == 0);
  printf("  chain ok\n");
}

/* 2. a diamond over BODY rules: d = b + c, b = a, c = a — a moves → b, c, d run once each */
static double b_read(dk_kernel *k, uint32_t r) { (void)r; return kernel_table(k)[0]; }
static double d_sum(dk_kernel *k, uint32_t r) { (void)r; return kernel_table(k)[1] + kernel_table(k)[2]; }
static void test_diamond(void) {
  uint32_t nslots[1] = { 4 }; uint8_t kinds[4] = { 0, 0, 0, 0 }; double init[4] = { 1, 0, 0, 0 };
  uint32_t ea[1] = { 0 }, ebc[2] = { 1, 2 };
  R rules[3] = { { 1, DK_BODY, 0, ea, 1, 0, 0, 0 }, { 2, DK_BODY, 0, ea, 1, 0, 0, 0 }, { 3, DK_BODY, 0, ebc, 2, 0, 0, 0 } };
  Buf b = image(1, nslots, kinds, init, rules, 3, 0, 0);
  dk_kernel *k = load(&b, (dk_caps){ 0, 0, 0, 0 });
  body_fn[0] = b_read; body_fn[1] = b_read; body_fn[2] = d_sum;
  kernel_run(k, 0); kernel_run(k, 1); kernel_run(k, 2);
  CHECK(kernel_table(k)[3] == 2);
  kernel_settle(k);
  memset(body_runs, 0, sizeof body_runs); logn = 0;
  kernel_write(k, 0, 5);
  int32_t runs = kernel_settle(k);
  /* FIFO with re-queue: b, c queued by a; d queued by b's apply, runs once after c (its second wake coalesces) */
  CHECK(runs == 3);
  CHECK(body_runs[0] == 1 && body_runs[1] == 1 && body_runs[2] == 1);
  CHECK(kernel_table(k)[3] == 10);
  CHECK(strcmp(logbuf, "b0 b1 b2 ") == 0);
  printf("  diamond ok (%s)\n", logbuf);
}

/* 3. phases: a phase-1 (draw) rule runs after every phase-0 rule, even when queued first */
static void test_phases(void) {
  uint32_t nslots[1] = { 3 }; uint8_t kinds[3] = { 0, 0, 1 }; double init[3] = { 0, 0, 0 };
  uint32_t e0[1] = { 0 };
  R rules[2] = { { 2, DK_BODY, DK_PHASE1, e0, 1, 0, 0, 0 }, { 1, DK_BODY, 0, e0, 1, 0, 0, 0 } };
  Buf b = image(1, nslots, kinds, init, rules, 2, 0, 0);
  dk_kernel *k = load(&b, (dk_caps){ 0, 0, 0, 0 });
  body_fn[1] = b_read; body_value[0] = 1;   /* the draw rule targets a REF cell: returns "changed" */
  kernel_run(k, 0); kernel_run(k, 1); kernel_settle(k);   /* land both (an unlanded rule never wakes) */
  kernel_write(k, 0, 1);
  logn = 0; kernel_settle(k);
  CHECK(strcmp(logbuf, "b1 b0 ") == 0);
  printf("  phases ok (%s)\n", logbuf);
}

/* 4. the cycle guard: a rule that re-dirties its own input */
static double cyc(dk_kernel *k, uint32_t r) { (void)r; double v = kernel_table(k)[0] + 1; kernel_set(k, 0, v); return v; }
static void test_cycle(void) {
  uint32_t nslots[1] = { 2 }; uint8_t kinds[2] = { 0, 0 }; double init[2] = { 0, 0 };
  uint32_t e0[1] = { 0 };
  R rules[1] = { { 1, DK_BODY, 0, e0, 1, 0, 0, 0 } };
  Buf b = image(1, nslots, kinds, init, rules, 1, 0, 0);
  dk_kernel *k = load(&b, (dk_caps){ 0, 0, 0, 0 });
  body_fn[0] = cyc; last_err = 0;
  kernel_run(k, 0);                          /* landing: its own write wakes it */
  ended = 0;
  kernel_write(k, 0, 5);                     /* (the landing left cell 0 at 1: a write of 1 would gate) */
  int32_t r = kernel_settle(k);
  CHECK(r == DK_ERR_CYCLE && last_err == DK_ERR_CYCLE && last_bad == 0);
  CHECK(ended == 1);
  CHECK(kernel_pending(k) == 0);            /* abandoned: the queue is clear */
  kernel_write(k, 0, 100);                   /* and a later write queues again */
  CHECK(kernel_pending(k) == 1);
  printf("  cycle ok\n");
}

/* 5. ownership: a bound slot refuses an author write; a yielding owner steps aside */
static void test_ownership(void) {
  uint32_t nslots[1] = { 3 }; uint8_t kinds[3] = { 0, 0, 0 }; double init[3] = { 1, 0, 0 };
  uint32_t e0[1] = { 0 };
  R rules[2] = { { 1, DK_BODY, 0, e0, 1, 0, 0, 0 }, { 2, DK_BODY, DK_YIELDING, e0, 1, 0, 0, 0 } };
  Buf b = image(1, nslots, kinds, init, rules, 2, 0, 0);
  dk_kernel *k = load(&b, (dk_caps){ 0, 0, 0, 0 });
  body_fn[0] = b_read; body_fn[1] = b_read;
  CHECK(kernel_own(k, 1, 0) == DK_OK && kernel_own(k, 2, 1) == DK_OK);
  CHECK(kernel_own(k, 1, 1) == DK_ERR_BOUND);          /* already bound, non-yielding */
  kernel_run(k, 0); kernel_run(k, 1);
  CHECK(kernel_write(k, 1, 7) == DK_ERR_OWNED);         /* author write to a bound slot */
  CHECK(kernel_table(k)[1] == 1);
  CHECK(kernel_write(k, 2, 7) == DK_OK);                /* the yielding derive is displaced */
  CHECK(kernel_owner(k, 2) == -1 && kernel_is_set(k, 2) == 1 && kernel_table(k)[2] == 7);
  kernel_write(k, 0, 3); kernel_settle(k);
  CHECK(kernel_table(k)[1] == 3 && kernel_table(k)[2] == 7);   /* the disposed derive never runs again */
  CHECK(kernel_set(k, 1, 9) == DK_OK && kernel_table(k)[1] == 9);   /* setBound ignores ownership */
  printf("  ownership ok\n");
}

/* 6. dynamic tracking: a body reads one of two cells depending on a third; edges follow */
static double pick(dk_kernel *k, uint32_t r) {
  (void)r; double *t = kernel_table(k);
  kernel_track(k, 0);
  if (t[0] != 0) { kernel_track(k, 1); return t[1]; }
  kernel_track(k, 2); return t[2];
}
static void test_dynamic(void) {
  uint32_t nslots[1] = { 4 }; uint8_t kinds[4] = { 0, 0, 0, 0 }; double init[4] = { 0, 10, 20, 0 };
  R rules[1] = { { 3, DK_DYNAMIC, 0, 0, 0, 0, 0, 0 } };
  Buf b = image(1, nslots, kinds, init, rules, 1, 0, 0);
  dk_kernel *k = load(&b, (dk_caps){ 0, 0, 0, 16 });
  body_fn[0] = pick;
  kernel_run(k, 0); CHECK(kernel_table(k)[3] == 20);
  memset(body_runs, 0, sizeof body_runs);
  kernel_write(k, 1, 11); kernel_settle(k);
  CHECK(body_runs[0] == 0);                  /* not a dependency this run */
  kernel_write(k, 2, 21); kernel_settle(k);
  CHECK(body_runs[0] == 1 && kernel_table(k)[3] == 21);
  kernel_write(k, 0, 1); kernel_settle(k);
  CHECK(body_runs[0] == 2 && kernel_table(k)[3] == 11);
  kernel_write(k, 2, 99); kernel_settle(k);
  CHECK(body_runs[0] == 2);                  /* the branch not taken is not a dependency */
  kernel_write(k, 1, 12); kernel_settle(k);
  CHECK(body_runs[0] == 3 && kernel_table(k)[3] == 12);
  CHECK(kernel_active(k) == -1);
  printf("  dynamic ok\n");
}

/* 7. the close: afterSettle steps and change events loop back; the limit trips */
static void test_close(void) {
  uint32_t nslots[1] = { 1 }; uint8_t kinds[1] = { 0 }; double init[1] = { 0 };
  Buf b = image(1, nslots, kinds, init, 0, 0, 0, 0);
  dk_kernel *k = load(&b, (dk_caps){ 0, 0, 0, 0 });
  after_arm = 2; change_arm = 1; after_count = change_count = 0; logn = 0;
  kernel_write(k, 0, 1);
  CHECK(kernel_settle(k) >= 0);
  CHECK(after_count == 2 && change_count == 1);
  CHECK(strcmp(logbuf, "after after change ") == 0);   /* steps first, to quiescence, then the change */
  printf("  close ok (%s)\n", logbuf);
  after_arm = 1000; last_err = 0; logn = 0;
  kernel_write(k, 0, 2);
  CHECK(kernel_settle(k) == DK_ERR_AFTER && last_err == DK_ERR_AFTER);
  after_arm = 0;
}

/* 8. suspend / resume / dispose; runtime-added rules; NaN propagates */
static void test_lifecycle(void) {
  uint32_t nslots[1] = { 3 }; uint8_t kinds[3] = { 0, 0, 0 }; double init[3] = { 1, 0, 0 };
  uint32_t e0[1] = { 0 };
  R rules[1] = { { 1, DK_BODY, 0, e0, 1, 0, 0, 0 } };
  Buf b = image(1, nslots, kinds, init, rules, 1, 0, 0);
  dk_kernel *k = load(&b, (dk_caps){ 0, 0, 4, 16 });
  body_fn[0] = b_read; body_fn[1] = b_read;
  kernel_run(k, 0);
  int32_t r2 = kernel_add_rule(k, 2, DK_BODY, 0, e0, 1, 0, 0, 0);
  CHECK(r2 == 1);
  kernel_run(k, 1); CHECK(kernel_table(k)[2] == 1);
  kernel_suspend(k, 0);
  kernel_write(k, 0, 5); kernel_settle(k);
  CHECK(kernel_table(k)[1] == 1 && kernel_table(k)[2] == 5);    /* suspended: inert; the added rule woke */
  kernel_resume(k, 0); CHECK(kernel_table(k)[1] == 5);           /* resumed: re-evaluated now */
  kernel_dispose(k, 1);
  kernel_write(k, 0, 6); kernel_settle(k);
  CHECK(kernel_table(k)[1] == 6 && kernel_table(k)[2] == 5);    /* disposed never runs */
  kernel_write(k, 0, NAN); kernel_settle(k); CHECK(isnan(kernel_table(k)[1]));
  kernel_write(k, 0, NAN); CHECK(kernel_pending(k) == 1);       /* NaN !== NaN: propagates again */
  printf("  lifecycle ok\n");
}

int main(void) {
  printf("kernel-test\n");
  test_chain(); test_diamond(); test_phases(); test_cycle(); test_ownership(); test_dynamic(); test_close(); test_lifecycle();
  printf("%d checks, %d failed\n", checks, fails);
  return fails ? 1 : 0;
}
