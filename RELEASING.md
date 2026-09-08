# Releasing

Versioning is semver, currently 0.x: **breaking changes bump the minor**,
everything else bumps the patch. 1.0.0 when the API freezes.

1. Update `CHANGELOG.md` with a section for the new version.
2. `npm version patch` (or `minor`) — bumps `package.json` and creates the
   `vX.Y.Z` commit + tag.
3. `git push --follow-tags`.

The `v*` tag fires `.github/workflows/publish.yml`, which verifies the tag
matches `package.json`'s version, runs the `prepublishOnly` gate (test,
typecheck, build), and publishes to npm with provenance.
