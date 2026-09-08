# Releasing

Versioning is semver, currently 0.x: **breaking changes bump the minor**,
everything else bumps the patch (`bump-minor-pre-major` +
`bump-patch-for-minor-pre-major`). 1.0.0 when the API freezes.

Releases are automated by [release-please]
(`.github/workflows/release.yml`):

1. Merge PRs with conventional squash titles (`feat:`, `fix:`, `docs:`, …).
2. release-please maintains a rolling Release PR on main — version bump +
   generated `CHANGELOG.md` entry.
3. Merging the Release PR tags `vX.Y.Z`, creates the GitHub Release, and the
   same workflow publishes to npm (`prepublishOnly` — test, typecheck,
   build — is the one gate).

Escape hatches:

- Force a specific version with a `Release-As: x.y.z` footer on a commit
  (e.g. an empty `chore` commit).
- `docs:`/`chore:`-only merges don't trigger a release; they accumulate and
  ship with the next `feat`/`fix`, or force one with `Release-As`.

[release-please]: https://github.com/googleapis/release-please-action
