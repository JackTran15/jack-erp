# nginx config

`erp-giaymt.conf` is a tracked copy of the live vhost on the production host,
at the same filename: `/etc/nginx/sites-available/erp-giaymt.conf`. It serves all three
apps from one hostname, by path:

| path | upstream | PM2 process |
| --- | --- | --- |
| `/` | `127.0.0.1:3000` | `erp-backoffice-web` |
| `/pos/` | `127.0.0.1:3001` | `erp-pos-web` |
| `/api/` | `127.0.0.1:4000` | `erp-api` |

Because everything is same-origin, the SPAs call the API with a relative
`VITE_API_BASE_URL=/api` and no CORS is involved.

## Install

```bash
sudo cp deploy/nginx/erp-giaymt.conf /etc/nginx/sites-available/
sudo ln -sfn /etc/nginx/sites-available/erp-giaymt.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**On a fresh host, do this before TLS exists.** The file references
`/etc/letsencrypt/live/erp.giaymt.com.vn/…`, so nginx will refuse to start if
those certs are absent. Bootstrap order: strip the `# managed by Certbot` lines
and the `listen 443` block, install the HTTP-only version, then run
`sudo certbot --nginx -d erp.giaymt.com.vn` — certbot re-adds them, plus the
HTTP→HTTPS redirect server block, exactly as they appear here.

## Things that look wrong but aren't

**Trailing slashes on `proxy_pass` are load-bearing and deliberately
inconsistent.** `/api/` has one (`http://erp_api/`) so the prefix is stripped —
the API has no global prefix, so `/api/auth/login` must reach Nest as
`/auth/login`. `/pos/` has none (`http://erp_pos`) so the prefix is *preserved*,
because pos-web is built with `base: "/pos/"` in its `vite.config.ts` and serves
its assets under that path. Swapping either breaks that app.

**Ordinary locations send `Connection ""`, not `$connection_upgrade`.** Applying
the websocket map to every location sends `Connection: close` upstream on normal
requests (they carry no `Upgrade` header), which cancels keep-alive and makes
nginx open and tear down a TCP connection per request. Websockets instead live
in `location /api/socket.io/` — a *longer* prefix, so nginx matches it first
regardless of ordering.

**HTTP/2 is enabled via `listen … ssl http2`.** That is correct for nginx 1.24
(the host's version). nginx **1.25.1+** deprecates it in favour of a separate
`http2 on;` directive — switch when the host is upgraded, or the config test
will start warning.

**New public hostnames need two edits, not one.** Add the name to `server_name`
here *and* to `preview.allowedHosts` in both SPAs' `vite.config.ts`, or
`vite preview` answers `403 Blocked request`. The Vite side is a server option,
so it needs a `pm2 restart`, not a rebuild.

## Not tracked

`jack-erp.conf` on the host serves the `jack-erp-*.ducanhzed.com` names. Those
resolve to a different host (`194.195.90.39`), so the vhosts are inert and left
out deliberately.

## Drift check

This copy is not applied automatically — nothing syncs it to the host. After
changing the live file, copy it back and commit:

```bash
diff /etc/nginx/sites-available/erp-giaymt.conf deploy/nginx/erp-giaymt.conf
```
