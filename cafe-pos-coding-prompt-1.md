# 🚀 CAFE FRANCHISE POS — COMPLETE SYSTEM UPGRADE CODING PROMPT

> **How to use this prompt:**
> Paste this entire document into Claude Code / Cursor / Windsurf / ChatGPT Code Interpreter.
> Work module by module. Each section is a self-contained implementation task.
> Always read existing code before modifying. Never delete working logic — extend it.

---

## 📁 PROJECT CONTEXT

This is an existing **Cafe Franchise POS & Smart Management Software** built with:
- **Frontend**: React.js + Tailwind CSS
- **Backend**: Node.js + Express.js + JWT + Socket.IO
- **Database**: MongoDB (Mongoose ODM)

**Goal**: Upgrade the system into a production-ready, franchise-ready, smart cafe ecosystem — similar to McDonald's workflow with QR ordering, token management, kitchen tracking, multi-franchise payment, and customer analytics.

**Rule**: Do not rewrite the entire codebase. Identify existing files, extend them, and add missing modules.

---

## ✅ MODULE 1 — FRANCHISE MANAGEMENT SYSTEM

### Task
Upgrade the existing franchise module to support activation control, archiving, and access enforcement.

### Schema Changes (`models/Franchise.js`)
Add the following fields if not already present:
```js
status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
archivedAt: { type: Date, default: null },
deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
```

### API Endpoints (`routes/franchise.js`)
Implement or fix the following routes:
- `PATCH /franchise/:id/activate` — Set status to `active`
- `PATCH /franchise/:id/deactivate` — Set status to `inactive`
- `PATCH /franchise/:id/archive` — Set status to `archived`, record `archivedAt`
- `DELETE /franchise/:id` — Soft delete only (set `status: archived`)

### Middleware (`middleware/franchiseGuard.js`)
Create a middleware that:
1. On every protected request, check the franchise status from DB (or JWT claim)
2. If `status !== 'active'`, return `403: Franchise is deactivated. Access denied.`
3. Block access to: POS routes, billing routes, order routes, inventory routes

Apply this middleware to all franchise-scoped routes.

### Frontend (`src/pages/admin/FranchiseManagement.jsx`)
Add UI controls:
- Toggle switch: Activate / Deactivate franchise
- Archive button with confirmation dialog
- Status badge: `Active` (green) / `Inactive` (red) / `Archived` (grey)
- Deactivated franchises show a lock icon — all their module buttons disabled

---

## ✅ MODULE 2 — ROLE-BASED ACCESS CONTROL (RBAC)

### Task
Implement a complete RBAC system. Roles must control what routes, pages, and UI elements are accessible.

### Roles
```
master_admin | franchise_owner | manager | pos_staff | pos_shift_operator | kitchen_staff
```

### Backend (`middleware/rbac.js`)
Create `checkRole(...allowedRoles)` middleware:
```js
const checkRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};
```

Apply `checkRole` to every route. Example:
- `POST /billing` → `checkRole('pos_staff', 'pos_shift_operator', 'manager')`
- `GET /reports` → `checkRole('master_admin', 'franchise_owner', 'manager')`
- `POST /coupons` → `checkRole('master_admin')`
- `PATCH /payment/edit` → `checkRole('master_admin')`

### Frontend (`src/utils/roles.js`)
Create role-permission map:
```js
export const PERMISSIONS = {
  master_admin: ['*'],
  franchise_owner: ['reports', 'inventory', 'customer_analytics', 'payment_reports'],
  manager: ['pos', 'reports', 'inventory', 'billing'],
  pos_staff: ['pos', 'billing', 'order_placement'],
  pos_shift_operator: ['pos', 'billing'],
  kitchen_staff: ['kitchen_dashboard']
};
```

Create `<ProtectedRoute allowedRoles={[...]} />` component that wraps React Router routes and redirects unauthorized users to `/unauthorized`.

Create `usePermission(module)` hook used in components to show/hide UI elements.

---

## ✅ MODULE 3 — POS BILLING SYSTEM FIXES

### Task
Fix the broken POS UI. Do not rewrite — debug and fix existing issues.

### Known Bugs to Fix

**Bug 1: Sidebar/Hamburger Not Opening**
- Locate sidebar toggle state in the POS component
- Ensure `isOpen` state is properly toggled on hamburger click
- Verify Tailwind classes `translate-x-0` / `-translate-x-full` are applied based on state
- Add `z-50` to sidebar so it renders above content

