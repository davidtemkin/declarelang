// What a text field holds (TextInput.purpose), and what the platform is told about
// it: the autofill name a browser and a password manager match on (`autocomplete`),
// the on-screen keyboard a phone brings up (`inputmode`), and whether the platform
// should capitalize or spell-check what is typed. One fact from the author; each
// backend reads its row here, so a DOM field and a canvas overlay say the same.
const row = (autocomplete, inputmode = "", autocapitalize = "", prose = false, concealed = false) => ({ autocomplete, inputmode, autocapitalize, prose, concealed });
export const PURPOSES = {
    text: row("", "", "", true),
    name: row("name", "", "words"),
    email: row("email", "email", "none"),
    username: row("username", "", "none"),
    password: row("current-password", "", "none", false, true),
    newPassword: row("new-password", "", "none", false, true),
    oneTimeCode: row("one-time-code", "numeric", "none"),
    tel: row("tel", "tel", "none"),
    url: row("url", "url", "none"),
    digits: row("", "numeric", "none"),
    decimal: row("", "decimal", "none"),
    cardNumber: row("cc-number", "numeric", "none"),
    cardName: row("cc-name", "", "words"),
    cardExpiry: row("cc-exp", "numeric", "none"),
    cardCode: row("cc-csc", "numeric", "none"),
    addressLine1: row("address-line1", "", "words"),
    addressLine2: row("address-line2", "", "words"),
    city: row("address-level2", "", "words"),
    region: row("address-level1", "", "words"),
    postalCode: row("postal-code", "", "characters"),
    country: row("country-name", "", "words"),
};
export const PURPOSE_NAMES = Object.keys(PURPOSES);
export const hintsOf = (p) => PURPOSES[(p ?? "text")] ?? PURPOSES.text;
/** Write a field's purpose onto its native element: the autofill name, the
 *  keyboard, capitalization, whether what is typed shows, and what an
 *  on-screen keyboard's Return key says (`enterHint`: "next" in a form whose
 *  Return moves on, "go" on its last field). Idempotent. */
export function applyPurpose(el, purpose, concealed, spellcheck, enterHint = "") {
    const h = hintsOf(purpose);
    const set = (name, v) => {
        if (v === "") {
            if (el.hasAttribute(name))
                el.removeAttribute(name);
        }
        else if (el.getAttribute(name) !== v)
            el.setAttribute(name, v);
    };
    set("autocomplete", h.autocomplete);
    // a password manager matches a field by its name as well as its autofill name
    set("name", h.autocomplete);
    set("inputmode", h.inputmode);
    set("autocapitalize", h.autocapitalize);
    set("autocorrect", h.prose ? "" : "off");
    set("enterkeyhint", enterHint);
    const check = spellcheck && h.prose;
    if (el.spellcheck !== check)
        el.spellcheck = check;
    if (el instanceof HTMLInputElement) {
        const type = concealed ? "password" : "text";
        if (el.type !== type)
            el.type = type;
    }
}
//# sourceMappingURL=purpose.js.map