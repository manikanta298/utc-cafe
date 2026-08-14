const express = require('express');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const router = express.Router();
const Invoice = require('../models/Invoice');
const Order = require('../models/Order');
const { protect, authorise } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');
const { logAudit } = require('../utils/auditHelper');

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Net Banking', 'Split', 'Other'];

const normalizePaymentMethod = (value = '') => {
  const method = String(value || '').trim();
  if (!method) return '';
  const match = PAYMENT_METHODS.find((allowed) => allowed.toLowerCase() === method.toLowerCase());
  return match || 'Other';
};

const csvEscape = (value) => {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

const formatCurrency = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;

const INVOICE_HEADERS = ['Invoice No', 'Date', 'Franchise', 'Customer', 'Phone', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total Tax', 'Discount', 'Total Amount', 'Payment'];

const invoiceRowValues = (invoice) => [
  invoice.invoice_no,
  invoice.invoice_date?.toISOString(),
  `${invoice.franchise_id?.franchiseCode || ''} ${invoice.franchise_id?.name || ''}`.trim(),
  invoice.customer_name,
  invoice.customer_phone,
  invoice.taxable_amount,
  invoice.cgst,
  invoice.sgst,
  invoice.igst,
  invoice.total_tax,
  invoice.discount_amount,
  invoice.final_amount,
  invoice.payment_mode,
];

const sendInvoicesExcel = async (res, invoices) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UTC Cafe';
  const sheet = workbook.addWorksheet('GST Invoices');

  const headerRow = sheet.addRow(INVOICE_HEADERS);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    cell.border = { bottom: { style: 'thin' } };
  });

  let totalAmount = 0;
  invoices.forEach((invoice) => {
    sheet.addRow(invoiceRowValues(invoice).map((v) => v ?? ''));
    totalAmount += Number(invoice.final_amount || 0);
  });

  const totalRow = sheet.addRow([]);
  totalRow.getCell(INVOICE_HEADERS.length - 2).value = 'Grand Total';
  totalRow.getCell(INVOICE_HEADERS.length - 2).font = { bold: true };
  totalRow.getCell(INVOICE_HEADERS.length - 1).value = totalAmount;
  totalRow.getCell(INVOICE_HEADERS.length - 1).font = { bold: true };

  sheet.columns.forEach((col) => { col.width = 16; });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="gst-invoices.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
};

const assertInvoiceAccess = (req, invoice) => {
  if (req.user.role === 'master_admin') return true;
  const userFranchise = (req.user.franchise_id._id || req.user.franchise_id).toString();
  return invoice.franchise_id?._id
    ? invoice.franchise_id._id.toString() === userFranchise
    : invoice.franchise_id.toString() === userFranchise;
};

const buildInvoiceFilter = (req) => {
  const { franchiseId, month, year, phone, paymentMethod } = req.query;
  const filter = {};
  if (req.user.role !== 'master_admin') {
    filter.franchise_id = req.user.franchise_id._id || req.user.franchise_id;
  } else if (franchiseId) {
    filter.franchise_id = franchiseId;
  }
  if (phone) {
    filter.customer_phone = phone.trim();
  }
  if (paymentMethod && paymentMethod !== 'all') {
    const normalized = normalizePaymentMethod(paymentMethod);
    filter.payment_mode = normalized === 'Other'
      ? { $nin: ['Cash', 'UPI', 'Card', 'Net Banking', '', null] }
      : normalized;
  }
  if (month && year) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    filter.invoice_date = { $gte: start, $lt: end };
  }
  return filter;
};