**Bug 2: Infinite Loading Spinner**
- Find where `isLoading` state is set
- Ensure it is set to `false` in both `.then()` and `.catch()` of menu fetch API call
- Add error state rendering: show "Failed to load menu. Retry." with a retry button

**Bug 3: Menu Items Not Rendering**
- Check if menu API response matches expected data shape
- Add `console.log` temporarily to trace API response
- Ensure the map function handles empty arrays gracefully
- Verify franchise ID is being sent correctly in the menu fetch request

**Bug 4: Role-Based Menu Visibility**
- Read `user.role` from auth context
- Hide "Discount", "Coupon", "Edit Payment" buttons from `pos_staff` and `pos_shift_operator`
- Only show these to `master_admin` and `manager`

### After Fixes
- Remove all debug `console.log` statements
- Test all 3 affected roles: `franchise_owner`, `manager`, `pos_shift_operator`

---

## ✅ MODULE 4 — CUSTOMER MANAGEMENT SYSTEM

### Schema (`models/Customer.js`)
Create or update with these fields:
```js
{
  name: String,
  mobile: { type: String, unique: true, required: true },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  age: Number,
  address: String,
  village: String,
  city: String,
  state: String,
  pincode: String,
  createdAt: { type: Date, default: Date.now },
  totalSpent: { type: Number, default: 0 },
  visitCount: { type: Number, default: 0 },
  favoriteItems: [String],
  lastVisit: Date
}
```

### API Endpoints (`routes/customers.js`)
- `GET /customers/lookup?mobile=XXXXXXXXXX` — Fetch customer by mobile. If not found, return `{ exists: false }`.
- `POST /customers` — Create new customer profile
- `PUT /customers/:id` — Update customer info
- `GET /customers/:id/history` — Return last 30 days of orders

### Frontend POS Integration
In the billing/POS component:
1. Add a mobile number input field at the top of the billing form
2. On input of 10 digits, call `/customers/lookup?mobile=...`
3. If found: auto-fill customer name, show "Welcome back, [Name]!" toast, show visit count and total spent
4. If not found: show inline form to collect Name, Gender, Age, City — save on bill confirmation
5. Associate every new order with the customer ID

---

## ✅ MODULE 5 — CUSTOMER HISTORY & BILL REPRINT

### API Endpoints
- `GET /orders/history?mobile=XXXXXXXXXX` — Orders by mobile
- `GET /orders/history?orderId=ORD-XXXX` — Single order lookup
- `GET /orders/history?date=YYYY-MM-DD` — Orders by date
- `GET /orders/history?customerId=XXX&days=30` — Last 30 days

### Frontend (`src/pages/CustomerHistory.jsx`)
Build a search page:
- Search bar with toggle: Mobile / Order ID / Date
- Results show: order date, items ordered, amount, payment status
- "Reprint Bill" button → opens Bill component in print mode
- "Download PDF" button → uses `jsPDF` or `react-to-print` to export
- Summary card: Total visits, Total spent, Avg order value

---

## ✅ MODULE 6 — RUNNING ORDER & SMART INVOICE MERGE

### Schema (`models/OrderSession.js`)
```js
{
  sessionId: { type: String, unique: true }, // auto-generated
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' },
  tableNumber: String,
  tokenNumber: String,
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }], // multiple sub-orders
  mergedItems: [{ name: String, qty: Number, price: Number }], // computed on close
  totalAmount: Number,
  paidAmount: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['pending', 'partial', 'paid'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  closedAt: Date
}
```

### Logic
- When a customer places first order: create `OrderSession` with `status: open`
- Each additional order by same customer/table: push to `session.orders[]`
- Kitchen receives each sub-order immediately via Socket.IO
- On "Close Session & Generate Bill": merge all sub-order items, calculate total, generate final invoice
- Final invoice PDF shows all items grouped, one bill per session

### API Endpoints
- `POST /sessions/start` — Start new session
- `POST /sessions/:sessionId/add-order` — Add order to existing session
- `GET /sessions/:sessionId` — Get session with all orders merged
- `POST /sessions/:sessionId/close` — Close session, compute final bill

---

## ✅ MODULE 7 — PARTIAL & ADVANCE PAYMENT SYSTEM

### Schema Changes (`models/OrderSession.js`)
Add to existing session schema:
```js
paymentStatus: { type: String, enum: ['pending', 'partially_paid', 'advance_paid', 'fully_paid'], default: 'pending' },
advanceAmount: { type: Number, default: 0 },
payments: [{
  amount: Number,
  method: { type: String, enum: ['cash', 'upi', 'card', 'net_banking'] },
  paidAt: { type: Date, default: Date.now },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}]
```

