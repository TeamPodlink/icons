## What does this PR do?

<!-- Brief description of the change -->

## Platforms affected

<!-- List platform IDs, e.g. spotify, apple -->

-

## Type of change

- [ ] New platform(s)
- [ ] Update existing icon(s)
- [ ] Remove platform(s)
- [ ] Non-icon change (docs, scripts, etc.)

## Icon checklist

<!-- Complete for PRs that add or modify source icons. Skip for non-icon changes. -->

- [ ] `icon.svg` exists for each platform (`viewBox="0 0 32 32"`, `xmlns` set)
- [ ] `badge.svg` added if the badge icon needs different clipping than a squircle
- [ ] `badge-dark.svg` added only if the dark variant visually differs from light
- [ ] Entry added/updated in `src/data/platforms.json` with `id`, `name`, and `active`
- [ ] Platform ID is lowercase alphanumeric (no special characters)
- [ ] `pnpm validate` passes
- [ ] `pnpm build` completes without errors

## Notes

<!-- Any additional context, links to brand guidelines, etc. -->

<!--
See "Adding a new platform" in CLAUDE.md for the full guide.
-->
