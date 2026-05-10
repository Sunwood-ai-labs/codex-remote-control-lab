# Repository Instructions

- Keep this repository public-safe: do not commit local tokens, credentials, `.codex-home*`, or generated session databases.
- Operate this repository with Git Flow. Use `main` as the production branch and `develop` as the integration branch.
- If `develop` does not exist yet, create it from `main`, push it to `origin`, and use it for normal development work.
- Start normal work from `develop` on `feature/<short-description>` branches, then merge completed features back into `develop`.
- Use `release/<version>` branches from `develop` for release stabilization, merge finished releases to `main`, tag them as `v<version>`, and merge the release result back to `develop`.
- Use `hotfix/<version>` branches from `main` for urgent production fixes, then merge the fix back to both `main` and `develop`.
- After each meaningful change, run a focused verification command, commit the change, and push the active Git Flow branch to `origin` when a remote is configured.
- Prefer small commits that describe the working increment, such as adding the phone bridge, updating docs, or fixing protocol handling.
- Keep the Codex app-server bound to localhost in examples; expose only the token-protected bridge on the LAN.
