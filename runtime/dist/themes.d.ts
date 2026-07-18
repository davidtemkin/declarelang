import { type Theme } from "./value.js";
export declare const Themes: Readonly<{
    sanFrancisco: (dark?: boolean) => Theme;
    cupertino: (dark?: boolean) => Theme;
    mountainView: (dark?: boolean) => Theme;
    /** An active tone derived from an accent — 22% over the surface tone. */
    tint(c: number, dark?: boolean): number;
}>;
