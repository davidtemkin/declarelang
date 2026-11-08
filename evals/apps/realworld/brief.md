# Conduit: a brief

Build **Conduit**, the RealWorld example app: a Medium-like place to publish articles, read
them, comment on them, favorite them, follow their authors, and filter them by tag.
RealWorld is a shared specification that many frameworks implement the same way, so that
they can be compared. Build yours to that specification.

The specification is in `spec/`:

- `features.md` — what the app does.
- `routing.md` — its pages and their URLs.
- `templates.md` — every page, as HTML, with the theme's classes.
- `styles.md` and `styles.css` — the shared Conduit theme, with its fonts and icons, and
  `default-avatar.svg` for a user with no image.
- `expectations.md` — how the community expects an implementation to be written.

Conduit looks like the templates in the shared theme: the same layout, type, colours,
spacing and states. Someone who knows Conduit should recognise yours at a glance.

Every record lives behind a service that implements the RealWorld API, described in
`api/API.md`. It is already written and already running, with a community's worth of users,
articles, comments and tags. It also has a demo account you can sign in with. You never
write a server.

---

## Delivering it

Write it idiomatically, following the platform's established best practices, as code that
other people will read and maintain. Use the ecosystem's established libraries where one
fits, as a maintainer would expect.

The service runs separately, on port 8380. Check your work in the browser.
