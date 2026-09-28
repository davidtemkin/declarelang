import { notAboard } from "./errors.js";
type Refusal = Parameters<typeof notAboard>[1];
/** The error a stand-in throws when reached. */
export declare const refusal: (what: string, why: Refusal) => Error;
/** A function that refuses when called. */
export declare const refuse: (what: string, why: Refusal) => () => never;
/** An object whose declared members answer and whose every other member refuses. */
export declare function refuseRest<T extends object>(known: T, name: string, why: Refusal): T;
export {};
