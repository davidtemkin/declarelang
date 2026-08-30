# Releasing

Release notes are posted as **GitHub Releases** — a tag plus hand-written
notes. The Releases page is the changelog; there is no CHANGELOG.md to keep
in sync. Watchers can subscribe to releases alone, and each release page is a
stable, linkable record of what the language looked like when.

## When to cut a release

A release marks a change to the **language surface** — something a program's
author can see:

- a new form, keyword, or declaration modifier (`external`, …);
- a new verb or event on a built-in (`post`/`onPost`, …);
- new facts (`pageVisible`, `onScreen`, …) or methods on views;
- changed semantics of any of the above;
- a new embedding or host contract (the boot API, the sanctioned handles).

Internal work — renderer fixes, host performance, tooling — ships in whatever
release comes next; it may get a line, not a headline. The structural test:
**if the guide or the reference changed, it's notable.** A stretch of purely
internal pushes needs no release at all.

## How

1. Make sure the tree is green and pushed (`npm test`, derive fresh).
2. Bump `"version"` in package.json — **patch** (0.4.x) for the rolling
   cadence, which is almost every release: new forms, new verbs and facts,
   sharpened semantics of what already shipped — the language evolving in
   place. **Minor** only for a milestone that reframes what the language
   is — a new pillar of the model, a rework that re-teaches the guide.
   (Ruled 2026-08-30, after 0.4.0: the earlier "minor for new surface"
   rule would have cut a minor at nearly every release and marched the
   number to 1.0 long before the language is there.) Commit, push.
3. Write the notes. Teach, don't enumerate: what the new form is, why it
   exists, a small example — a reader should be able to use the feature from
   the notes alone. Commit messages are not release notes.
4. Tag and post:

   ```sh
   git tag v0.4.0 && git push --tags
   gh release create v0.4.0 --title "v0.4.0 — <the headline>" --notes-file notes.md
   ```

The version number is plain semver-shaped but carries no compatibility
promise before 1.0 — it orders releases, nothing more. `bundles/version.json`
is unrelated: that is the derive graph's cache-busting build hash.
