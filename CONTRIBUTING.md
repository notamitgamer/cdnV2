# Contributing to cdnV2

Thanks for helping out! Bug reports, fixes, docs and well-scoped features are all welcome.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security
problem, please use [SECURITY.md](SECURITY.md) rather than a public issue.

## Before you start

- **Bugs and small fixes:** go ahead and open a pull request.
- **New features or larger changes:** open an issue first so we can agree on the approach before you
  spend time on it.
- **Looking for something to do?** Issues labelled `good first issue` are a good place to begin.

## Development setup

```bash
git clone https://github.com/<you>/cdnV2.git
cd cdnV2
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env     # fill in HF_BUCKET_ID and HF_TOKEN
set -a; . ./.env; set +a
uvicorn app.main:app --reload
```

Use a **throwaway Hugging Face bucket and token** for development, never production credentials.
Run the app from the repository root — templates are loaded from `app/templates` relative to it.

## Checks

CI runs these on every pull request; please run them locally first:

```bash
pip install ruff
ruff check --select E9,F63,F7,F82 app   # syntax errors and undefined names
python -m compileall -q app
docker build -t cdnv2 .                  # the image must still build
```

There is no full test suite yet. If you add logic that can be tested without network access (parsing,
validation, rate limiting), adding a test alongside it is very much appreciated.

## Pull requests

1. Branch from `main` with a descriptive name (`fix-zip-empty-folder`, `docs-self-hosting`).
2. Keep each PR focused on one change; avoid unrelated reformatting.
3. Match the surrounding code style. The code is plain, readable Python with short comments that
   explain *why*, not *what*.
4. Update the README, `.env.example` and the in-app documentation pages if behaviour or configuration
   changes.
5. Fill in the pull request template, including how you tested the change.

## Ground rules

- **Never commit secrets.** No tokens, keys or `.env` files. If you accidentally push one, revoke it
  immediately and tell a maintainer.
- **Keep configuration in environment variables**, with defaults that are safe for a new deployment.
- **Preserve backwards compatibility** for existing deployments unless the change is clearly marked as
  breaking.
- **Be careful with anything that touches uploads, rate limits, admin or the GitHub OIDC check** — these
  are the security boundary of the project. Explain your reasoning in the PR.

## License of contributions

This project is licensed under the [MIT License](LICENSE). By submitting a contribution you agree that
it is licensed under the same terms, and that you have the right to submit it.
