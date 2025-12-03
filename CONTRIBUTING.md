# Contributing to orbit-js

Thanks for helping improve orbit-js! This guide explains how to propose
changes, report issues, and share feedback in a way that keeps maintenance
streamlined for everyone involved.

## Before you start

- **Code of Conduct** – By participating you agree to follow the
  [Code of Conduct](CODE_OF_CONDUCT.md).
- **Tooling** – The project requires Node.js 18+, [pnpm](https://pnpm.io/), and
  a modern TypeScript toolchain.
- **Search first** – Look through existing issues and pull requests before
  filing something new. Duplicates slow the review process.

## Getting set up

```sh
pnpm install
pnpm run build
```

- `pnpm run build` compiles TypeScript to `dist/` and ensures the WebAssembly
  artifact has been downloaded.
- `pnpm run test` executes the Vitest suite. Run it before you open a pull
  request.
- `pnpm run clean` removes build outputs so you can start fresh.

## Making changes

1. Fork the repository and create a feature branch.
2. Keep each pull request focused on a single problem or feature.
3. Update or add tests alongside behavioral changes.
4. Update the documentation (README, guides, inline comments) whenever the
   public API or developer workflow changes.

Follow the existing TypeScript style. The repo relies on Prettier for
formatting; running `pnpm run format` before committing will take care of most
style nits automatically.

## Commit messages

Use clear, imperative commit messages ("Add Orbit parser docs" instead of
"Added" or "Adding"). Group related file changes together and avoid noisy
commits such as whitespace-only edits.

## Submitting a pull request

- Review the [Pull Request Guide](docs/pull_request_guide.md) for a concise
  checklist of what maintainers look for.
- Fill out every relevant section of the pull-request template. This helps
  reviewers understand _why_ the change exists.
- Link the issue you are addressing (if any) in the pull request description.
- Ensure CI passes before requesting a review.

Maintainers triage incoming pull requests regularly. Please be responsive to
feedback—clarify open questions, add follow-up commits, or explain trade-offs as
needed.

## Reporting issues

- **Bugs** – Use the "Bug report" template so we can reproduce the problem.
  Include steps, expected vs. actual results, and environment details.
- **Feature requests** – Use the "Feature request" template to describe the use
  case and success criteria.
- **Security issues** – Follow the instructions in [SECURITY.md](SECURITY.md).

Thanks again for taking the time to make orbit-js better!
