# POS Coupon Update

Implemented coupon application on the POS billing screen.

## Behavior
- Operator enters a coupon code in the Billing screen.
- Frontend calls `POST /api/coupons/validate`.
- Backend validates active status, expiry, usage limit, minimum order amount, and franchise applicability.
- Discount is calculated server-side and displayed in the bill summary.
- Generate Bill sends only the coupon code; the backend recalculates the authoritative discount from the session items.
- Invalid/expired/inapplicable coupons now fail bill generation instead of being silently ignored.
- The UI synchronizes the displayed discount with the server response after bill generation.
- Coupon usage is not incremented merely by generating a bill preview.

## Files changed
- `frontend/src/pages/pos/POSScreen.jsx`
- `backend/controllers/couponController.js`
- `backend/controllers/sessionController.js`