### API Endpoints
- `POST /sessions/:id/payment` — Record a payment installment
- `GET /sessions/:id/payment-status` — Get balance due, payment history
- System auto-updates `paymentStatus` based on `paidAmount` vs `totalAmount`

### Frontend
In billing view:
- Show: Total Amount, Amount Paid, Balance Due
- "Accept Payment" button opens modal: amount field, payment method selector
- Payment history list (accordion)
- Color-coded status badge

---

## ✅ MODULE 8 — FRANCHISE-BASED PAYMENT SETUP

### Schema (`models/FranchisePayment.js`)
```js
{
  franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', unique: true },
  bankAccountName: String,
  bankAccountNumber: String,
  ifscCode: String,
  upiId: String,
  upiQrImageUrl: String, // uploaded or generated
  paymentGateway: { provider: String, apiKey: String, merchantId: String },
  acceptedMethods: [{ type: String, enum: ['cash', 'upi', 'card', 'net_banking'] }]
}
```

### API Endpoints
- `POST /franchise/:id/payment-config` — Save payment config (master_admin only)
- `GET /franchise/:id/payment-config` — Get config (franchise_owner, master_admin)

### Frontend (`src/pages/admin/FranchisePaymentSetup.jsx`)
- Form: Bank details, UPI ID, upload QR image, toggle accepted payment methods
- Preview: show QR image after upload
- Accessible only to `master_admin`

---

## ✅ MODULE 9 — DYNAMIC QR PAYMENT GENERATION

### Logic
After billing is confirmed:
1. Fetch the franchise's `upiId` from `FranchisePayment`
2. Generate UPI deep link: `upi://pay?pa={upiId}&pn={franchiseName}&am={amount}&cu=INR`
3. Convert to QR using `qrcode` npm package
4. Display QR in the payment modal

