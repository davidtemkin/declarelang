export type Purpose = "text" | "name" | "email" | "username" | "password" | "newPassword" | "oneTimeCode" | "tel" | "url" | "digits" | "decimal" | "cardNumber" | "cardName" | "cardExpiry" | "cardCode" | "addressLine1" | "addressLine2" | "city" | "region" | "postalCode" | "country";
export interface PurposeHints {
    /** The HTML autofill field name; "" says nothing. */
    autocomplete: string;
    /** The HTML inputmode; "" leaves the platform's text keyboard. */
    inputmode: string;
    /** The HTML autocapitalize; "" leaves the platform's default. */
    autocapitalize: string;
    /** Spell-checking and autocorrection make sense for what it holds. */
    prose: boolean;
    /** What is typed is hidden unless the author says otherwise. */
    concealed: boolean;
}
export declare const PURPOSES: Record<Purpose, PurposeHints>;
export declare const PURPOSE_NAMES: Purpose[];
export declare const hintsOf: (p: string | undefined) => PurposeHints;
/** Write a field's purpose onto its native element: the autofill name, the
 *  keyboard, capitalization, whether what is typed shows, and what an
 *  on-screen keyboard's Return key says (`enterHint`: "next" in a form whose
 *  Return moves on, "go" on its last field). Idempotent. */
export declare function applyPurpose(el: HTMLInputElement | HTMLTextAreaElement, purpose: string, concealed: boolean, spellcheck: boolean, enterHint?: string): void;