const sendInvoicesPdf = (res, invoices) => {
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="gst-invoices.pdf"');
  doc.pipe(res);

  doc.fontSize(18).text('UTC Cafe GST Invoice Report', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
  doc.moveDown();

  const totals = invoices.reduce((acc, invoice) => {
    acc.taxable += Number(invoice.taxable_amount || 0);
    acc.tax += Number(invoice.total_tax || 0);
    acc.discount += Number(invoice.discount_amount || 0);
    acc.final += Number(invoice.final_amount || 0);
    return acc;
  }, { taxable: 0, tax: 0, discount: 0, final: 0 });

  doc.font('Helvetica-Bold').fontSize(10).text(
    `Taxable: ${formatCurrency(totals.taxable)}   Tax: ${formatCurrency(totals.tax)}   Discount: ${formatCurrency(totals.discount)}   Final: ${formatCurrency(totals.final)}`
  );
  doc.moveDown();

  invoices.slice(0, 500).forEach((invoice) => {
    doc.font('Helvetica-Bold').fontSize(9).text(`${invoice.invoice_no} | ${invoice.franchise_id?.name || invoice.franchise_name || ''} | ${invoice.payment_mode || ''}`);
    doc.font('Helvetica').fontSize(8).text(`${invoice.customer_name || '-'} ${invoice.customer_phone || ''} | Tax ${formatCurrency(invoice.total_tax)} | Final ${formatCurrency(invoice.final_amount)} | ${invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleString('en-IN') : ''}`);
    doc.moveDown(0.35);
  });

  if (invoices.length > 500) doc.text(`Showing first 500 of ${invoices.length} invoices. Export CSV/Excel for full data.`);
  doc.end();
};


const renderReceiptHtml = (invoice) => {
  const items = (invoice.items || []).map((item) => ({
    name: item.name || '',
    quantity: Number(item.quantity || 0),
    rate: Number(item.price || 0),
    total: Number(item.item_total || 0),
  }));

  const paymentMode = String(invoice.payment_mode || 'Cash').trim();
  const payments = Array.isArray(invoice.payments) && invoice.payments.length > 0
    ? invoice.payments
    : [{ method: paymentMode || 'Cash', amount: Number(invoice.final_amount || 0), reference: '' }];

  const totalPaid = payments.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const isSplit = paymentMode.toLowerCase() === 'split' || payments.length > 1;
  const computedGrand = Number(invoice.taxable_amount || 0) + Number(invoice.total_tax || 0) - Number(invoice.discount_amount || 0);
  const totalPayable = Number(invoice.final_amount || 0);
  const rounding = +(totalPayable - computedGrand).toFixed(2);

  const paymentLabel = (method) => {
    const m = String(method || 'Cash').toLowerCase();
    if (m.includes('upi')) return 'UPI Paid:';
    if (m.includes('card')) return 'Credit Card (Visa) Paid:';
    if (m.includes('bank')) return 'Net Banking Paid:';
    if (m.includes('wallet')) return 'Wallet Paid:';
    return 'Cash Paid:';
  };

  const rows = items.map((item) => `
    <div class="item-row">
      <div class="item-name">${item.name}</div>
      <div class="qty">${item.quantity}</div>
      <div class="rate">${Number(item.rate).toFixed(2)}</div>
      <div class="amount">${Number(item.total).toFixed(2)}</div>
    </div>
  `).join('');

  const paymentRows = payments.map((line) => `
    <div class="line">
      <span>${paymentLabel(line.method)}</span>
      <span>${Number(line.amount || 0).toFixed(2)}</span>
    </div>
    ${line.reference ? `<div class="line indent"><span>Ref:</span><span>${String(line.reference)}</span></div>` : ''}
  `).join('');

  return `<!doctype html>
  <html>
  <head>
    <title>${invoice.invoice_no}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #f2f2f2; color: #111; font-family: "Courier New", Courier, monospace; }
      body { padding: 16px; }
      .receipt {
        width: 320px;
        margin: 0 auto;
        background: #fff;
        padding: 10px 8px;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.04);
      }
      .center { text-align: center; }
      .title { font-size: 24px; font-weight: 700; line-height: 1.1; }
      .sub { font-size: 12px; line-height: 1.25; }
      .gst { font-size: 12px; }
      .divider { border-top: 1px dashed #222; margin: 8px 0; }
      .info {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        font-size: 12px;
        line-height: 1.35;
      }
      .item-header, .item-row {
        display: grid;
        grid-template-columns: 1fr 28px 44px 48px;
        gap: 4px;
        align-items: start;
        font-size: 12px;
      }
      .item-header { font-weight: 700; }
      .item-row { padding: 2px 0; }
      .item-name { word-break: break-word; }
      .qty, .rate, .amount { text-align: right; white-space: nowrap; }
      .line {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding: 1px 0;
        font-size: 12px;
      }
      .line.indent { padding-left: 10px; }
      .bold { font-weight: 700; font-size: 13px; }
      .footer { text-align: center; font-size: 12px; margin-top: 10px; }
      .qr { width: 140px; height: 140px; object-fit: contain; margin: 6px auto 0; display: block; }
      @media print {
        body { background: #fff; padding: 0; }
        .receipt { width: 80mm; padding: 3mm 2mm; box-shadow: none; }
        button { display: none !important; }
      }
    </style>
  </head>
  <body>
    <div class="receipt">
      <div class="center">
        <div class="title">${invoice.franchise_name || invoice.franchise_id?.name || 'UTC CAFE'}</div>
        <div class="sub">${invoice.franchise_address || invoice.franchise_id?.address || '1-2-3 Main Road, Timmapuram, AP - 531162'}</div>
        <div class="gst">GSTIN: ${invoice.franchise_gstin || invoice.franchise_id?.gstin || '37ABCDE1234F1Z5'}</div>
      </div>

      <div class="divider"></div>

      <div class="info">
        <div>
          <div>Date: ${new Date(invoice.invoice_date || invoice.createdAt).toLocaleString('en-IN')}</div>
          <div>${invoice.invoice_no}</div>
          <div>Token: #${invoice.token_number || '-'}</div>
          <div>Table: ${invoice.table_number || '-'}</div>
        </div>
        <div>
          <div>Customer: ${invoice.customer_name || 'Walk-In'}</div>
          <div>Phone: ${invoice.customer_phone || ''}</div>
          <div>Payment: ${paymentMode}</div>
          <div>Type: ${invoice.visit_type || 'Single (For Analytics Only)'}</div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="item-header">
        <div>Item</div><div>Qty</div><div>Rate</div><div>Amount</div>
      </div>

      <div class="divider"></div>

      ${rows}

      <div class="divider"></div>

      <div class="totals">
        <div class="line"><span>Subtotal:</span><span>${Number(invoice.taxable_amount || 0).toFixed(2)}</span></div>
        ${(invoice.cgst || 0) > 0 ? `<div class="line"><span>CGST (5%):</span><span>${Number(invoice.cgst || 0).toFixed(2)}</span></div>` : ''}
        ${(invoice.sgst || 0) > 0 ? `<div class="line"><span>SGST (5%):</span><span>${Number(invoice.sgst || 0).toFixed(2)}</span></div>` : ''}
        ${(invoice.discount_amount || 0) > 0 ? `<div class="line"><span>Discount:</span><span>-${Number(invoice.discount_amount || 0).toFixed(2)}</span></div>` : ''}
        <div class="line"><span>Grand Total:</span><span>${computedGrand.toFixed(2)}</span></div>
        <div class="line"><span>Rounding:</span><span>${rounding.toFixed(2)}</span></div>
        <div class="divider"></div>
        <div class="line bold"><span>Total Payable:</span><span>${totalPayable.toFixed(2)}</span></div>
      </div>

      <div class="divider"></div>

      <div class="center bold">PAYMENT BREAKDOWN</div>
      <div class="divider"></div>

      ${paymentRows}

      <div class="line"><span>Total Amount Paid:</span><span>${(isSplit ? totalPaid : totalPayable).toFixed(2)}</span></div>
      <div class="line"><span>Change Due:</span><span>${Math.max(0, totalPaid - totalPayable).toFixed(2)}</span></div>

      ${paymentMode.toLowerCase().includes('upi') ? `
        <div class="divider"></div>
        <div class="center">
          <div class="bold">SCAN TO PAY (UPI)</div>
          <div>Merchant UPI: ${invoice.franchise_id?.upiId || 'utc.cafe@bank'}</div>
        </div>
      ` : ''}

      <div class="divider"></div>
      <div class="footer">
        <div>Thank you for visiting!</div>
        <div>Utc Café</div>
      </div>

      <button onclick="window.print()" style="margin-top:14px;width:100%;padding:10px;font-size:14px;">Print / Save PDF</button>
    </div>
  </body>
  </html>`;
};
const streamInvoicePdf = (res, invoice) => {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_no}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text(invoice.franchise_name || invoice.franchise_id?.name || 'UTC Cafe', { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(10).text(invoice.franchise_address || invoice.franchise_id?.address || '', { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(12).text('Tax Invoice', { align: 'center' });
  doc.moveDown();

  const metaRows = [
    ['Invoice', invoice.invoice_no],
    ['Date', new Date(invoice.invoice_date || invoice.createdAt).toLocaleString('en-IN')],
    ['Customer', invoice.customer_name || ''],
    ['Mobile', invoice.customer_phone || ''],
    ['GSTIN', invoice.franchise_gstin || invoice.franchise_id?.gstin || ''],
  ];

  metaRows.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
    doc.font('Helvetica').text(value || '');
  });

  doc.moveDown();
  doc.font('Helvetica-Bold').text('Items');
  doc.moveDown(0.5);

  (invoice.items || []).forEach((item) => {
    doc.font('Helvetica-Bold').text(item.name || '', { continued: true });
    doc.font('Helvetica').text(`  x${item.quantity || 0}`);
    doc.fontSize(10).fillColor('#555').text(`Rate ${formatCurrency(item.price)} · Total ${formatCurrency(item.item_total)}`);
    doc.fillColor('#000').fontSize(12).moveDown(0.4);
  });

  doc.moveDown();
  [
    ['Taxable', invoice.taxable_amount],
    ['CGST', invoice.cgst],
    ['SGST', invoice.sgst],
    ['IGST', invoice.igst],
    ['Discount', invoice.discount_amount],
    ['Total', invoice.final_amount],
  ].forEach(([label, value]) => {
    doc.font(label === 'Total' ? 'Helvetica-Bold' : 'Helvetica').text(`${label}: ${formatCurrency(value)}`, { align: 'right' });
  });

  doc.moveDown();
  doc.fontSize(10).font('Helvetica').text('Thank you. Please visit again.', { align: 'center' });
  doc.end();
};

router.get('/', protect, enforceActiveFranchise, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const filter = buildInvoiceFilter(req);
    const skip = (page - 1) * limit;
    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .populate('franchise_id', 'name franchiseCode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Invoice.countDocuments(filter),
    ]);
    res.json({ success: true, invoices, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/search', protect, enforceActiveFranchise, authorise('pos_staff', 'shift_operator', 'manager', 'franchise_owner'), async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number required' });

    const invoices = await Invoice.find(buildInvoiceFilter(req))
      .populate('franchise_id', 'name franchiseCode')
      .sort({ invoice_date: -1, createdAt: -1 })
      .limit(100);

    res.json({ success: true, invoices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/export.csv', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager'), async (req, res) => {
  try {
    const { format = 'csv' } = req.query;
    const invoices = await Invoice.find(buildInvoiceFilter(req))
      .populate('franchise_id', 'name franchiseCode')
      .sort({ createdAt: -1 })
      .limit(5000);

    if (format === 'pdf') return sendInvoicesPdf(res, invoices);
    if (format === 'excel') return await sendInvoicesExcel(res, invoices);

    const csv = [INVOICE_HEADERS, ...invoices.map(invoiceRowValues)]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="gst-invoices.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/:id/financials', protect, enforceActiveFranchise, authorise('master_admin'), async (req, res) => {
  try {
    const allowedFields = [
      'taxable_amount',
      'cgst',
      'sgst',
      'igst',
      'total_tax',
      'discount_amount',
      'final_amount',
      'payment_mode',
      'customer_name',
      'customer_phone',
    ];
    const invoice = await Invoice.findById(req.params.id).populate('franchise_id', 'name franchiseCode');
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const oldValues = {
      amount: invoice.final_amount,
      payment_mode: invoice.payment_mode,
      taxable_amount: invoice.taxable_amount,
      cgst: invoice.cgst,
      sgst: invoice.sgst,
      igst: invoice.igst,
      total_tax: invoice.total_tax,
      discount_amount: invoice.discount_amount,
    };

    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });
    if (updates.payment_mode !== undefined) updates.payment_mode = normalizePaymentMethod(updates.payment_mode);

    Object.assign(invoice, updates);
    await invoice.save();

    if (invoice.order_id) {
      const orderUpdates = {};
      if (updates.payment_mode !== undefined) orderUpdates.payment_mode = updates.payment_mode;
      if (updates.discount_amount !== undefined) orderUpdates.discount_amount = Number(updates.discount_amount);
      if (updates.final_amount !== undefined) orderUpdates.final_amount = Number(updates.final_amount);
      if (Object.keys(orderUpdates).length) await Order.findByIdAndUpdate(invoice.order_id, { $set: orderUpdates });
    }

    await logAudit('INVOICE_FINANCIALS_EDITED', req, invoice._id, 'Invoice', {
      invoiceId: invoice._id,
      invoiceNo: invoice.invoice_no,
      franchiseId: invoice.franchise_id?._id || invoice.franchise_id,
      franchiseName: invoice.franchise_id?.name || invoice.franchise_name || '',
      oldAmount: oldValues.amount,
      newAmount: invoice.final_amount,
      oldPaymentMethod: oldValues.payment_mode,
      newPaymentMethod: invoice.payment_mode,
      oldValues,
      newValues: updates,
      editedBy: req.user?.name || '',
      editedById: req.user?._id,
      editedAt: new Date(),
      reason: req.body.reason || '',
    });

    res.json({ success: true, invoice, message: 'Invoice financials updated and audited' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', protect, enforceActiveFranchise, authorise('master_admin'), async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('franchise_id', 'name franchiseCode');
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const auditDetails = {
      invoiceId: invoice._id,
      invoiceNo: invoice.invoice_no,
      franchiseId: invoice.franchise_id?._id || invoice.franchise_id,
      franchiseName: invoice.franchise_id?.name || invoice.franchise_name || '',
      oldAmount: invoice.final_amount,
      newAmount: 0,
      paymentMethod: invoice.payment_mode,
      editedBy: req.user?.name || '',
      editedById: req.user?._id,
      editedAt: new Date(),
      reason: req.body?.reason || '',
    };

    await invoice.deleteOne();
    await logAudit('INVOICE_DELETED', req, auditDetails.invoiceId, 'Invoice', auditDetails);
    res.json({ success: true, message: 'Invoice deleted and audited' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', protect, enforceActiveFranchise, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('franchise_id', 'name franchiseCode state gstin');
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (!assertInvoiceAccess(req, invoice)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    res.json({ success: true, invoice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id/receipt', protect, enforceActiveFranchise, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('franchise_id', 'name franchiseCode state gstin address phone');
    if (!invoice) return res.status(404).send('Invoice not found');
    if (!assertInvoiceAccess(req, invoice)) return res.status(403).send('Access denied');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderReceiptHtml(invoice));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get('/:id/pdf', protect, enforceActiveFranchise, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('franchise_id', 'name franchiseCode state gstin address phone');
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (!assertInvoiceAccess(req, invoice)) return res.status(403).json({ success: false, message: 'Access denied' });

    streamInvoicePdf(res, invoice);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/invoices/:id/whatsapp — Generate WhatsApp deep-link with invoice summary
router.post('/:id/whatsapp', protect, enforceActiveFranchise, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('franchise_id', 'name address gstin phone');
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (!assertInvoiceAccess(req, invoice)) return res.status(403).json({ success: false, message: 'Access denied' });

    const phone = invoice.customer_phone?.replace(/\D/g, '');
    if (!phone || phone.length < 10) {
      return res.status(400).json({ success: false, message: 'Customer mobile number not available' });
    }

    const storeName = invoice.franchise_name || invoice.franchise_id?.name || 'UTC Café';
    const address   = invoice.franchise_address || invoice.franchise_id?.address || '';
    const gstin     = invoice.franchise_gstin || invoice.franchise_id?.gstin || '';
    const date      = new Date(invoice.invoice_date || invoice.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const items     = (invoice.items || []).map(i => `  • ${i.name} ×${i.quantity} = ₹${Number(i.item_total || 0).toFixed(2)}`).join('\n');

    const message = [
      `🧾 *${storeName}*`,
      address ? address : null,
      gstin ? `GSTIN: ${gstin}` : null,
      ``,
      `*Invoice: ${invoice.invoice_no}*`,
      `Date: ${date}`,
      `Customer: ${invoice.customer_name || 'Walk-in'}`,
      ``,
      `*Items:*`,
      items,
      ``,
      `Subtotal: ₹${Number(invoice.taxable_amount || 0).toFixed(2)}`,
      (invoice.cgst || 0) > 0 ? `CGST: ₹${Number(invoice.cgst).toFixed(2)}` : null,
      (invoice.sgst || 0) > 0 ? `SGST: ₹${Number(invoice.sgst).toFixed(2)}` : null,
      (invoice.discount_amount || 0) > 0 ? `Discount: -₹${Number(invoice.discount_amount).toFixed(2)}` : null,
      `*Total: ₹${Number(invoice.final_amount || 0).toFixed(2)}*`,
      `Payment: ${invoice.payment_mode || 'Cash'}`,
      ``,
      `Thank you for visiting ${storeName}! 🙏`,
      `Please visit again.`,
    ].filter(l => l !== null).join('\n');

    const whatsappUrl = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;
    // Also build receipt URL for sharing
    const receiptUrl = `${req.protocol}://${req.get('host')}/api/invoices/${invoice._id}/receipt`;

    res.json({ success: true, whatsappUrl, receiptUrl, phone: `91${phone}`, message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
