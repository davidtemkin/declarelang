// stand-in — what a production build's generated stand-ins share (declarec,
// compiler/src/capabilities.ts standIn). A capability the program never reaches
// is left out of the build; its modules are replaced by stand-ins whose inert
// exports answer benignly and whose every other export refuses — reaching one
// means the program did need the capability, so it says so, coded (notAboard).
import { notAboard } from "./errors.js";
/** The error a stand-in throws when reached. */
export const refusal = (what, why) => notAboard(what, why);
/** A function that refuses when called. */
export const refuse = (what, why) => () => { throw refusal(what, why); };
/** An object whose declared members answer and whose every other member refuses. */
export function refuseRest(known, name, why) {
    return new Proxy(known, {
        get: (t, k) => (k in t || typeof k === "symbol" ? t[k] : refuse(`${name}.${String(k)}`, why)),
    });
}
//# sourceMappingURL=stand-in.js.map