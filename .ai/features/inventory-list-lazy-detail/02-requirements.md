---
feature: inventory-list-lazy-detail
stories: 4
acceptance_criteria: 10
---

# Requirements — Inventory List Lazy Detail

## US-01 — List pages no longer carry line/item detail

As a backoffice user browsing Goods Receipt, Goods Issue, or Transfer Order lists,
I want the list/search response to carry only header/summary fields
so that list loads and page-turns don't pay for line detail I never see on that screen.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Goods Receipt list omits line detail
```gherkin
Given I open the Goods Receipt (Phiếu nhập) list
When the page loads or I turn to another page
Then the `/v2/goods-receipts/search` response for that page contains no `lines` array
And the backend query does not join `lines`, `lines.item`, or `lines.location`
```

**AC-02** — Goods Issue list omits line detail
```gherkin
Given I open the Goods Issue (Phiếu Xuất) list
When the page loads or I turn to another page
Then the `/v2/inventory/goods-issues/search` response for that page contains no `lines` array
And the backend query does not join `lines`, `lines.item`, or `lines.location`
```

**AC-03** — Transfer Order list omits line detail
```gherkin
Given I open the Transfer Order (Phiếu điều chuyển) list
When the page loads or I turn to another page
Then the `GET /inventory/transfer-orders` response for that page contains no `lines` array
And the list query path does not trigger TransferOrderEntity's eager lines/item load
```

## US-02 — Row click triggers a real detail fetch

As a backoffice user viewing a warehouse document list,
I want clicking a row to fetch that document's detail from the server
so that the detail view is accurate even though the list no longer carries it.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-04** — Goods Receipt row click fetches detail
```gherkin
Given I am on the Goods Receipt list with rows loaded
When I click a row (or its doc-number link)
Then a network request for that document's detail fires
And header fields (doc number, date, counterparty, status, total) render immediately without waiting on line data
```

**AC-05** — Goods Issue row click fetches detail
```gherkin
Given I am on the Goods Issue list with rows loaded
When I click a row (or its doc-number link)
Then a network request for that document's detail fires
And header fields render immediately without waiting on line data
```

**AC-06** — Transfer Order row click fetches detail
```gherkin
Given I am on the Transfer Order list with rows loaded
When I click a row (or its doc-number link)
Then a network request for that document's detail fires
And header fields render immediately without waiting on line data
```

## US-03 — Detail line items load via infinite scroll

As a backoffice user viewing a warehouse document's detail,
I want its line items to load progressively as I scroll
so that a document with a large number of lines doesn't force one giant payload.

**Priority:** must
**Depends on:** US-02

### Acceptance criteria

**AC-07** — Many lines load incrementally
```gherkin
Given I open the detail view of a document with 200+ lines
When the detail view first renders
Then only the first page of lines is fetched and shown
When I scroll near the bottom of the line list
Then the next page of lines is fetched and appended, without re-fetching earlier pages
```

**AC-08** — Few lines don't hang waiting for a nonexistent next page
```gherkin
Given I open the detail view of a document with 3 lines
When the detail view first renders
Then all 3 lines are shown after the first fetch
And no further page request is made, and the UI does not show a stuck "loading more" state
```

## US-04 — Existing detail consumers keep working (regression coverage)

As a backoffice user using the barcode-scan action or the inline detail panel on any of the
three list pages,
I want that functionality to keep working once list rows stop carrying `lines`
so that this refactor doesn't silently break features that read `row.lines` today.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-09** — Barcode-scan toolbar action rewired
```gherkin
Given I use the barcode-scan toolbar action on the Goods Receipt or Goods Issue list page
When it needs a document's line items to match a scanned code
Then it resolves those lines via a detail fetch (not `row.lines` from the list response)
And scanning still correctly matches/highlights the expected line
```

**AC-10** — DetailPanel components rewired
```gherkin
Given I open the inline DetailPanel on the Goods Receipt, Goods Issue, or Transfer Order list page
When the panel renders line-item content
Then it renders from a fresh detail fetch (not `row.lines` from the list response)
And the rendered lines match what the document actually contains
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Regression | Transfer Order callers other than the list query (e.g. `getById`, `findOrFail` at `transfer-order.service.ts:1718-1725`) continue to receive eager-loaded `lines`/`item` unchanged — this is a regression check, not a new feature | AC-06, AC-10 |
