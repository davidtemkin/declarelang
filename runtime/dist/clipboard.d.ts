import { View } from "./view.js";
import { type FileRecord } from "./files.js";
/** What onClipboardCopy, onClipboardCut and onClipboardPaste receive. */
export declare class ClipboardEvent {
    /** the representations, by MIME type — what a paste found, or what a copy put */
    private readonly data;
    /** files and images on the clipboard (a paste), as file records */
    readonly files: readonly FileRecord[];
    constructor(data?: Map<string, string>, files?: readonly FileRecord[]);
    /** The MIME types on offer, in the order they were put. */
    get types(): string[];
    /** The plain text — "" when there is none. */
    get text(): string;
    /** One representation, or null when the clipboard has none of that type. */
    get(type: string): string | null;
    /** Put a representation: `put(text)` is plain text, `put(type, data)` any other. */
    put(typeOrText: string, data?: string): void;
    /** What a copy put, as a plain record. */
    $put(): Record<string, string>;
}
/** A host's own clipboard (the native host's pasteboard). */
export interface ClipboardHost {
    write(data: Record<string, string>): void;
}
export declare function provideClipboardHost(h: ClipboardHost | null): void;
/** Is there a view in `app` that takes this command now? (The native host
 *  enables its Edit menu's item by it.) */
export declare function takesClipboard(app: View, kind: "copy" | "cut" | "paste"): boolean;
/** ⌘C or ⌘X: the representations the taker put, or null when no view takes it
 *  or it put nothing (the platform's own copy then goes ahead). */
export declare function deliverCopy(app: View, kind: "copy" | "cut"): Record<string, string> | null;
/** ⌘V: the clipboard's representations and files, to the view that takes it.
 *  Returns whether one did. */
export declare function deliverPaste(app: View, data: Record<string, string>, files?: readonly FileRecord[]): boolean;
/** Writing to the clipboard from a press — a "Copy link" button. Takes plain
 *  text, or representations by MIME type. Call it from what the person does: a
 *  browser allows the write only then. */
export declare const Clipboard: {
    copy(what: string | Record<string, string>): void;
};
/** A browser host: the page's copy, cut and paste events. A text field's are
 *  left to it, and so is a copy of text selected on the page; a command no view
 *  takes is left to the browser. */
export declare function wireClipboard(app: View): () => void;
