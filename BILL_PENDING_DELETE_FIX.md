# POS Remove Item 400 Fix

## Root cause
The backend `removeSessionItem` controller rejected **all** sessions with status `bill_pending`:

```js
if (['paid', 'closed', 'cancelled', 'bill_pending'].includes(session.status)) {
  return res.status(400)...
}
```

The POS flow sets a session to `bill_pending` when **Generate Bill** is pressed, but this project creates the final `Invoice` only after payment is recorded. Therefore an unpaid `bill_pending` session is still legitimately editable.

## Fix
The updated controller now:

- Allows `bill_pending` edits only when the session is still unpaid.
- Rejects paid/closed/cancelled sessions.
- Rejects any session with recorded payment or an existing finalized invoice.
- Invalidates the old unpaid bill snapshot after an item is removed.
- Reopens the session as `open` so the operator can continue editing and regenerate the bill.
- Restores a dine-in table from `bill_pending` to `occupied`.
- Recalculates session totals from the remaining items.
- Synchronizes the linked `Order` document.
- Emits `session:itemRemoved` and a table-status event when necessary.
- Keeps the franchise PIN verification and franchise isolation checks.

The POS frontend also clears stale bill/payment UI state when the backend reports `billInvalidated: true`.

## Changed files

- `backend/controllers/sessionController.js`
- `frontend/src/pages/pos/POSScreen.jsx`

## Expected result

Generate Bill -> Delete Item -> Franchise PIN -> Item removed -> unpaid bill invalidated -> session returns to Open -> totals refresh -> Generate Bill again.

Paid orders still cannot be deleted; use the refund/correction workflow.
