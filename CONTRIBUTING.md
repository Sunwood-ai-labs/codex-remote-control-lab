# Contributing

Thanks for helping make this lab easier to reuse.

## Development

```bash
npm ci
npm run check
npm run docs:build
```

For manual bridge testing:

```bash
npm run phone
```

Open the printed URL from a device on the same LAN. Keep the Codex app-server on `127.0.0.1`; only the token-protected bridge should listen on the LAN.

## Pull Requests

- Keep changes public-safe.
- Do not commit `.codex-home*`, `.phone-token`, `.uploads/`, logs, or generated session databases.
- Include a focused verification command in the PR notes.
- Update `README.md`, `README.ja.md`, or `docs/` when behavior changes.
- Codex review is requested automatically when a non-draft PR is opened, reopened, marked ready for review, or updated with new commits. The workflow posts one `@codex review` comment per head commit and does not check out or execute PR code.
