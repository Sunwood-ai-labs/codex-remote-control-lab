# Repository Instructions

- Keep this repository public-safe: do not commit local tokens, credentials, `.codex-home*`, or generated session databases.
- After each meaningful change, run a focused verification command, commit the change, and push it to `origin/main` when a remote is configured.
- Prefer small commits that describe the working increment, such as adding the phone bridge, updating docs, or fixing protocol handling.
- Keep the Codex app-server bound to localhost in examples; expose only the token-protected bridge on the LAN.
