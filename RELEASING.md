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
2. Bump `"version"` in package.json (minor for new surface, patch for a
   fix to surface already released), commit, push.
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
