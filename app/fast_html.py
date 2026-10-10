"""Make rendered HTML pages cheap to reuse.

Every UI page is rendered from a template and is identical for everybody (it only carries global
stats and URLs), so two things are safe and make navigation much faster:

* ``Cache-Control: private, max-age=30``: the browser keeps the page for 30 seconds. The link
  prefetcher (static/prefetch.js) fetches pages in the background, and a click on one of them is then
  answered from the browser's own cache with no network at all. ``private`` keeps shared caches out of it.
* gzip: the pages are 20-90 KB of HTML with inlined CSS/JS and compress about 5x, which matters most on
  slow or high-latency connections.

Only successful GET responses built through ``TemplateResponse`` are touched. File downloads, the API,
redirects, errors and the admin dashboard never go through here.
"""

import gzip

from fastapi.templating import Jinja2Templates
from starlette.requests import Request

HTML_MAX_AGE = 30   # seconds; keep in step with `ttlMs` in static/prefetch.js
MIN_GZIP_BYTES = 1024
GZIP_LEVEL = 5


def optimise_html(request: Request | None, response):
    """Add caching and compression headers to a rendered page (in place) and return it."""
    if request is None or request.method != "GET" or response.status_code != 200:
        return response

    if "cache-control" not in response.headers:
        response.headers["Cache-Control"] = f"private, max-age={HTML_MAX_AGE}"

    # The body now depends on Accept-Encoding, so caches must key on it.
    response.headers.append("Vary", "Accept-Encoding")

    body = response.body
    accepts_gzip = "gzip" in request.headers.get("accept-encoding", "").lower()
    if accepts_gzip and "content-encoding" not in response.headers and len(body) >= MIN_GZIP_BYTES:
        compressed = gzip.compress(body, GZIP_LEVEL)
        response.body = compressed
        response.headers["Content-Encoding"] = "gzip"
        response.headers["Content-Length"] = str(len(compressed))
    return response


class FastTemplates(Jinja2Templates):
    """Jinja2Templates whose responses are cached and compressed (see module docstring)."""

    def TemplateResponse(self, *args, **kwargs):  # noqa: N802 (matches the parent's name)
        response = super().TemplateResponse(*args, **kwargs)
        request = args[0] if args and isinstance(args[0], Request) else kwargs.get("request")
        return optimise_html(request, response)
