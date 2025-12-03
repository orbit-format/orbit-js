# Pull Request Guide

Use this checklist to make reviews faster and keep orbit-js releases predictable.

## Before you open a PR

1. **Explain the why** – Start the description with the problem you are solving.
2. **Link context** – Reference the related issue or discussion using `Closes #123` syntax when appropriate.
3. **Keep scope tight** – Separate unrelated fixes into their own pull requests.
4. **Update docs** – README, guides, inline JSDoc, and examples must reflect behavior changes.
5. **Add tests** – Cover new code paths or bug fixes with Vitest cases whenever possible.

## Required checks

- `pnpm run build` succeeds without TypeScript errors.
- `pnpm run test` passes locally.
- Formatting has been applied via `pnpm run format` (or your editor's Prettier integration).
- WASM artifacts or fixtures needed by tests are added to the repo (do not rely on unpublished assets).

## Review expectations

- Respond to reviewer comments within a few business days.
- Squash or rebase noisy fixup commits before requesting a final review.
- Re-run tests after force-pushes or when rebasing on `main`.
- Mention any follow-up work explicitly so maintainers can prioritize it.

## Definition of done

A pull request is ready to merge when:

- the description explains _why_ the change matters and how it was implemented,
- automated checks are green,
- documentation and tests match the new behavior, and
- at least one maintainer has approved the changes.