### Implementation
```js
// Backend route: GET /billing/:sessionId/payment-qr
const QRCode = require('qrcode');
const upiLink = `upi://pay?pa=${franchise.upiId}&pn=${franchise.name}&am=${session.totalAmount}&cu=INR`;
const qrDataUrl = await QRCode.toDataURL(upiLink);
res.json({ qr: qrDataUrl });
```

### Frontend
In payment modal:
- Show QR image (base64 from API)
- Show UPI ID and amount text below QR
- "Payment Confirmed" button to manually mark as paid (with staff verification)
- Auto-refresh payment status every 10 seconds (poll or Socket.IO)

---

## ✅ MODULE 10 — UNIFIED PAYMENT DOWNLOAD REPORTS

### API Endpoint (`routes/reports.js`)
```
GET /reports/payments?franchiseId=&startDate=&endDate=&format=pdf|excel|csv
```

Query and aggregate from `OrderSession.payments[]`:
- Group by: cash, upi, card, net_banking
- Include: discounted bills, pending payments
- Support: all franchises (master_admin) or single franchise (franchise_owner)

### Export Libraries
- **Excel/CSV**: `exceljs` npm package
- **PDF**: `pdfkit` npm package

### Frontend (`src/pages/reports/PaymentReport.jsx`)
- Date range picker
- Franchise selector (master_admin sees all)
- Summary cards: Cash Total, UPI Total, Card Total, Pending Total
- Download buttons: PDF, Excel, CSV

---

## ✅ MODULE 11 — MASTER ADMIN HIDDEN COUPON & DISCOUNT SYSTEM

### Schema (`models/Coupon.js`)
```js
{
  code: { type: String, unique: true },
  discountType: { type: String, enum: ['percentage', 'flat'] },
  discountValue: Number,
  isHidden: { type: Boolean, default: true }, // hidden from franchise owners
  maxUses: Number,
  usedCount: { type: Number, default: 0 },
  expiresAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  applicableFranchises: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' }]
}
```

### API Endpoints
- `POST /coupons` — Create coupon (master_admin only)
- `GET /coupons` — List coupons (master_admin sees all; others see non-hidden only)
- `POST /coupons/apply` — Apply coupon to session; returns discounted total

### Frontend
In POS billing form:
- Coupon code input + "Apply" button
- On success: show discount breakdown, updated total
- Franchise owners cannot see coupon management in their sidebar
- Master admin has full `/admin/coupons` CRUD page

---

## ✅ MODULE 12 — ADVANCED PAYMENT EDITING WITH AUDIT LOGS

### Schema (`models/PaymentEditLog.js`)
```js
{
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderSession' },
  franchiseName: String,
  oldAmount: Number,
  newAmount: Number,
  oldMethod: String,
  newMethod: String,
  reason: String,
  editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  editedAt: { type: Date, default: Date.now }
}
```

### API Endpoints
- `PATCH /sessions/:id/payment/edit` — Edit payment (master_admin only); create audit log entry
- `DELETE /sessions/:id/payment/:paymentId` — Delete incorrect payment; log deletion
- `GET /audit/payment-edits` — List all edit logs (master_admin only)

### Frontend
In master admin payment view:
- "Edit" button next to each payment record
- Edit modal: change amount, method, add reason
- Audit trail table: old value → new value, edited by, timestamp

---

## ✅ MODULE 13 — INVENTORY & STOCK MANAGEMENT

### Schema (`models/MenuItem.js`) — Add fields
```js
isAvailable: { type: Boolean, default: true },
franchiseOverrides: [{
  franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' },
  isAvailable: Boolean
}]
```

### Logic
When POS fetches menu for a franchise:
1. Get all menu items
2. For each item, check `franchiseOverrides` for matching `franchiseId`
3. If override exists, use override's `isAvailable`
4. Else use global `isAvailable`

### API Endpoints
- `PATCH /menu/:itemId/availability` — Toggle global availability (master_admin)
- `PATCH /menu/:itemId/franchise/:franchiseId/availability` — Toggle per-franchise (franchise_owner, manager)

### Frontend
In inventory/menu management:
- Toggle switch per item
- Label: "Unavailable in this franchise" (shows greyed out)
- "Mark as Out of Stock" quick action in POS (if manager or above)

---

## ✅ MODULE 14 & 15 — QR TABLE RESERVATION + TOKEN SYSTEM

### Schema (`models/Table.js`)
```js
{
  franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' },
  tableNumber: String,
  qrCode: String, // base64 or URL
  status: { type: String, enum: ['available', 'occupied', 'reserved'], default: 'available' },
  currentSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderSession' }
}
```

### Token Generation Logic
```js
// utils/tokenGenerator.js
let counters = {}; // In production, use Redis or DB counter
const generateToken = (franchiseId) => {
  if (!counters[franchiseId]) counters[franchiseId] = 100;
  const token = `TOKEN-${counters[franchiseId]++}`;
  return token;
};
```

### QR Workflow
1. Generate table QR on setup: encodes URL `https://yourapp.com/order?franchise=X&table=Y`
2. Customer scans → opens web page → selects items → submits order
3. System creates `OrderSession`, assigns token, marks table as `occupied`
4. Token number appears in: POS dashboard, kitchen dashboard, customer display

---

## ✅ MODULE 16 — LIVE KITCHEN DASHBOARD

### Frontend (`src/pages/kitchen/KitchenDashboard.jsx`)

Layout: Card grid showing active orders.

Each card shows:
- Token number (large, bold)
- Table number
- Items list with quantities
- Order time + elapsed time
- Status buttons: `Preparing` → `Ready` → `Delivered`

### Socket.IO Events
- Server emits `new_order` when order is placed → kitchen receives in real-time
- Kitchen clicks `Ready` → emits `order_ready` event → triggers token board + voice announcement
- Server event: `order_status_updated` → POS and admin dashboard update live

### Backend (`socket/kitchenSocket.js`)
```js
io.on('connection', (socket) => {
  socket.on('join_kitchen', ({ franchiseId }) => socket.join(`kitchen_${franchiseId}`));
  socket.on('update_order_status', ({ orderId, status }) => {
    // Update DB, then broadcast
    io.to(`kitchen_${franchiseId}`).emit('order_status_updated', { orderId, status });
    if (status === 'ready') io.to(`display_${franchiseId}`).emit('token_ready', { token });
  });
});
```

---

## ✅ MODULE 17 & 18 — TOKEN READY BOARD + VOICE ANNOUNCEMENT

### Frontend (`src/pages/display/TokenBoard.jsx`)
Full-screen display page (for TV/monitor):
- Large font list of "READY NOW" tokens
- Green pulsing highlight for newly ready tokens
- Auto-removes token after 2 minutes or on "Delivered" status

### Voice Announcement (`src/utils/voiceAnnouncement.js`)
```js
export const announceToken = (tokenNumber) => {
  const utterance = new SpeechSynthesisUtterance(`Token ${tokenNumber} is ready. Please collect your order.`);
  utterance.lang = 'en-IN';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
};
```

