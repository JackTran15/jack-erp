---
feature: inventory-location-remove-stock-guard
stories: 1
acceptance_criteria: 3
---

# Requirements — Inventory Location Remove Stock Guard

## US-01 — Cannot remove a located item that still has stock

As a warehouse staff member, I want the "Bỏ khỏi vị trí" action to be blocked while an item
still has stock at that location, so that removing it from view can never silently create
an inventory movement I did not ask for.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Remove icon disabled with tooltip when stock > 0
```gherkin
Given a row in "Danh sách hàng hóa" (Vị trí hàng hóa) has quantity greater than 0
When the dialog renders that row
Then the "Bỏ khỏi vị trí" icon is disabled
And hovering it shows a tooltip explaining that stock must be moved out first
```

**AC-02** — Backend rejects removal when stock > 0
```gherkin
Given an item has a positive stock balance at a location
When DELETE /inventory/locations/:locationId/stock-items/:itemId is called for that item
Then the request is rejected with a 4xx error
And no stock transfer document is created
And the stock balance row is not deleted
```

**AC-03** — Zero-stock removal is unaffected
```gherkin
Given an item has a stock balance of exactly 0 at a location
When the item is removed from that location (UI or API)
Then the balance row is deleted and the preferred-shelf mapping is cleared
And no stock transfer document is created, as before
```
