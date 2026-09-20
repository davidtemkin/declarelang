/* The kernel inside a JavaScriptCore context (the Mac host): the same ABI the
 * WASM build exports, as JS functions on `globalThis.__declareNativeKernel`,
 * with the kernel's memory reached through zero-copy typed-array views. The
 * runtime's loader (kernel-loader.ts) binds either the WASM exports or this
 * object to one `Kernel` surface. Every call happens on the JSContext's thread. */
#ifndef DECLARE_KERNEL_JSC_H
#define DECLARE_KERNEL_JSC_H
#include <JavaScriptCore/JavaScriptCore.h>
#ifdef __cplusplus
extern "C" {
#endif
void declare_kernel_install(JSGlobalContextRef ctx);
#ifdef __cplusplus
}
#endif
#endif
