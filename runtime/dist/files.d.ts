import { View } from "./view.js";
/** A file the person chose or dropped. */
export interface FileRecord {
    readonly name: string;
    readonly size: number;
    readonly type: string;
    readonly modified: number;
    readonly path: string;
    readonly url: string;
}
/** What `FilePicker.pick` takes: the types offered (MIME types or extensions,
 *  `["image/*", ".csv"]`), more than one file, or a whole folder. */
export interface PickOptions {
    accept?: readonly string[];
    multiple?: boolean;
    folder?: boolean;
}
/** What `FilePicker.save` takes: the file's name, with its extension, and its
 *  MIME type (from the name's extension when left out). */
export interface SaveOptions {
    name: string;
    type?: string;
}
/** A host's own file dialogs (the native host's open and save panels). `save`
 *  is handed the bytes and answers whether the person saved them. */
export interface FilesHost {
    pick(options: PickOptions): Promise<FileRecord[]>;
    save?(bytes: Uint8Array, options: SaveOptions): Promise<boolean>;
}
export declare function provideFilesHost(h: FilesHost | null): void;
export declare function fromBrowser(f: File, path: string): FileRecord;
export declare function adopt(list: readonly FileRecord[]): FileRecord[];
/** The file dialog. Call it from what the person does — a press, a click — as
 *  a browser allows a file dialog only then; it resolves to the files chosen,
 *  none if the dialog was dismissed. */
export declare const FilePicker: {
    pick(options?: PickOptions): Promise<FileRecord[]>;
    /** Hand the person a file the program made: text, or a Blob's bytes. The
     *  program makes the contents (a CSV, a JSON backup, a calendar file); this
     *  delivers them. A browser downloads it, to where its downloads go; the
     *  native host shows its save panel, opening in Downloads with the name filled
     *  in. Resolves to whether it was saved: false when the person cancelled.
     *  (A browser does not say, and resolves true.) */
    save(contents: string | Blob, options: SaveOptions): Promise<boolean>;
};
/** A drag of files over an app, at root point (x, y): `over` while it moves,
 *  `out` when it leaves, `drop` with the files. Returns whether a view there
 *  takes them. The native host calls this; the browser's listeners below do. */
export declare function deliverFiles(app: View, kind: "over" | "out" | "drop", x: number, y: number, count: number, files?: readonly FileRecord[]): boolean;
/** A browser host: its drag events on the app's element. A drag that is not of
 *  files is left alone; one over a view that takes files is allowed, and one
 *  anywhere else in the app is refused, so a file dropped beside a target is
 *  not opened by the browser in place of the app. */
export declare function wireFiles(app: View, el: HTMLElement): () => void;
/** A DataSource body that holds files, as a form: each field a part, a file a
 *  file part (a list of files, one part each), any other object as JSON text.
 *  null when the body holds no file — it goes as JSON, as before. */
export declare function formBody(body: unknown): Promise<FormData | null>;
