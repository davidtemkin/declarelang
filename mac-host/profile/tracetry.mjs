// a tiny program, traced end to end
process.env.DECLARE_KERNEL_TRACE = "/private/tmp/claude-503/-Users-temkin-Code-Declare/c4b17870-b7f5-4138-a938-c0fe32a94c4c/scratchpad/try.trace";
const { kernelReadySync, kernel } = await import("/Users/temkin/Code/Declare-Optimize/runtime/dist/reactive.js");
kernelReadySync();
const K = kernel();
const a = K.addCell(0, false), b = K.addCell(0, false), out = K.addCell(0, false);
K.set(a, 3); K.set(b, 4);
// out = a + b, as an expression rule
const code = K.addCode([1, a, 1, b, 3, 0]);   // LOAD a, LOAD b, ADD, END
const rule = K.addExprRule(out, 0, [a, b], code, 6);
K.own(out, rule);
K.run(rule);
console.log("out =", K.table[out]);
K.set(a, 10);
K.settle();
console.log("after a := 10, out =", K.table[out]);
const t = globalThis.__declareTrace;
console.log("trace:", t.steps.length, "steps,", t.marks.length, "settle mark(s), fingerprint", t.marks[0]?.sum);
console.log("first steps:", JSON.stringify(t.steps.slice(0, 6)));
