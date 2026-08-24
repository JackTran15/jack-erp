---
feature: temp-warehouse-close-ui-fixes
stories: 2
acceptance_criteria: 4
---

# Requirements — temp-warehouse-close-ui-fixes

## US-01 — Scroll to the last transfer line

As a cashier working the Kho tạm (fast stock transfer) screen, I want to scroll
the transfer-line table all the way down so that I can see and act on the last
row when the list overflows the screen.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Last row reachable when the list overflows
```gherkin
Given I am on FastStockTransferPage with enough transfer lines that the table
  overflows the visible area
When I scroll the transfer-line table down as far as it goes
Then the last row is fully visible, not clipped or hidden behind any other
  element
```

**AC-02** — Short lists are unaffected
```gherkin
Given I am on FastStockTransferPage with a short list of transfer lines that
  fits without scrolling
When the page renders
Then all rows are visible without a scrollbar, and the toolbar/header layout is
  unchanged from before this fix
```

## US-02 — "Đóng kho tạm" defaults to "Không xử lý"

As a cashier closing a temp warehouse session, I want the discrepancy dialog to
default to "Không xử lý" so that I have to actively opt into an offset/transfer
action instead of actively opting out of one.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-03** — Default selection on first open
```gherkin
Given I click "Đóng kho tạm" for the first time on a freshly loaded
  FastStockTransferPage, and the discrepancy dialog opens
When the dialog renders
Then "Không xử lý" is the pre-selected option in the "Xử lý chênh lệch" radio
  group, regardless of whether "Xuất đi/Trả lại kho tạm" (NET_OFFSET) is
  eligible
```

**AC-04** — Existing NET_OFFSET-eligibility reset is unaffected
```gherkin
Given the discrepancy dialog is open with "Xuất đi/Trả lại kho tạm" selected
When netOffsetEligible becomes false while the dialog is still open
Then the selection resets to "Tạo phiếu chuyển kho" (CREATE_TRANSFERS), exactly
  as it does today
```
