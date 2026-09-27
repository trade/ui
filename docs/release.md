# Releasing

Two packages publish together: `@trade/tokens` first, then `@trade/ui`. **The order is a dependency** —
`@trade/ui` re-exports the token contract and its stylesheets are generated from `@trade/tokens`
output, so a release that publishes them the other way round leaves a window where the consumer-facing
package refers to tokens that do not exist yet.

Nothing here is automated end to end, and that is deliberate: **the gate proves the preconditions, a
human supplies the credentials.** No script in this repository holds a token or calls `npm publish`.

## Before you start

Two facts that only you can establish:

1. **You can publish to the scope.** `@trade/ui` and `@trade/tokens` must belong to your npm
   organisation or account. A scope you do not own fails at `npm publish` with a 403, after the tag and
   changelog have been written.
2. **You know where they go** — public npm, or a private registry. The procedure below is the public
   registry; the gate is identical either way.

## The procedure

```powershell
# 1. the tree is the release, so it has to be the release commit
git fetch origin
git switch main && git pull --ff-only

# 2. move the version in one place, in both manifests
npm version <major|minor|patch> --workspace @trade/tokens --no-git-tag-version
npm version <same> --workspace @trade/ui --no-git-tag-version

# 3. give the version its changelog section, then move it out of Unreleased
#    (CHANGELOG.md: "## [Unreleased]" gains a "## [x.y.z] - YYYY-MM-DD" below it)

# 4. the preconditions, mechanised
npm run ci
npm run check:release

# 5. commit the bump, tag, and push the tag
git add -A && git commit -m "chore(release): v0.1.0"
git tag -a v0.1.0 -m "v0.1.0"
git push origin main --follow-tags

# 6. publish, in dependency order
npm publish --workspace @trade/tokens
npm publish --workspace @trade/ui
```

`npm run check:release` is the gate that makes step 4 mechanical. It asserts the state of the world
that a release requires and stops otherwise; it does not publish anything. It is **not** part of
`npm run ci`, because half of what it checks is about the moment of cutting — a clean tree, a HEAD that
is `origin/main`, a version that is not already on the registry — none of which is true on a feature
branch. Its CI-checkable parts are covered by `npm run ci` itself.

## What the gate asserts

| Check | Why it matters |
|---|---|
| The working tree is clean | the tag points at a commit, so uncommitted work is work that does not ship |
| `HEAD` is `origin/main` | cutting from a branch tags something nobody reviewed |
| A changelog entry exists for the version | the changelog is what a consumer reads first; a version with no section is a version nobody can evaluate |
| Neither package is `private` | a `private: true` manifest silently cannot be published |
| The packaging contract passes (`check:pack`) | the tarball is the release artifact — reused rather than restated here |
| The package contract passes (`check-contract`) | zero runtime dependencies, peer-only React, and one version across manifests and the build |
| The version is not already published | npm rejects republishing a version; better to find out here than after tagging |

## After publishing

- Verify from outside, as a consumer rather than as the author:
  `npm view @trade/ui version` and `npm view @trade/tokens version` must both answer with the version
  you just cut.
- The strongest available check is already in the suite: `npm run verify:consumer` installs the *packed
  tarball* into a project outside the repository and uses it. It is the closest thing to a stranger's
  first `npm install`.
- If the release was wrong, `npm deprecate @trade/ui@x.y.z "reason"` is the withdrawal mechanism. Do not
  unpublish: it breaks every lockfile that resolved the version in the window before it was removed.

## Versioning

Versions are SemVer. The library is pre-1.0, so minor versions may contain breaking changes; the
changelog says so explicitly rather than leaving a consumer to infer it.

The token schema has **its own** version (`schemaVersion` in `packages/tokens/tokens.json`) and moving
it is a separate decision from bumping the packages — a consumer reading `tokens.css` sees both numbers,
labelled. See [design-tokens.md](design-tokens.md).