Call `announceToken(token)` whenever Socket.IO receives `token_ready` event on the display board page.

---

## ✅ MODULE 19 — REAL-TIME SYNCHRONIZATION

### Setup (`socket/index.js`)
Initialize Socket.IO on Express server. Implement these namespaces/rooms:
- `kitchen_{franchiseId}` — kitchen staff
- `pos_{franchiseId}` — POS terminals
- `display_{franchiseId}` — customer display/token board
- `admin` — master admin dashboard

### Events to Implement
| Event | Direction | Purpose |
|-------|-----------|---------|
| `new_order` | Server → Kitchen | New order placed |
| `order_status_updated` | Kitchen → All | Status change |
| `token_ready` | Server → Display | Token ready |
| `inventory_updated` | Server → POS | Item availability change |
| `payment_received` | Server → POS+Admin | Payment confirmed |
| `session_closed` | Server → Kitchen+POS | Table cleared |

### Frontend
In every relevant component, add:
```js
useEffect(() => {
  socket.on('event_name', (data) => { /* update state */ });
  return () => socket.off('event_name');
}, []);
```

---

## ✅ MODULE 20 — 30-DAY ORDER HISTORY & ARCHIVE

### Archive Logic (Cron Job — `jobs/archiveOrders.js`)
Use `node-cron` to run daily at 2 AM:
```js
cron.schedule('0 2 * * *', async () => {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const oldOrders = await OrderSession.find({ closedAt: { $lt: cutoff }, status: 'closed' });
  await ArchivedOrder.insertMany(oldOrders);
  await OrderSession.deleteMany({ _id: { $in: oldOrders.map(o => o._id) } });
});
```

Create a separate `ArchivedOrder` collection with identical schema.

Add API: `GET /orders/archived?franchiseId=&startDate=&endDate=` for browsing archived data.

---

## ✅ MODULE 21 — REPORTS & ANALYTICS DASHBOARD

### API Endpoints (`routes/reports.js`)
- `GET /reports/sales?period=daily|weekly|monthly&franchiseId=`
- `GET /reports/inventory?franchiseId=`
- `GET /reports/customers?franchiseId=`
- `GET /reports/franchise-summary` (master_admin only)

### Frontend (`src/pages/reports/Dashboard.jsx`)
Charts using `recharts`:
- Line chart: Daily sales trend (last 30 days)
- Bar chart: Top selling items
- Pie chart: Payment method breakdown
- Table: Franchise performance comparison (master_admin)

---

## ✅ MODULE 22 — SECURITY IMPROVEMENTS

Implement in this order:

1. **JWT + Refresh Tokens** (`utils/tokenService.js`)
   - Access token: 15 min expiry
   - Refresh token: 7 days, stored in httpOnly cookie
   - Route: `POST /auth/refresh` — issue new access token

2. **Password Hashing** — Ensure bcrypt with salt rounds 12 on all User saves

3. **Rate Limiting** (`middleware/rateLimiter.js`)
   ```js
   const rateLimit = require('express-rate-limit');
   app.use('/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
   ```

4. **Input Validation** — Use `express-validator` on all POST/PATCH routes

5. **Helmet.js** — Add `app.use(require('helmet')())` to Express app

6. **QR Validation** — Sign table QR codes with HMAC; verify signature on scan

---

## ✅ MODULE 23 — AUDIT & ACTIVITY LOGS

### Schema (`models/AuditLog.js`)
```js
{
  action: String, // 'FRANCHISE_DEACTIVATED', 'PAYMENT_EDITED', 'COUPON_APPLIED', etc.
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  targetId: mongoose.Schema.Types.ObjectId,
  targetModel: String,
  details: mongoose.Schema.Types.Mixed, // before/after snapshot
  franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' },
  timestamp: { type: Date, default: Date.now },
  ipAddress: String
}
```

### Helper (`utils/audit.js`)
```js
export const logAudit = async (action, req, targetId, targetModel, details) => {
  await AuditLog.create({
    action, performedBy: req.user._id, targetId, targetModel,
    details, franchiseId: req.user.franchiseId,
    ipAddress: req.ip, timestamp: new Date()
  });
};
```

Call `logAudit()` in every sensitive route handler.

### Frontend (`src/pages/admin/AuditLog.jsx`)
- Filterable table: by action type, user, franchise, date range
- Color-coded action types
- Export to CSV

