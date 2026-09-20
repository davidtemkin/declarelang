// BUILD FLAGS, substituted by the bundler (esbuild `define`) and folded away.
//
//   __DECLARE_DEV_SWITCHES__  the A/B switches and traces that exist to develop
//     the RUNTIME itself (the kernel's rings, the layout wave, the geometry
//     channel, the measure memo) — never for a developer testing an app, so
//     every shipping bundle defines it false and the guarded code, switch names
//     included, leaves the bundle. Only mac-host/profile/build-runtime.mjs
//     defines it true.
//   __DECLARE_NATIVE_KERNEL__  the Mac host's C kernel through JavaScriptCore
//     (kernel.md Phase D). Web builds define it false, so the native binding
//     goes with it. Absent (a plain `tsc` build) means present, since the Mac
//     bundle and the tests share that dist.
//
// THE GUARD IS WRITTEN AT THE SITE, never through a local const: esbuild
// substitutes the identifier but does not inline a `const` across statements,
// so a const would leave `false && …` standing with its strings. The `typeof`
// half is what makes a plain `tsc` build safe — an undefined identifier reads
// as "undefined" rather than throwing — and folds to a literal once defined.
declare const __DECLARE_DEV_SWITCHES__: boolean;
declare const __DECLARE_NATIVE_KERNEL__: boolean;

//   __DECLARE_INLINE_KERNEL__  the kernel's bytes compiled into the bundle as
//     base64. Absent means inline (a `tsc` build), and EVERY shipping build
//     defines it true (2026-09-18: a sidecar file cost a round trip before
//     first paint on a real device — reactive.ts kernelBytes). A build that
//     defines it false must name the sibling file that carries the bytes.
//   __DECLARE_KERNEL_FILE__  that sibling file's name, hashed by the build so
//     it caches immutably: "declare-kernel.<hash>.wasm.txt".
declare const __DECLARE_INLINE_KERNEL__: boolean;
declare const __DECLARE_KERNEL_FILE__: string;
//   __DECLARE_KERNEL_BYTES__  the module's exact byte length, so a transformed
//     delivery is caught at boot with a legible error rather than inside the
//     engine. 0 or absent skips the check (an inline build has nothing to check).
declare const __DECLARE_KERNEL_BYTES__: number;
//   __DECLARE_JS_KERNEL__  the JavaScript kernel and its switch. Imported
//     DYNAMICALLY, so it is never inlined; this flag removes even the switch and
//     the loader, and a PRODUCTION app build (declarec) defines it false — that
//     build carries nothing it does not need. Absent everywhere else: the dev
//     server's bundle, the platform tree and the tests can all run on it, which
//     is where breakpoints and the profiler are wanted.
declare const __DECLARE_JS_KERNEL__: boolean;
