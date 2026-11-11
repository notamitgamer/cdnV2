# raw.cdn worker

Serves `raw.cdn.amit.is-a.dev` from Cloudflare's edge instead of through the Render app. Files come
straight from the Hugging Face bucket and are kept at the edge for 10 seconds, so an overwritten file
shows up within about 10 seconds. The Render app is untouched and still serves everything else.

## Set up (dashboard)

1. Cloudflare dashboard -> Workers & Pages -> Create -> Worker. Name it `cdn-raw`, deploy the
   placeholder, then Edit code and paste `raw-worker.js` over it. Deploy.
2. Settings -> Variables: `HF_BUCKET_ID` = `notamitgamer/cdn`, `CDN_BASE_URL` = `https://cdn.amit.is-a.dev`.
3. Remove `raw.cdn.amit.is-a.dev` from the Render service (Settings -> Custom Domains).
4. In the amit.is-a.dev DNS, delete the existing `raw.cdn` record (it points at Render).
5. Worker -> Settings -> Domains & Routes -> Add -> Custom Domain -> `raw.cdn.amit.is-a.dev`.

The edge cache only works on a custom domain, not on `*.workers.dev`.

## Check it

```
curl -sI https://raw.cdn.amit.is-a.dev/PATH/TO/FILE | grep -i -E "x-edge-cache|cache-control|content-type"
```

Run it twice: the first shows `x-edge-cache: MISS`, the second `HIT`.

## Roll back

Delete the custom domain from the Worker, add `raw.cdn.amit.is-a.dev` back to Render and restore the
DNS record Render asks for. The Python code for raw files is unchanged and works as before.

## Behaviour

- `GET`/`HEAD`/`OPTIONS` only; `Range` requests go straight to Hugging Face (not cached).
- Same headers as the app: CORS `*`, `nosniff`, `Accept-Ranges`, content-type fixes for css/js/json/svg/fonts, `.md`/`.txt` as text.
- Unknown path with an extension: `404: File Not Found`. Unknown path without one: redirect to the file browser.
- Private bucket: set `HF_BUCKET_PRIVATE` = `1` and add `HF_TOKEN` as a secret.