---

## ✅ MODULE 24 — PERFORMANCE OPTIMIZATION

### Backend
1. Add MongoDB indexes:
   ```js
   CustomerSchema.index({ mobile: 1 });
   OrderSessionSchema.index({ franchiseId: 1, createdAt: -1 });
   AuditLogSchema.index({ timestamp: -1 });
   ```
2. Add `.lean()` to all read-only Mongoose queries
3. Use `Promise.all()` for parallel async operations
4. Add Redis caching for menu items (cache TTL: 5 minutes) — use `ioredis`

### Frontend
1. Add `React.lazy()` + `Suspense` for all page-level components
2. Memoize expensive components with `React.memo()` and `useMemo()`
3. Add loading skeletons (not spinners) for all data-fetch screens
4. Debounce all search inputs (300ms) using `lodash.debounce`
5. Virtualize long lists (order history, customer list) using `react-window`

---

## 🔧 IMPLEMENTATION SEQUENCE

Work in this order to avoid breaking dependencies:

```
1. Security (Module 22) — Foundation first
2. RBAC (Module 2) — Gates everything else
3. Franchise Management (Module 1) — Core entity
4. POS Bug Fixes (Module 3) — Unblock daily workflow
5. Customer System (Module 4) — Required for orders
6. Order Session / Merge (Module 6) — Core order logic
7. Payment System (Modules 7, 8, 9) — Revenue critical
8. Token + Kitchen (Modules 14, 15, 16) — Operations
9. Token Board + Voice (Modules 17, 18) — Customer UX
10. Socket.IO Sync (Module 19) — Connects all real-time
11. Inventory (Module 13) — Catalog control
12. Coupons + Discounts (Module 11) — Revenue tools
13. Payment Editing + Audit (Modules 12, 23) — Compliance
14. Reports (Modules 10, 21) — Analytics layer
15. History + Reprint (Module 5) — Customer service
16. Archive System (Module 20) — Data hygiene
17. Performance (Module 24) — Polish and scale
```

---

## ✅ MODULE 25 — TOKEN-BASED TABLE & ORDER MANAGEMENT SYSTEM

### Concept (Read Before Coding)

This module defines the **core operating logic** of the entire ordering experience. Every other module (kitchen, billing, additions, payment) must respect this flow. Read this fully before touching any order-related code.

**The Golden Rule:**
> One customer visit = One token. Every order, addition, and payment attaches to that token until it is explicitly closed.

---

### Token Lifecycle

```
Customer arrives
      ↓
Mobile number entered (QR scan or counter)
      ↓
System checks: active token exists for this mobile today?
      ├─ YES → Pull up existing token (same session continues)
      └─ NO  → Create new token, assign table, open session
      ↓
Orders placed → attach to token (Kitchen / Counter receives under same token)
      ↓
Additions placed → attach to same token ("Addition to Token #X")
      ↓
Payment collected → token marked as PAID → session CLOSED
      ↓
Table status → AVAILABLE again
```

---

### Schema (`models/OrderSession.js`) — Extend Existing

Add or confirm these fields are present:

```js
{
  tokenNumber: { type: String, unique: true },       // e.g. "TOKEN-101"
  franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
  tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table' },       // null for counter walk-ins
  tableNumber: String,                               // denormalized for display speed
  customerMobile: { type: String, required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  status: { type: String, enum: ['open', 'bill_pending', 'paid', 'closed'], default: 'open' },
  orderType: { type: String, enum: ['dine_in', 'counter'], default: 'dine_in' },

  // All sub-orders under this session
  orders: [{
    orderedAt: { type: Date, default: Date.now },
    isAddition: { type: Boolean, default: false },   // true = "addition to token"
    destination: { type: String, enum: ['kitchen', 'counter'] }, // where it routes
    items: [{
      menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
      name: String,
      qty: Number,
      unitPrice: Number,
      totalPrice: Number,
      notes: String                                  // special instructions
    }],
    placedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],

  // Computed on bill close
  mergedItems: [{
    name: String, qty: Number, unitPrice: Number, totalPrice: Number
  }],
  subtotal: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  couponCode: String,
  taxAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },

  // Payment
  paidAmount: { type: Number, default: 0 },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partially_paid', 'advance_paid', 'fully_paid'],
    default: 'unpaid'
  },
  payments: [{
    amount: Number,
    method: { type: String, enum: ['cash', 'upi', 'card', 'net_banking'] },
    paidAt: { type: Date, default: Date.now },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],

  openedAt: { type: Date, default: Date.now },
  closedAt: Date
}, { timestamps: true })
```

