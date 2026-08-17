---
feature: inventory-list-lazy-detail
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | Infinite scroll applies to the inner line items inside the detail view, not the outer document list — the outer list keeps its existing page-number pagination unchanged | high | yes | Would flip which layer (list vs. detail) gets the infinite-scroll rework, changing US-03/AC-07/AC-08 and the whole detail-fetch contract | confirmed | Confirmed by Akenzy via AI-DLC discovery Q&A, 2026-08-17 |
| A-02 | Paginated line items are served by a new dedicated `GET /:id/lines?page=&pageSize=` endpoint (header and lines fetched separately), not by extending the existing `GET /:id` endpoint — matches the repo's existing sub-resource convention (`GET /:id/print-payload`, `GET /:id/export` already exist for GR/GI), and leaves `GET /:id`'s response shape unchanged for other existing consumers (print-payload builder, export) that need the full line set in one shot | high | no | Blast radius covers all 3 detail endpoints (goods-receipt, goods-issue, transfer-order controllers/services) and all 3 FE `DetailPanel` components — now settled, feeds directly into the G2 contract design | confirmed | Confirmed by Akenzy via AI-DLC discovery Q&A, 2026-08-17 |
| A-03 | The "Phiếu Thu" wording in the original task text was a mistranslation/shorthand for Goods Issue (Phiếu Xuất), not a literal cash-receipt voucher list — this feature proceeds on the Goods Issue reading | high | no | If wrong, scope should have included an actual cash-receipt voucher list instead of (or in addition to) Goods Issue, requiring re-scoping US-01–US-04's entity mapping and fresh discovery against that entity | confirmed | Confirmed by Akenzy via AI-DLC discovery Q&A, 2026-08-17 |

## Rejected assumptions

None yet — no assumption made during discovery has been found to be false.
