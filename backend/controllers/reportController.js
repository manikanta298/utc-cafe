const Order = require('../models/Order');
const OrderSession = require('../models/OrderSession');
const Customer = require('../models/Customer');
const Coupon = require('../models/Coupon');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const money = (v) => `Rs. ${Number(v || 0).toFixed(2)}`;

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Net Banking', 'Other'];

const normalizePaymentMethod = (value = '') => {
  const method = String(value || '').trim();
  if (!method) return 'Pending';
  const match = PAYMENT_METHODS.find((allowed) => allowed.toLowerCase() === method.toLowerCase());
  return match || 'Other';
};

const paymentHeaders = ['Session Ref', 'Franchise', 'Customer', 'Mobile', 'Payment Type',
  'Total Amount', 'Original Amount', 'Discount', 'Amount Paid', 'Status', 'Token', 'Date'];

const paymentRowValues = (r) => [
  r.sessionRef, r.franchise, r.customerName, r.mobile,
  r.paymentType, r.totalAmount, r.originalAmount, r.discount, r.finalAmount,
  r.paymentStatus, r.tokenNumber, r.date,
];

const sendPaymentPdf = (res, rows, summary, reportLabel) => {
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${reportLabel.toLowerCase().replace(/\s+/g, '-')}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text(`UTC Cafe ${reportLabel}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
  doc.moveDown();
  doc.font('Helvetica-Bold').text(`Total: ${money(summary.total)}   Cash: ${money(summary.Cash)}   UPI: ${money(summary.UPI)}   Card: ${money(summary.Card)}   Net Banking: ${money(summary['Net Banking'])}   Other: ${money(summary.Other)}`);
  doc.moveDown();

  rows.slice(0, 400).forEach((r) => {
    doc.font('Helvetica-Bold').fontSize(9).text(`${r.sessionRef} | ${r.franchise} | ${r.paymentType}`);
    doc.font('Helvetica').fontSize(8).text(`${r.customerName || '-'} ${r.mobile || ''} | Paid ${money(r.finalAmount)} | Discount ${money(r.discount)} | ${r.paymentStatus} | ${r.date ? new Date(r.date).toLocaleString('en-IN') : ''}`);
    doc.moveDown(0.35);
  });

  if (rows.length > 400) doc.text(`Showing first 400 of ${rows.length} rows. Export CSV/Excel for full data.`);
  doc.end();
};

const sendPaymentExcel = async (res, rows, summary, reportLabel) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UTC Cafe';
  const sheet = workbook.addWorksheet(reportLabel.slice(0, 28) || 'Report');

  sheet.mergeCells(1, 1, 1, paymentHeaders.length);
  sheet.getCell(1, 1).value = `UTC Cafe ${reportLabel}`;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };

  sheet.mergeCells(2, 1, 2, paymentHeaders.length);
  sheet.getCell(2, 1).value = `Generated: ${new Date().toLocaleString('en-IN')} | Total Amount: ${money(summary.total)}`;

  const headerRow = sheet.addRow(paymentHeaders);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    cell.border = { bottom: { style: 'thin' } };
  });

  rows.forEach((r) => sheet.addRow(paymentRowValues(r).map((v) => (v ?? ''))));

  const totalRow = sheet.addRow([]);
  totalRow.getCell(paymentHeaders.length - 3).value = 'Grand Total';
  totalRow.getCell(paymentHeaders.length - 3).font = { bold: true };
  totalRow.getCell(paymentHeaders.length - 2).value = summary.total;
  totalRow.getCell(paymentHeaders.length - 2).font = { bold: true };

  sheet.columns.forEach((col) => { col.width = 16; });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${reportLabel.toLowerCase().replace(/\s+/g, '-')}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
};

// GET /api/reports/payments
const getPaymentReport = async (req, res) => {
  try {
    const { franchiseId, startDate, endDate, format = 'json', paymentMethod = 'all' } = req.query;
    const filter = {};
    const isMaster = req.user.role === 'master_admin';

    if (!isMaster) {
      filter.franchiseId = req.user.franchise_id?._id || req.user.franchise_id;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      filter.openedAt = { $gte: start, $lte: end };
    } else if (franchiseId) {
      filter.franchiseId = franchiseId;
    }

    if (isMaster && (startDate || endDate)) {
      filter.openedAt = {};
      if (startDate) filter.openedAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.openedAt.$lte = end;
      }
    }

    const sessions = await OrderSession.find(filter)
      .populate('franchiseId', 'name franchiseCode')
      .populate('customerId', 'name phone_no')
      .sort({ openedAt: -1 })
      .limit(5000)
      .lean();

    // Build rows
    const rows = [];
    for (const s of sessions) {
      if (!s.payments || s.payments.length === 0) {
        rows.push({
          sessionRef: s.sessionRef || s._id,
          franchise: s.franchiseId?.name || '',
          customerName: s.customerId?.name || s.customerName || '',
          mobile: s.customerMobile || '',
            paymentType: 'Pending',
          totalAmount: s.totalAmount || s.subtotal || 0,
          originalAmount: s.totalAmount || 0,
          discount: s.discountAmount || 0,
          finalAmount: s.totalAmount || 0,
          paymentStatus: s.paymentStatus || 'unpaid',
          tokenNumber: s.tokenNumber || '',
          date: s.openedAt,
        });
      } else {
        for (const p of s.payments) {
          rows.push({
            sessionRef: s.sessionRef || s._id,
            franchise: s.franchiseId?.name || '',
            customerName: s.customerId?.name || s.customerName || '',
            mobile: s.customerMobile || '',
            paymentType: normalizePaymentMethod(p.method),
            totalAmount: s.totalAmount || s.subtotal || 0,
            originalAmount: s.subtotal || s.totalAmount || 0,
            discount: s.discountAmount || 0,
            finalAmount: p.amount || 0,
            paymentStatus: s.paymentStatus || '',
            tokenNumber: s.tokenNumber || '',
            date: p.paidAt || s.openedAt,
          });
        }
      }
    }

    // Summary totals
    const normalizedFilterMethod = paymentMethod === 'all' ? 'all' : normalizePaymentMethod(paymentMethod);
    const filteredRows = normalizedFilterMethod === 'all'
      ? rows
      : rows.filter((row) => row.paymentType === normalizedFilterMethod);

    const summary = filteredRows.reduce((acc, r) => {
      acc.total += Number(r.finalAmount || 0);
      acc[r.paymentType] = (acc[r.paymentType] || 0) + r.finalAmount;
      return acc;
    }, { total: 0, Cash: 0, UPI: 0, Card: 0, 'Net Banking': 0, Other: 0, Pending: 0 });

    const reportLabel = normalizedFilterMethod === 'all'
      ? 'All Payments Report'
      : `${normalizedFilterMethod} Report`;

    if (format === 'csv') {
      const csvRows = filteredRows.map((r) => paymentRowValues(r).map(csvEscape).join(','));
      const csv = [paymentHeaders.map(csvEscape).join(','), ...csvRows].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${reportLabel.toLowerCase().replace(/\s+/g, '-')}.csv"`);
      return res.send(csv);
    }

    if (format === 'excel') {
      return await sendPaymentExcel(res, filteredRows, summary, reportLabel);
    }

    if (format === 'pdf') {
      return sendPaymentPdf(res, filteredRows, summary, reportLabel);
    }

    res.json({ success: true, rows: filteredRows, summary, total: filteredRows.length, reportLabel });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/reports/sales
