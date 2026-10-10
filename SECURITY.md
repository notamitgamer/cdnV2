# Security Policy

## Supported versions

Only the latest commit on `main` is supported. Fixes are not backported.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub:
<https://github.com/notamitgamer/cdnV2/security/advisories/new>

Please include:

- a description of the issue and its impact,
- steps to reproduce (a minimal request or proof of concept is ideal),
- the commit or deployment you tested against.

You can expect an acknowledgement within a few days. Please give us reasonable time to ship a fix
before disclosing publicly; we are happy to credit you in the advisory if you would like.

## Scope

In scope: this repository's code and its default configuration — in particular the upload guard and
rate limiting, the admin dashboard and its token handling, the GitHub OIDC verification
(`/api/gh-sync`), the URL-fetching upload (SSRF), the zip packer (path traversal, zip bombs), and the
file-serving routes.

Out of scope: vulnerabilities in third-party services (Hugging Face, GitHub, Cloudflare, Render) or in
dependencies with no impact on this project, denial of service by sheer traffic volume, and issues that
require a misconfigured deployment (for example running without `TRUST_CF_CONNECTING_IP` behind a
proxy and then spoofing IPs).

## Hardening tips for operators

- Set a strong, random `ADMIN_TOKEN`, and a separate `ADMIN_DATA_KEY`.
- Use a Hugging Face token scoped to the one bucket, with the minimum permissions needed.
- Configure `TRUST_CF_CONNECTING_IP` / `TRUSTED_PROXY_HOPS` correctly, otherwise rate limits and bans
  can be bypassed or can hit the wrong people.
- Keep dependencies up to date (Dependabot is configured in this repository).
