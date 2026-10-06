/** The handler member name for an event: click → onClick. */
export declare const handlerName: (event: string) => string;
/** The event a handler-shaped name answers (onClick → click), or null when
 *  the name is not handler-shaped. Handler-shaped is exactly `on` + a
 *  capital (the doc's rule — what keeps handlers out of the plain-method
 *  namespace), so `once` or `onward` are plain method names. */
export declare function eventOfHandler(name: string): string | null;
