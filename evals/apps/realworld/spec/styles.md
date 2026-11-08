---
title: Styles
---

All frontend implementations should use the shared theme, `styles.css` (in this folder). This is a single CSS file (Conduit Minimal CSS v4) that includes only the classes actually used by Conduit.

The CSS classes it provides match the templates (`templates.md`).

### Fonts and icons

`styles.css` covers layout and components only — it does **not** bundle fonts or icons, so load these separately in your `<head>`:

- **Fonts:** the theme uses `Source Sans Pro` (body) and `Lora` (headings/article text). Without them, browsers fall back to generic sans-serif/serif. Load them however you prefer (e.g. Google Fonts).
- **Icons:** the templates use `ion-*` classes (`ion-heart`, `ion-compose`, `ion-edit`, `ion-gear-a`, `ion-plus-round`, `ion-trash-a`, `ion-close-round`) from the legacy [Ionicons](https://ionic.io/ionicons) v2 set. Load an icon stylesheet that provides them, or substitute equivalent icons of your own.

### Default Avatar

When a user has no profile image, implementations should display the default avatar, `default-avatar.svg` (in this folder) (a smiley face icon).