Add DB index: `OrderSessionSchema.index({ customerMobile: 1, status: 1, franchiseId: 1 });`

---

### Token Number Generator (`utils/tokenGenerator.js`)

Use a per-franchise daily counter stored in MongoDB (not in-memory, to survive restarts):

```js
// models/TokenCounter.js
{
  franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' },
  date: String,          // "YYYY-MM-DD"
  lastToken: { type: Number, default: 100 }
}

// utils/tokenGenerator.js
const generateToken = async (franchiseId) => {
  const today = new Date().toISOString().split('T')[0];
  const counter = await TokenCounter.findOneAndUpdate(
    { franchiseId, date: today },
    { $inc: { lastToken: 1 } },
    { upsert: true, new: true }
  );
  return `TOKEN-${counter.lastToken}`;
};
```

Tokens reset daily per franchise. Each franchise gets its own sequence.

---

### Core API Endpoints (`routes/sessions.js`)

#### 1. Start or Resume Session
```
POST /sessions/start
Body: { mobile, franchiseId, tableNumber, orderType }
```
Logic:
1. Look up customer by mobile
2. Check for any `open` or `bill_pending` session for this mobile + franchiseId today
3. If found → return existing session (resume flow)
4. If not found → create new session, generate token, mark table as `occupied`

Response includes: `{ sessionId, tokenNumber, tableNumber, isResumed: true|false, customer }`

#### 2. Add Order to Session
```
POST /sessions/:sessionId/orders
Body: { items: [...], destination: 'kitchen'|'counter', placedBy }
```
Logic:
1. Validate session is `open`
2. Append new order to `session.orders[]` with `isAddition: true` if session already has orders
3. Recompute `subtotal` and `totalAmount`
4. Emit Socket.IO event: `new_order` to `kitchen_{franchiseId}` or `counter_{franchiseId}` room

Kitchen/Counter receives payload:
```js
{
  tokenNumber: "TOKEN-101",
  tableNumber: "Table 1",
  isAddition: true,           // shows "ADDITION" badge in kitchen UI
  items: [...],
  orderedAt: "..."
}
```

#### 3. Get Session Summary
```
GET /sessions/:sessionId
```
Returns: token, table, customer info, all merged items (grouped & summed), totals, payment status

#### 4. Generate Final Bill
```
POST /sessions/:sessionId/bill
```
Logic:
1. Merge all `session.orders[].items` → group by item name, sum quantities
2. Apply discount/coupon if any
3. Compute tax
4. Set `status: 'bill_pending'`
5. Return merged invoice data for print/display

#### 5. Record Payment
```
POST /sessions/:sessionId/payment
Body: { amount, method }
```
Updates `paidAmount`, appends to `payments[]`, recomputes `paymentStatus`.
If `paidAmount >= totalAmount` → set `status: 'paid'` → emit `session_closed` socket event → mark table as `available`.

#### 6. Close Session
```
POST /sessions/:sessionId/close
```
Sets `status: 'closed'`, records `closedAt`, updates `customer.totalSpent`, `customer.visitCount`.

---

### Table Status Logic (`models/Table.js`)

```js
{
  franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' },
  tableNumber: String,
  capacity: Number,
  qrCode: String,                // base64 or hosted URL
  qrSecret: String,              // HMAC secret for QR validation
  status: { type: String, enum: ['available', 'occupied', 'bill_pending', 'reserved'], default: 'available' },
  currentSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderSession', default: null }
}
```

Status transitions:
- `available` → `occupied` : when session starts
- `occupied` → `bill_pending` : when bill is generated
- `bill_pending` → `available` : when session is paid and closed

---

### Frontend — POS Order Entry Flow (`src/pages/pos/NewOrder.jsx`)

**Step 1: Customer Identification**
- Input: mobile number (10 digits)
- On 10th digit entered → call `POST /sessions/start`
- Show result: token card with token number, table, returning customer info
- If resuming: show banner "Resuming Token #101 — Table 3" with existing items listed

**Step 2: Item Selection**
- Menu grid filtered by franchise inventory and availability
- Each item: name, price, +/- quantity controls, special notes input
- Cart sidebar shows running total

**Step 3: Route Order**
- "Send to Kitchen" button → `destination: kitchen`
- "Send to Counter" button → `destination: counter`
- Both attach to same token

