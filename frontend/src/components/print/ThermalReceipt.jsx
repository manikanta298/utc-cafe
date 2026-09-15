/**
 * ThermalReceipt — unified thermal invoice (Cash / UPI / Card / Split / Loyalty)
 * Matches the paper-style layout used by the receipt photos.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, X, Download, Settings, MessageCircle } from 'lucide-react';

const money = (n) => `₹${Number(n || 0).toFixed(2)}`;

const WIDTHS = [
  { label: '58mm', value: 58 },
  { label: '80mm', value: 80 },
  { label: '104mm', value: 104 },
];

function buildPrintCSS(widthMm, fontSize) {
  return `
    @page { size: ${widthMm}mm auto; margin: 0; }
    @media print {
      html, body { margin: 0; padding: 0; background: #fff; }
      body > * { display: none !important; }
      #thermal-print-area { display: block !important; }
      #thermal-print-area {
        position: absolute;
        top: 0;
        left: 0;
        width: ${widthMm}mm;
        max-width: ${widthMm}mm;
        padding: 1.5mm 1.2mm;
        box-sizing: border-box;
        font-family: "Courier New", Courier, monospace;
        font-size: ${fontSize};
        line-height: 1.15;
        color: #000 !important;
        background: #fff !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .no-print { display: none !important; }
      .receipt-section { page-break-inside: avoid; }
    }
  `;
}

const normalizeMethod = (method, fallback = 'Cash') => {
  const value = String(method || fallback || 'Cash').trim();
  if (!value) return 'Cash';
  if (/upi/i.test(value)) return 'UPI';
  if (/card/i.test(value)) return 'Card';
  if (/bank/i.test(value)) return 'Net Banking';
  if (/wallet/i.test(value)) return 'Wallet';
  if (/loyalty/i.test(value)) return 'Loyalty Points';
  return value === 'Cash' ? 'Cash' : value;
};

const paymentLabel = (method) => {
  switch (normalizeMethod(method)) {
    case 'UPI': return 'UPI Paid:';
    case 'Card': return 'Credit Card (Visa) Paid:';
    case 'Net Banking': return 'Net Banking Paid:';
    case 'Wallet': return 'Wallet Paid:';
    case 'Loyalty Points': return 'Paid via Loyalty Points (No Cash):';
    default: return 'Cash Paid:';
  }
};

const getAmount = (line) => Number(line?.amount || line?.paidAmount || line?.value || 0);

const resolveItemName = (item) => item?.name || item?.item_name || '';

export default function ThermalReceipt({
  session,
  franchise,
  onClose,
  onPaymentDone,
  printerWidth: defaultWidth = 80,
}) {
  const [width, setWidth] = useState(defaultWidth);
  const [showConfig, setShowConfig] = useState(false);
  const [upiQr, setUpiQr] = useState(null);
  const [upiSecsLeft, setUpiSecsLeft] = useState(600);
  const upiExpiryRef = useRef(null);

  const API = import.meta.env.VITE_API_URL || 'https://utc-cafe.onrender.com/api';

  const franchiseId = (
    session?.franchiseId?._id ||
    session?.franchise_id?._id ||
    session?.franchiseId ||
    session?.franchise_id ||
    ''
  )?.toString();

  const invoiceNo = session?.invoiceId?.invoice_no || session?.invoiceNumber || session?.invoice_no || 'INV0001';
  const tokenNumber = session?.tokenNumber || session?.token_number || '';
  const tableNumber = session?.tableNumber || session?.table_number || 'Counter';
  const customerName = session?.customerName || session?.customer_name || '';
  const customerMobile = session?.customerMobile || session?.customer_phone || '';
  const totalAmount = Number(session?.totalAmount || session?.final_amount || session?.gross_total || 0);
  const grandTotal = Number(session?.gross_total || session?.grandTotal || session?.final_amount || session?.subtotal || totalAmount);
  const taxableAmount = Number(session?.subtotal || session?.sub_total || session?.taxable_amount || 0);
  const cgstAmount = Number(session?.cgst_amount || session?.cgst || 0);
  const sgstAmount = Number(session?.sgst_amount || session?.sgst || 0);
  const totalTax = Number(session?.total_tax || (cgstAmount + sgstAmount) || 0);
  const discountAmount = Number(session?.discountAmount || session?.discount_amount || 0);
  const receivedAmount = Number(session?.receivedAmount || session?.paidAmount || totalAmount || 0);
  const payments = Array.isArray(session?.payments) ? session.payments : [];
  const paymentMode = normalizeMethod(
    session?.paymentMode ||
    session?.payment_mode ||
    (payments.length > 1 ? 'Split' : payments[0]?.method) ||
    'Cash'
  );
  const isSplit = paymentMode === 'Split' || payments.length > 1;

  const items = useMemo(() => {
    const source = Array.isArray(session?.mergedItems) && session.mergedItems.length > 0
      ? session.mergedItems
      : Array.isArray(session?.items) ? session.items : [];
    return source.map((item) => ({
      name: resolveItemName(item),
      qty: Number(item?.qty || item?.quantity || 1),
      rate: Number(item?.unitPrice || item?.price || 0),
      amount: Number(item?.totalPrice || item?.item_total || ((item?.qty || item?.quantity || 1) * (item?.unitPrice || item?.price || 0))),
    }));
  }, [session]);

  const paymentLines = useMemo(() => {
    if (payments.length > 0) {
      return payments.map((p) => ({
        method: normalizeMethod(p.method),
        amount: getAmount(p),
        reference: p.reference || p.txnId || p.transactionId || '',
        cardholder: p.cardholder || '',
        cardLast4: p.cardLast4 || p.last4 || '',
        approvalCode: p.approvalCode || p.approval || '',
        tid: p.tid || '',
      }));
    }
    return [{
      method: paymentMode === 'Split' ? 'Cash' : paymentMode,
      amount: receivedAmount || totalAmount,
      reference: session?.upiRef || session?.transactionId || '',
      cardholder: session?.cardholder || '',
      cardLast4: session?.cardLast4 || '',
      approvalCode: session?.approvalCode || '',
      tid: session?.tid || '',
    }];
  }, [payments, paymentMode, receivedAmount, totalAmount, session]);

  const upiAmount = useMemo(() => {
    const upiLineTotal = paymentLines
      .filter((p) => p.method === 'UPI')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    if (upiLineTotal > 0) return upiLineTotal;
    if (paymentMode === 'UPI' || paymentMode === 'Split') return totalAmount;
    return 0;
  }, [paymentLines, paymentMode, totalAmount]);

  const hasUpi = upiAmount > 0;

  useEffect(() => {
    if (!hasUpi || !franchiseId || !upiAmount) return;
    upiExpiryRef.current = Date.now() + 10 * 60 * 1000;
    setUpiSecsLeft(600);

    fetch(`${API}/public/upi-qr/${franchiseId}?amount=${upiAmount.toFixed(2)}&sessionId=${session?._id || ''}&tokenNumber=${tokenNumber}&mobile=${customerMobile}`)
      .then((r) => r.json())
      .then((d) => { if (d.success && d.qr) setUpiQr(d); })
      .catch(() => {});
  }, [API, franchiseId, hasUpi, upiAmount, session?._id, tokenNumber, customerMobile]);

  useEffect(() => {
    if (!upiExpiryRef.current) return undefined;
    const iv = setInterval(() => {
      const left = Math.max(0, Math.ceil((upiExpiryRef.current - Date.now()) / 1000));
      setUpiSecsLeft(left);
      if (left === 0) clearInterval(iv);
    }, 1000);
    return () => clearInterval(iv);
  }, [upiQr]);

  return null;
}