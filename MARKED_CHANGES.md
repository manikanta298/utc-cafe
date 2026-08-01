# Marked Changes — UTC Cafe

## 1) Master Admin: Add Customer
- **File:** `frontend/src/pages/master/MasterCustomersPage.jsx`
- Added an **Add Customer** button near the customer list.
- Added a customer creation modal with name, phone, city, state, and address fields.
- Wired the form to `POST /customers`.

## 2) Reports: Total Amount + Excel Export Fix
- **File:** `frontend/src/pages/master/PaymentReportPage.jsx`
- Added a visible **Total Amount** column in the payment report table.

- **File:** `backend/controllers/reportController.js`
- Added **Total Amount** to report exports.
- Reworked the Excel export so it generates a real `.xls` compatible HTML table instead of a renamed CSV.
- Included a summary row and grand total to make the downloaded file open correctly.

## 3) Menu Management: Delete Wrong Image and Upload New One
- **File:** `backend/controllers/menuController.js`
- Updated menu item editing to support `removeImage=true`.
- When removing/replacing an image, the old Cloudinary asset is deleted.

- **File:** `frontend/src/pages/master/MasterMenuPage.jsx`
- Added a **Remove Image** button in the edit modal.
- The edit flow now supports clearing a wrong image before saving a new one.

## 4) Franchise/Table Management: Delete Table + QR Actions
- **File:** `frontend/src/pages/pos/TableMapPage.jsx`
- Verified the table map already supports:
  - **Add Table**
  - **Delete Table**
  - **Copy QR**
  - **Print QR**
  - QR regeneration/download
- This satisfies the franchise owner table management requirement.

- **File:** `backend/routes/tables.js`
- Verified backend supports table deletion and bill-request handling.

## 5) QR Ordering Flow: Mandatory Mobile + Separate Addition Entries
- **File:** `backend/controllers/sessionController.js`
- Changed QR/session ordering so every new submission creates a **separate order entry** while keeping the same table/token/session.
- Added `isAddition` and `additionRound` tracking.
- Additional items remain linked to the same token but are stored as distinct batches.

- **File:** `backend/routes/public.js`
- Updated the public QR order route to create a new order entry per submission.
- Preserved token/session linkage and flagged additions separately.
- Added live socket emissions for new order vs. additional items.

- **File:** `backend/models/Order.js`
- Added `isAddition` and `additionRound` fields.

## 6) Waiter Approval Flow
- **File:** `backend/controllers/waiterController.js`
- Waiter approval now emits the message **“Approved by waiter”**.
- Notification payload includes token number and approval metadata.

- **File:** `frontend/src/pages/waiter/WaiterDashboard.jsx`
- Updated waiter notifications to display the approval wording consistently.

## 7) POS Notifications: Bill Request + Approval Voice Alerts
- **File:** `frontend/src/pages/pos/POSScreen.jsx`
- Added socket handling for:
  - `waiter:bill_requested`
  - `waiter:order_approved`
- Added voice announcement support through browser speech synthesis.
- Added POS notifications for bill requests and waiter approvals.

## 8) Billing Button Labels
- **File:** `frontend/src/pages/waiter/WaiterDashboard.jsx`
- Waiter flow uses **Request Bill**.

- **File:** `frontend/src/pages/pos/POSScreen.jsx`
- POS flow uses **Generate Bill**.

## 9) Kitchen Screen
- **File:** `frontend/src/pages/kitchen/KitchenScreen.jsx`
- Verified kitchen screen remains aligned with occupied-table and order-status display requirements.
- Existing support for order history, pending/completed tracking, and additions remains intact.

## Verified Existing Support
- **Delete table** and **QR actions** were already present in `frontend/src/pages/pos/TableMapPage.jsx` and `backend/routes/tables.js`.
- The changes above focus on the missing parts and the ordering/billing workflow corrections.
