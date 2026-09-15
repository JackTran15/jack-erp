---
feature: inventory-location-remove-stock-guard
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | No new UI affordance is needed to help staff move stock out before removing it — they use the existing "Xếp vị trí hàng hóa" / "Chuyển vị trí hàng hóa" actions already on the same page | high | no | A follow-up UX request to link directly from the disabled tooltip to one of those actions | pending | — |
| A-02 | 403 Forbidden (via the existing `ForbiddenException`, matching the negative-stock guard already in this method) is an acceptable status for the positive-stock rejection, rather than 400/409 | high | no | Frontend already renders any non-2xx via a generic toast (`getUserFacingApiErrorMessage`), so the exact status code has no visible effect | pending | — |
