/**
 * ThermalReceipt — unified thermal invoice (Cash / UPI / Card / Split)
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
        padding: 3mm 2mm;
        box-sizing: border-box;
        font-family: "Courier New", Courier, monospace;
        font-size: ${fontSize};
        line-height: 1.3;
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
  return value === 'Cash' ? 'Cash' : value;
};

const paymentLabel = (method) => {
  switch (normalizeMethod(method)) {
    case 'UPI': return 'UPI Paid:';
    case 'Card': return 'Credit Card (Visa) Paid:';
    case 'Net Banking': return 'Net Banking Paid:';
    case 'Wallet': return 'Wallet Paid:';
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

  const cols = width <= 58 ? 32 : width <= 80 ? 42 : 56;
  const px = Math.round((width / 25.4) * 96);
  const fs = width <= 58 ? '9px' : '10px';
  const qrSize = width <= 58 ? 72 : 90;
  const divider = '─'.repeat(cols);

  function triggerPrint() {
    const style = document.createElement('style');
    style.id = 'thermal-css';
    style.textContent = buildPrintCSS(width, fs);
    document.head.appendChild(style);
    window.print();
    setTimeout(() => document.getElementById('thermal-css')?.remove(), 1500);
  }

  const sendWhatsApp = () => {
    const phone = (customerMobile || '').replace(/\D/g, '');
    if (!phone || phone.length < 10) {
      alert('No mobile number on this bill');
      return;
    }

    const store = franchise?.name || 'UTC Café';
    const itemsText = items
      .map((i) => `• ${i.name} x${i.qty} = ${money(i.amount)}`)
      .join('\n');

    const message = [
      `🧾 *${store}*`,
      `Token: #${tokenNumber || '-'}`,
      `Table: ${tableNumber || 'Counter'}`,
      `Date: ${new Date().toLocaleString('en-IN')}`,
      '',
      '*Items:*',
      itemsText,
      '',
      `Total: *${money(totalAmount)}*`,
      `Payment: ${paymentMode}`,
      '',
      `Thank you for visiting ${store}! 🙏`,
    ].join('\n');

    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const Row = ({ label, value, bold = false, indent = false }) => (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: '8px',
      paddingLeft: indent ? '8px' : 0,
      fontWeight: bold ? 700 : 400,
    }}>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );

  const receiptBody = (
    <div
      id="thermal-print-area"
      style={{
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: fs,
        lineHeight: 1.3,
        color: '#000',
        background: '#fff',
        width: `${px}px`,
        maxWidth: `${px}px`,
        padding: '6px 4px',
        margin: '0 auto',
        boxSizing: 'border-box',
        overflowX: 'hidden',
        wordBreak: 'break-word',
      }}
    >
      <div className="receipt-section" style={{ textAlign: 'center', marginBottom: '4px' }}>
        <div style={{ fontWeight: 700, fontSize: width <= 58 ? '12px' : '14px', whiteSpace: 'nowrap' }}>
          {franchise?.name || 'UTC CAFE'}
        </div>
        <div style={{ fontSize: '8px', lineHeight: 1.2 }}>
          {franchise?.address || '1-2-3 Main Road, Timmapuram, AP - 531162'}
        </div>
        <div style={{ fontSize: '8px' }}>
          GSTIN: {franchise?.gstin || '37ABCDE1234F1Z5'}
        </div>
        {franchise?.phone ? <div style={{ fontSize: '8px' }}>Ph: {franchise.phone}</div> : null}
      </div>

      <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>{divider}</div>

      <div className="receipt-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '8px' }}>
        <div>
          <div>Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
          <div>{invoiceNo}</div>
          <div>Token: #{tokenNumber || '-'}</div>
          <div>Table: {tableNumber || 'Counter'}</div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div>Customer: {customerName || 'Walk-In'}</div>
          <div>Customer Type: {session?.visitType || session?.visit_type || 'Single (For Analytics Only)'}</div>
          <div>{session?.orderType === 'parcel' ? 'Type: Parcel' : 'Type: Dine-In'}</div>
          {customerMobile ? <div>Mobile: {customerMobile}</div> : null}
        </div>
      </div>

      <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', marginTop: '6px' }}>{divider}</div>

      <div className="receipt-section" style={{ fontWeight: 700, display: 'grid', gridTemplateColumns: '1fr 24px 40px 44px', gap: '4px', marginBottom: '2px' }}>
        <span>Item</span>
        <span style={{ textAlign: 'right' }}>Qty</span>
        <span style={{ textAlign: 'right' }}>Rate</span>
        <span style={{ textAlign: 'right' }}>Amount</span>
      </div>

      <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>{divider}</div>

      <div className="receipt-section">
        {items.map((item, i) => (
          <div key={i} style={{ marginBottom: '2px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 40px 44px', gap: '4px', alignItems: 'start' }}>
              <span style={{ wordBreak: 'break-word' }}>{item.name}</span>
              <span style={{ textAlign: 'right' }}>{item.qty}</span>
              <span style={{ textAlign: 'right' }}>{money(item.rate)}</span>
              <span style={{ textAlign: 'right' }}>{money(item.amount)}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', marginTop: '4px' }}>{divider}</div>

      <div className="receipt-section" style={{ marginTop: '2px' }}>
        <Row label="Subtotal:" value={money(taxableAmount || grandTotal - totalTax)} />
        {(cgstAmount || 0) > 0 ? <Row label="CGST (5%):" value={money(cgstAmount)} indent /> : null}
        {(sgstAmount || 0) > 0 ? <Row label="SGST (5%):" value={money(sgstAmount)} indent /> : null}
        {discountAmount > 0 ? <Row label="Discount:" value={`-${money(discountAmount)}`} indent /> : null}
        <Row label="Grand Total:" value={money(grandTotal)} />
        <Row label="Rounding:" value={money(totalAmount - grandTotal)} />
        <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', margin: '2px 0' }}>{divider}</div>
        <Row label="Total Payable:" value={money(totalAmount)} bold />
      </div>

      <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', marginTop: '4px' }}>{divider}</div>

      <div className="receipt-section" style={{ marginTop: '2px' }}>
        <div style={{ textAlign: 'center', fontWeight: 700, marginBottom: '2px' }}>PAYMENT BREAKDOWN</div>
        <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', marginBottom: '4px' }}>{divider}</div>

        {paymentLines.map((p, index) => {
          const label = paymentLabel(p.method);
          const extra = p.method === 'Card' && (p.cardLast4 || p.cardholder || p.approvalCode || p.tid)
            ? (
              <>
                {p.cardLast4 ? <Row label="Card #:" value={`**** **** **** ${String(p.cardLast4).slice(-4)}`} /> : null}
                {p.cardholder ? <Row label="Cardholder:" value={p.cardholder} /> : null}
                {p.approvalCode ? <Row label="Appr. Code:" value={p.approvalCode} /> : null}
                {p.tid ? <Row label="TID:" value={p.tid} /> : null}
              </>
            )
            : null;

          return (
            <div key={index} style={{ marginBottom: '2px' }}>
              <Row label={label} value={money(p.amount)} />
              {p.reference ? <Row label={p.method === 'UPI' ? 'UPI Ref:' : 'Ref:'} value={p.reference} indent /> : null}
              {extra}
            </div>
          );
        })}

        {isSplit && paymentLines.length > 1 ? (
          <>
            <Row label="Total Amount Paid:" value={money(paymentLines.reduce((sum, p) => sum + Number(p.amount || 0), 0))} />
          </>
        ) : (
          <Row label="Total Amount Paid:" value={money(receivedAmount)} />
        )}
        <Row label="Change Due:" value={money(Math.max(0, receivedAmount - totalAmount))} />
      </div>

      {hasUpi && (
        <>
          <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', margin: '4px 0' }}>{divider}</div>
          <div className="receipt-section" style={{ textAlign: 'center', padding: '2px 0' }}>
            <div style={{ fontWeight: 700, fontSize: '9px', marginBottom: '2px' }}>
              SCAN TO PAY (UPI)
            </div>
            {upiQr && upiSecsLeft > 0 ? (
              <>
                <img
                  src={upiQr.qr}
                  alt="UPI QR"
                  style={{ width: `${qrSize}px`, height: `${qrSize}px`, display: 'block', margin: '0 auto' }}
                />
                <div style={{ fontSize: '8px', marginTop: '2px' }}>
                  Merchant UPI: {upiQr.upiId || upiQr.upi_id || ''}
                </div>
              </>
            ) : (
              <div style={{ fontSize: '8px', color: 'red' }}>QR EXPIRED — Ask staff to reprint</div>
            )}
          </div>
          <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', margin: '4px 0' }}>{divider}</div>
        </>
      )}

      <div className="receipt-section" style={{ textAlign: 'center', paddingTop: '2px' }}>
        <div>Thank you for visiting!</div>
        <div>Utc Café</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden">
        <div className="no-print flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div>
            <div className="font-bold text-gray-900">Thermal Invoice Preview</div>
            <div className="text-xs text-gray-500">Cash / UPI / Card / Split use the same layout</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfig((v) => !v)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 text-sm"
            >
              <Settings size={15} />
              Width
            </button>
            <button
              onClick={triggerPrint}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-black text-white hover:bg-gray-800 text-sm"
            >
              <Printer size={15} />
              Print
            </button>
            <button
              onClick={sendWhatsApp}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-green-600 text-white hover:bg-green-500 text-sm"
            >
              <MessageCircle size={15} />
              WhatsApp
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {showConfig && (
          <div className="no-print px-4 py-3 border-b border-gray-200 bg-white flex items-center gap-2">
            <span className="text-sm text-gray-600">Paper width</span>
            <div className="flex items-center gap-2">
              {WIDTHS.map((w) => (
                <button
                  key={w.value}
                  onClick={() => setWidth(w.value)}
                  className={[
                    'px-3 py-1.5 rounded-lg border text-sm',
                    width === w.value
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
                  ].join(' ')}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
              <Download size={14} />
              Print output uses the thermal layout only.
            </div>
          </div>
        )}

        <div className="max-h-[85vh] overflow-auto bg-gray-100 p-4">
          <div className="mx-auto w-fit bg-white shadow-sm rounded-lg border border-gray-200">
            {receiptBody}
          </div>
        </div>
      </div>
    </div>
  );
}
