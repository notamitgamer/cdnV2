## What does this change?

<!-- A short description, and the issue it closes (e.g. "Closes #12"). -->

## Why?

## How was it tested?

<!-- Commands run, pages checked, or "docs only". -->

## Checklist

- [ ] The change is focused on one thing
- [ ] `ruff check --select E9,F63,F7,F82 app` and `python -m compileall -q app` pass
- [ ] README / `.env.example` / in-app docs updated if behaviour or configuration changed
- [ ] No secrets, tokens or `.env` files are included
- [ ] Existing deployments keep working (or the change is marked as breaking)
