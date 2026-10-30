// verify-locators — Playwright's way of finding things, on an assert script's
// `page`: `page.getByRole("button", { name: "Pay" })`, `getByLabel`, `getByText`,
// `getByPlaceholder`. Agents and testers reach for these first; without them
// they left the checker for a harness of their own (Venue runs 11 and 13), and
// its layout checks went with it. A locator here finds what a person would — by
// role and accessible name, label, text — and acts through the driver's own
// input: a press is a real press (a finger on a touch device), and every action
// waits for the program to settle, as the driver's verbs do.
//
// The subset: getByRole / getByLabel / getByText / getByPlaceholder, each taking
// `{ name?, exact? }` (substring, case-insensitive, unless exact; a RegExp
// matches as one); a locator's first() / last() / nth(i) / count(); its
// click() / fill(v) / press(key) / check() / uncheck() / focus(); and its
// isVisible() / isHidden() / isEnabled() / isDisabled() / isChecked() /
// innerText() / textContent() / inputValue() / getAttribute(n) / waitFor({ state }).
// An action waits (on the driven clock) up to 5 s for exactly one visible match;
// two or more is an error naming them, as Playwright's strict mode is.

/** `page`, with the locators added. `act` presses at a window point, as the
 *  driver does; `settle` lets the program answer an action; `advance` moves the
 *  page's clock (its timers are virtual) while a locator waits. */
