# Contributing and Upstream PRs

This project keeps two contribution paths separate:

- normal development in this repository, using the Git Flow rules in `AGENTS.md`
- upstream contributions back to the original repository, using small public-safe PRs

## Source of Truth

`AGENTS.md` is the repository workflow SOT for local agents and maintainers. `CONTRIBUTING.md` and this page are the public contributor SOT. When workflow, behavior, or public-safety rules change, update the relevant README/docs page in the same change.

## Normal Repository Work

Use `develop` for integration work. Start normal features from `develop` on a `feature/<short-description>` branch, then merge finished work back into `develop`. Push `main` only through a release or hotfix flow.

Before handoff, run the focused check that matches the change. For code changes this is usually:

```bash
npm run check
```

For documentation changes, also run:

```bash
npm run docs:build
```

## Public-Safe Checklist

Do not commit local-only or sensitive files:

- `.codex-home*`
- `.phone-token`
- `.phone-workspaces.json`
- `.uploads/`
- logs
- generated session databases
- local `.env` credentials or webhook URLs

Keep examples localhost-first. The Codex app-server should remain bound to `127.0.0.1`; expose only the token-protected bridge on the LAN.

## Upstream Pull Requests

If this repository is a fork, an upstream PR is possible when the change is reusable by the original project and does not depend on private local setup.

Recommended flow:

1. Check remotes with `git remote -v`.
2. Fetch the upstream remote.
3. Create a branch from the upstream target branch.
4. Port only the reusable commits or hunks.
5. Run the focused verification command.
6. Push the branch to the fork.
7. Open a PR from the fork branch to the upstream repository.

Do not send local workflow glue, private notification setup, tokens, machine-specific paths, or generated session data upstream. If the fork has diverged heavily, split the PR into smaller reviewable pieces or open an upstream issue first.
