# Implemented: Payment Redirect + Compact Invoice + Coupon Validation

## Changes
- Fully paid POS orders now return to the Table Map (`dashboard`) after payment.
- Partial payments remain on the invoice/payment screen.
- Cash/Card, UPI, and Split payment success paths were updated.
- Thermal invoice spacing, font size, padding, and QR size were reduced to shorten printed paper.
- POS coupon validation now uses the full bill amount, not only newly added cart items.
- Coupon validation now sends and checks `franchiseId`.
- Backend coupon validation enforces `applicableFranchises`.
- Bill generation also checks coupon franchise applicability before applying it.

## Main files
- `frontend/src/pages/pos/POSScreen.jsx`
- `frontend/src/components/print/ThermalReceipt.jsx`
- `backend/controllers/couponController.js`
- `backend/controllers/sessionController.js`