export function withLocators(page, { act, settle, advance }) {
  // ── finding, in the page ───────────────────────────────────────────────
  // Each query returns the matching elements' indexes in a fresh snapshot of
  // the candidates, so an action re-resolves (the program may have rebuilt them).
  const find = (q) => page.evaluate((q) => {
    const IMPLICIT = (el) => {
      const r = el.getAttribute("role");
      if (r) return r;
      const t = el.tagName.toLowerCase();
      if (t === "button") return "button";
      if (t === "a" && el.hasAttribute("href")) return "link";
      if (/^h[1-6]$/.test(t)) return "heading";
      if (t === "textarea") return "textbox";
      if (t === "select") return "combobox";
      if (t === "input") {
        const ty = (el.getAttribute("type") || "text").toLowerCase();
        return ty === "checkbox" ? "checkbox" : ty === "radio" ? "radio" : ty === "range" ? "slider"
          : ty === "search" ? "searchbox" : ty === "button" || ty === "submit" ? "button" : "textbox";
      }
      return null;
    };
    const text = (el) => (el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
    const labelOf = (el) => {
      const a = el.getAttribute("aria-label");
      if (a) return a;
      const by = el.getAttribute("aria-labelledby");
      if (by) return by.split(/\s+/).map((id) => text(document.getElementById(id) ?? document.createElement("i"))).join(" ").trim();
      if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return text(l); }
      const wrap = el.closest("label");
      return wrap ? text(wrap) : "";
    };
    const nameOf = (el) => labelOf(el) || (IMPLICIT(el) === "textbox" ? el.getAttribute("placeholder") || "" : text(el));
    const fits = (s, want) => {
      if (want == null) return true;
      if (want.re) return new RegExp(want.re, want.flags).test(s);
      return q.exact ? s === want.s : s.toLowerCase().includes(want.s.toLowerCase());
    };
    const all = [...document.querySelectorAll("*")];
    let hits;
    if (q.by === "role") hits = all.filter((el) => IMPLICIT(el) === q.role && fits(nameOf(el), q.name));
    else if (q.by === "label") hits = all.filter((el) => { const r = IMPLICIT(el); return r !== null && labelOf(el) !== "" && fits(labelOf(el), q.name); });
    else if (q.by === "placeholder") hits = all.filter((el) => el.hasAttribute("placeholder") && fits(el.getAttribute("placeholder"), q.name));
    else hits = all.filter((el) => fits(text(el), q.name) && ![...el.children].some((c) => fits(text(c), q.name)));
    const shown = (el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    window.__locHits = hits;
    return hits.map((el, i) => ({ i, shown: shown(el), what: `<${el.tagName.toLowerCase()}${el.getAttribute("role") ? ` role=${el.getAttribute("role")}` : ""}> "${nameOf(el).slice(0, 60)}"` }));
  }, q);
  const on = (i, fn, arg) => page.evaluate((i, fn, arg) => new Function("el", "arg", `return (${fn})(el, arg)`)(window.__locHits[i], arg), i, fn.toString(), arg);

  const describe = (q) => `${q.by === "role" ? `getByRole("${q.role}"` : `getBy${q.by[0].toUpperCase()}${q.by.slice(1)}(`}${q.name == null ? "" : `${q.by === "role" ? ", { name: " : ""}${q.name.re ? `/${q.name.re}/` : JSON.stringify(q.name.s)}${q.by === "role" ? " }" : ""}`})${q.pick == null ? "" : `.${q.pick}`}`;

  // one match to act on: visible ones count, waiting (the driven clock moving)
  // up to 5 s for there to be exactly one
  const one = async (q) => {
    const until = Date.now() + 5000;
    for (;;) {
      const found = (await find(q)).filter((h) => h.shown);
      const chosen = q.index == null ? found : q.index === -1 ? found.slice(-1) : found.slice(q.index, q.index + 1);
      if (chosen.length === 1 || (q.index == null && found.length > 1)) {
        if (q.index == null && found.length > 1) throw new Error(`${describe(q)} matches ${found.length} elements — name it more closely, or take .first(), .nth(i): ${found.map((h) => h.what).join(", ")}`);
        return chosen[0].i;
      }
      if (Date.now() > until) throw new Error(`${describe(q)} found nothing visible within 5 s`);
      await advance(50);
      await new Promise((r) => setTimeout(r, 30));
    }
  };

  const locator = (q) => ({
    first: () => locator({ ...q, index: 0, pick: "first()" }),
    last: () => locator({ ...q, index: -1, pick: "last()" }),
    nth: (n) => locator({ ...q, index: n, pick: `nth(${n})` }),
    async count() { return (await find(q)).filter((h) => h.shown).length; },
    async click() {
      const i = await one(q);
      await on(i, (el) => el.scrollIntoView({ block: "nearest" }));
      const b = await on(i, (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await act(b.x, b.y);
      await settle();
    },
    async check() { if (!(await this.isChecked())) await this.click(); },
    async uncheck() { if (await this.isChecked()) await this.click(); },
    async focus() { const i = await one(q); await on(i, (el) => el.focus()); await settle(); },
    async fill(value) {
      const i = await one(q);
      await on(i, (el) => { el.focus(); if (typeof el.select === "function") el.select(); });
      if (String(value) === "") await page.keyboard.press("Backspace");
      else await page.keyboard.type(String(value));
      await settle();
    },
    async press(key) { const i = await one(q); await on(i, (el) => el.focus()); await page.keyboard.press(key); await settle(); },
    async isVisible() { const hs = await find(q); const pick = q.index == null ? hs : q.index === -1 ? hs.slice(-1) : hs.slice(q.index, q.index + 1); return pick.some((h) => h.shown); },
    async isHidden() { return !(await this.isVisible()); },
    async isDisabled() { const i = await one(q); return on(i, (el) => el.disabled === true || el.getAttribute("aria-disabled") === "true"); },
    async isEnabled() { return !(await this.isDisabled()); },
    async isChecked() { const i = await one(q); return on(i, (el) => el.checked === true || el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-pressed") === "true"); },
    async innerText() { const i = await one(q); return on(i, (el) => el.innerText); },
    async textContent() { const i = await one(q); return on(i, (el) => el.textContent); },
    async inputValue() { const i = await one(q); return on(i, (el) => el.value ?? ""); },
    async getAttribute(n) { const i = await one(q); return on(i, (el, n) => el.getAttribute(n), n); },
    async waitFor({ state = "visible", timeout = 5000 } = {}) {
      const until = Date.now() + timeout;
      for (;;) {
        const hs = await find(q);
        const vis = hs.some((h) => h.shown);
        if ((state === "visible" && vis) || (state === "hidden" && !vis) || (state === "attached" && hs.length > 0) || (state === "detached" && hs.length === 0)) return;
        if (Date.now() > until) throw new Error(`${describe(q)} did not become ${state} within ${timeout} ms`);
        await advance(50);
        await new Promise((r) => setTimeout(r, 30));
      }
    },
  });
  const name = (n) => n == null ? null : n instanceof RegExp ? { re: n.source, flags: n.flags } : { s: String(n) };
  const added = {
    getByRole: (role, o = {}) => locator({ by: "role", role, name: name(o.name), exact: o.exact === true }),
    getByLabel: (n, o = {}) => locator({ by: "label", name: name(n), exact: o.exact === true }),
    getByText: (n, o = {}) => locator({ by: "text", name: name(n), exact: o.exact === true }),
    getByPlaceholder: (n, o = {}) => locator({ by: "placeholder", name: name(n), exact: o.exact === true }),
  };
  return new Proxy(page, {
    get(t, k) {
      if (k in added) return added[k];
      const v = t[k];
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
}
