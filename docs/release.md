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

# 2. move the version in all three manifests. The root manifest counts: the package contract requires
#    every manifest to declare the same version, and `npm version --workspace` leaves the root behind.
#    --allow-same-version is for the first release: if the manifests already declare the version being
#    cut, npm otherwise exits 1 with "Version not changed" and the procedure stops here.
npm version <version> --allow-same-version --no-git-tag-version
npm version <version> --allow-same-version --workspace @trade/tokens --no-git-tag-version
npm version <version> --allow-same-version --workspace @trade/ui --no-git-tag-version

# 3. give the version its changelog section: "## [Unreleased]" keeps its heading, and a
#    "## [<version>] - YYYY-MM-DD" section goes below it. The gate will not cut without it.

# 4. everything that can run on a dirty tree
npm run ci

# 5. commit the bump, but do not push yet
git add -A && git commit -m "chore(release): v<version>"

# 6. the preconditions, mechanised: no uncommitted or stray-packaged files, cut from main rather than a
#    branch, a changelog section for the version, neither package private, both contracts, and the
#    version not already on the registry. It runs *before* the push on purpose: if it fails, the bump is
#    still a local commit that can be fixed or dropped, rather than a version already sitting on main.
npm run check:release

# 7. publish the commit the gate verified, then tag it
git push origin main
git tag -a v<version> -m "v<version>"
git push origin v<version>

# 8. publish, in dependency order. --access public is required: a scoped package publishes as
#    restricted by default, so without it the release either fails or is invisible to consumers.
npm publish --workspace @trade/tokens --access public
npm publish --workspace @trade/ui --access public
```

Replace `<version>` everywhere, including the tag names: a procedure that hardcodes `v0.1.0` either
fails on the next release or tags a version the packages do not declare.

`npm run check:release` is the gate that makes step 4 mechanical. It asserts the state of the world
that a release requires and stops otherwise; it does not publish anything. It is **not** part of
`npm run ci`, because half of what it checks is about the moment of cutting — a clean tree, a HEAD that
is `origin/main`, a version that is not already on the registry — none of which is true on a feature
branch. Its CI-checkable parts are covered by `npm run ci` itself.

## What the gate asserts

| Check | Why it matters |
|---|---|
| No uncommitted changes, and no untracked files inside the packages | the tag points at a commit — but npm packs *untracked* files that live in a package directory, so a stray `packages/ui/README.md` would ship without ever being reviewed |
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