**Step 4: Bill & Payment**
- "Generate Bill" button → calls `/sessions/:id/bill` → shows merged invoice
- Payment section: amount input, method toggle (Cash/UPI/Card)
- "Collect Payment" → records payment, closes session if fully paid

---

### Frontend — Kitchen Dashboard Order Card (`src/pages/kitchen/KitchenDashboard.jsx`)

Each incoming order renders as a card:

```
┌─────────────────────────────────┐
│  🔢 TOKEN-101    📍 Table 3     │
│  ⚡ ADDITION TO EXISTING ORDER  │  ← shown if isAddition: true
│─────────────────────────────────│
│  • Masala Dosa         x2       │
│  • Filter Coffee       x1       │
│    Note: Less sugar             │
│─────────────────────────────────│
│  ⏱ 3 min ago                   │
│  [Preparing] [Ready] [Delivered]│
└─────────────────────────────────┘
```

Status button clicks emit `update_order_status` socket event.
"ADDITION" badge in amber/yellow to visually distinguish from new orders.

---

### Frontend — Table Map View (`src/pages/pos/TableMap.jsx`)

Grid of table cards showing live status:

```
┌────────────┐  ┌────────────┐  ┌────────────┐
│  Table 1   │  │  Table 2   │  │  Table 3   │
│ 🟢 Available│  │ 🔴 Occupied │  │ 🟡 Bill Due │
│            │  │ TOKEN-101  │  │ TOKEN-98   │
│            │  │ 4 items    │  │ ₹340 due   │
└────────────┘  └────────────┘  └────────────┘
```

Clicking an occupied table shows the session summary. Clicking available table opens new order flow.
Table statuses update in real-time via Socket.IO `table_status_updated` event.

---

### Socket.IO Events for This Module

| Event | Emitted By | Received By | Payload |
|-------|-----------|-------------|---------|
| `session_started` | Server | POS, Admin | `{ tokenNumber, tableNumber, customerName }` |
| `new_order` | Server | Kitchen or Counter | `{ tokenNumber, tableNumber, isAddition, items }` |
| `order_status_updated` | Kitchen | POS, Admin, Display | `{ tokenNumber, status }` |
| `token_ready` | Server | Display Board | `{ tokenNumber, tableNumber }` |
| `table_status_updated` | Server | POS Table Map | `{ tableNumber, status, tokenNumber }` |
| `session_closed` | Server | Kitchen, POS, Admin | `{ tokenNumber, tableNumber }` |

---

### Walk-In Counter Order Handling

When `orderType: 'counter'`:
- `tableId` is null; `tableNumber` is set to `"Counter"`
- Token is still generated and assigned
- Operator can optionally assign a table later via `PATCH /sessions/:id/assign-table`
- Kitchen/counter routing works identically
- Display board shows token without table number

---

### Edge Cases to Handle

| Scenario | System Behavior |
|----------|----------------|
| Same mobile, different franchise | Treated as a new session (franchise-scoped lookup) |
| Session left open overnight | Cron job at 3 AM closes stale sessions older than 8 hours, marks table available |
| Payment collected before all items arrive | Allowed — token stays open for kitchen to fulfil, payment recorded |
| Staff enters wrong mobile | "Edit Customer" option on open session — reassign to correct mobile |
| Table QR scanned after session closed | New session starts fresh for that table |
| Network drops mid-order | Frontend queues order locally, retries on reconnect, deduplication via client-generated `orderRef` UUID |

---

### Update Implementation Sequence

Add this module between steps 4 and 5 in the sequence:

```
4. Customer System (Module 4)
→ 4b. Token & Table Order System (Module 25)  ← INSERT HERE
5. Order Session / Merge (Module 6) — Now builds on top of Module 25 logic
```

Module 25 replaces the basic session logic in Module 6 with this more complete, production-grade flow.

---

## ⚠️ GENERAL RULES FOR ALL MODULES

- Never hardcode credentials, API keys, or secrets — always use `.env`
- Every API response must follow: `{ success: true|false, data: {}, message: "" }`
- Every error must return the appropriate HTTP status code (400, 401, 403, 404, 500)
- All date fields must be stored in UTC; display in local timezone on frontend
- All currency values must be stored in paise (integer) and divided by 100 for display
- Every new DB schema must include `createdAt` and `updatedAt` via `{ timestamps: true }`
- Test every module with at least: success case, missing auth, wrong role, invalid input

---

*End of Cafe Franchise POS — Complete Upgrade Coding Prompt*
