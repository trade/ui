## Why

<!-- What problem does this change solve? One short paragraph. Link the issue if one exists. -->

## Evidence

<!-- Measurements and the commands that produced them — same standard as commit bodies
     (CONTRIBUTING.md section 7). "It works" is not evidence; "verify 69/69, verify:example
     10/10, p95 16.7 ms over 90 frames, `npm run ci`" is. -->

## Checklist

- [ ] `npm run ci` green locally (and on this PR's CI run)
- [ ] Review comments triaged — the user's, Greptile's, `github-code-quality`'s and CodeQL's
      (inline, cross-file list, thread resolution, code-scanning alerts), **not just the check
      status**: `Greptile Review` reports *pass* while attaching findings, and CodeQL blocks only on
      errors, so a merge would otherwise sail past them (AGENTS.md git protocol has every command)
- [ ] `npm run verify:browser` run — required if anything touched styles, layout, or focus paths
- [ ] New states/behaviours have checks (Rule zero: a rule without a gate rots)
- [ ] New foreground/background pairs added to `check-contrast.mjs`
- [ ] README change-guide row updated if files/knobs changed; STATUS.md updated if known issues moved
- [ ] No generated output, credentials, or absolute local paths in the diff
