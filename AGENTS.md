# Repository Instructions

- Keep this repository public-safe: do not commit local tokens, credentials, `.codex-home*`, or generated session databases.
- Operate this repository with Git Flow. Use `main` as the production branch and `develop` as the integration branch.
- If `develop` does not exist yet, create it from `main`, push it to `origin`, and use it for normal development work.
- Start normal work from `develop` on `feature/<short-description>` branches, then merge completed features back into `develop`.
- Use `release/<version>` branches from `develop` for release stabilization, merge finished releases to `main`, tag them as `v<version>`, and merge the release result back to `develop`.
- Use `hotfix/<version>` branches from `main` for urgent production fixes, then merge the fix back to both `main` and `develop`.
- For normal documentation and code changes, commit to `develop` or finish a `feature/*` branch into `develop`, then push `develop` to `origin`.
- Push to `main` only when finishing a `release/*` or `hotfix/*` flow.
- Treat `CONTRIBUTING.md` and `docs/guide/contributing.md` as the public contribution SOT. Update them when the repository workflow, upstream PR policy, or public-safe checklist changes.
- For PRs back to the original upstream repository, create a small public-safe branch from the upstream base, port only the reusable change, verify it, then open the PR from this fork. Keep private workflow glue, local tokens, generated session data, and user-specific setup out of upstream PRs.
- After each meaningful change, run a focused verification command before committing and pushing the relevant Git Flow branch.
- For UI/browser behavior, verify with both script-based Playwright checks and `browser-use:browser` in the Codex in-app browser. Keep evidence from both surfaces when filing or updating issues.
- Prefer small commits that describe the working increment, such as adding the phone bridge, updating docs, or fixing protocol handling.
- Keep the Codex app-server bound to localhost in examples; expose only the token-protected bridge on the LAN.
