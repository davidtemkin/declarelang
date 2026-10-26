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
/** A host's own file dialog (the native host's open panel). */
export interface FilesHost {
    pick(options: PickOptions): Promise<FileRecord[]>;
}
export declare function provideFilesHost(h: FilesHost | null): void;
/** The file dialog. Call it from what the person does — a press, a click — as
 *  a browser allows a file dialog only then; it resolves to the files chosen,
 *  none if the dialog was dismissed. */
export declare const FilePicker: {
    pick(options?: PickOptions): Promise<FileRecord[]>;
};
/** A drag of files over an app, at root point (x, y): `over` while it moves,
 *  `out` when it leaves, `drop` with the files. Returns whether a view there
 *  takes them. The native host calls this; the browser's listeners below do. */
export declare function deliverFiles(app: View, kind: "over" | "out" | "drop", x: number, y: number, count: number, files?: readonly FileRecord[]): boolean;
/** A browser host: its drag events on the app's element. A drag that is not of
 *  files is left alone; one over a view that takes files is allowed, and one
 *  anywhere else in the app is refused, so a file dropped beside a target is
 *  not opened by the browser in place of the app. */
export declare function wireFiles(app: View, el: HTMLElement): void;
/** A DataSource body that holds files, as a form: each field a part, a file a
 *  file part (a list of files, one part each), any other object as JSON text.
 *  null when the body holds no file — it goes as JSON, as before. */
export declare function formBody(body: unknown): Promise<FormData | null>;