const getSalesReport = async (req, res) => {
  try {
    const { period = 'daily', franchiseId } = req.query;
    const filter = {};

    if (req.user.role !== 'master_admin') {
      filter.franchise_id = req.user.franchise_id?._id || req.user.franchise_id;
      if (period !== 'daily') {
        return res.status(403).json({ success: false, message: 'Franchise users can only view daily summaries' });
      }
    } else if (franchiseId) {
      filter.franchise_id = franchiseId;
    }

    let startDate = new Date();
    if (period === 'daily') startDate.setDate(startDate.getDate() - 30);
    else if (period === 'weekly') startDate.setDate(startDate.getDate() - 90);
    else if (period === 'monthly') startDate.setMonth(startDate.getMonth() - 12);

    filter.createdAt = { $gte: startDate };
    filter.archivedAt = null;

    const orders = await Order.find(filter)
      .populate('franchise_id', 'name franchiseCode')
      .select('final_amount payment_mode createdAt franchise_id discount_amount total_tax')
      .lean();

    // Group by date
    const grouped = {};
    for (const o of orders) {
      const key = o.createdAt.toISOString().split('T')[0];
      if (!grouped[key]) grouped[key] = { date: key, total: 0, orders: 0, cash: 0, upi: 0, card: 0 };
      grouped[key].total += o.final_amount;
      grouped[key].orders += 1;
      const mode = (o.payment_mode || '').toLowerCase();
      if (mode === 'cash') grouped[key].cash += o.final_amount;
      else if (mode === 'upi') grouped[key].upi += o.final_amount;
      else if (mode === 'card') grouped[key].card += o.final_amount;
    }

    const data = Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
    const totalRevenue = orders.reduce((s, o) => s + o.final_amount, 0);

    res.json({ success: true, data, totalRevenue, totalOrders: orders.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getPaymentReport, getSalesReport };
