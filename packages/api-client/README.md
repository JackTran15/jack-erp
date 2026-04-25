# @erp/api-client

Typed HTTP client for the ERP Nest API, generated from the live OpenAPI document.

## Regenerate types and paths

1. Start the API (`make dev-api` or equivalent) so `GET /docs-json` is available.
2. From the monorepo root:

```bash
pnpm openapi:generate
# or: make openapi-generate
```

The script fetches `OPENAPI_URL` (default `http://127.0.0.1:4000/docs-json`), writes `openapi.snapshot.json`, and runs `openapi-typescript` to refresh `src/generated/schema.ts`.

If the API is not running, generation falls back to `openapi-stub.json` so the package still builds (with a reduced route surface).

## Usage (browser)

```typescript
import { createErpApiClient, formatClientError } from "@erp/api-client";

const client = createErpApiClient("http://localhost:4000");
const { data, error } = await client.GET("/health");
if (error) throw new Error(formatClientError(error));
```

`createErpApiClient` registers middleware that adds `Authorization`, `X-Branch-Id`, `X-Request-Id`, and `X-Idempotency-Key` when `localStorage` is available (same defaults as the legacy `http` helper in backoffice).

## Notes

- **Types are compile-time**: the generator pulls the OpenAPI JSON at build/regeneration time, not at runtime in the browser.
- Commit `openapi.snapshot.json` when you want CI and teammates to pick up API contract changes without running the API during `pnpm openapi:generate`.
