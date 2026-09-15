import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, X, Download, Settings, MessageCircle } from 'lucide-react';

const money = (n) => `₹${Number(n || 0).toFixed(2)}`;
const WIDTHS = [{ label: '58mm', value: 58 }, { label: '80mm', value: 80 }, { label: '104mm', value: 104 }];
const normalizeMethod = (method, fallback = 'Cash') => {
  const value = String(method || fallback || 'Cash').trim();
  if (/upi/i.test(value)) return 'UPI';
  if (/card/i.test(value)) return 'Card';
  if (/bank/i.test(value)) return 'Net Banking';
  if (/wallet/i.test(value)) return 'Wallet';
  if (/loyalty/i.test(value)) return 'Loyalty Points';
  return value || 'Cash';
};
const paymentLabel = (method) => ({
  UPI: 'UPI Paid:', Card: 'Credit Card (Visa) Paid:', 'Net Banking': 'Net Banking Paid:',
  Wallet: 'Wallet Paid:', 'Loyalty Points': 'Paid via Loyalty Points (No Cash):',
}[normalizeMethod(method)] || 'Cash Paid:');
const getAmount = (line) => Number(line?.amount || line?.paidAmount || line?.value || 0);

export default function ThermalReceipt({ session, franchise, onClose, onPaymentDone, printerWidth: defaultWidth = 80 }) {
  const [width, setWidth] = useState(defaultWidth);
  const [showConfig, setShowConfig] = useState(false);
  const [upiQr, setUpiQr] = useState(null);
  const [upiSecsLeft, setUpiSecsLeft] = useState(600);
  const expiryRef = useRef(null);
  const API = import.meta.env.VITE_API_URL || 'https://utc-cafe.onrender.com/api';
  const franchiseId = String(session?.franchiseId?._id || session?.franchise_id?._id || session?.franchiseId || session?.franchise_id || '');
  const invoiceNo = session?.invoiceId?.invoice_no || session?.invoiceNumber || session?.invoice_no || 'INV0001';
  const tokenNumber = session?.tokenNumber || session?.token_number || '';
  const tableNumber = session?.tableNumber || session?.table_number || 'Counter';
  const customerName = session?.customerName || session?.customer_name || '';
  const customerMobile = session?.customerMobile || session?.customer_phone || '';
  const totalAmount = Number(session?.totalAmount || session?.final_amount || session?.gross_total || 0);
  const discountAmount = Number(session?.discountAmount || session?.discount_amount || 0);
  const taxableAmount = Number(session?.subtotal || session?.sub_total || session?.taxable_amount || 0);
  const cgst = Number(session?.cgst_amount || session?.cgst || 0);
  const sgst = Number(session?.sgst_amount || session?.sgst || 0);
  const totalTax = Number(session?.total_tax || cgst + sgst || 0);
  const payments = Array.isArray(session?.payments) ? session.payments : [];
  const paymentMode = normalizeMethod(session?.paymentMode || session?.payment_mode || (payments.length > 1 ? 'Split' : payments[0]?.method) || 'Cash');
  const receivedAmount = Number(session?.receivedAmount || session?.paidAmount || totalAmount || 0);
  const paymentLines = useMemo(() => payments.length ? payments.map(p => ({ method: normalizeMethod(p.method), amount: getAmount(p), reference: p.reference || '' })) : [{ method: paymentMode, amount: receivedAmount || totalAmount, reference: '' }], [payments, paymentMode, receivedAmount, totalAmount]);
  const items = useMemo(() => {
    const source = Array.isArray(session?.mergedItems) ? session.mergedItems : (Array.isArray(session?.items) ? session.items : []);
    return source.map(i => ({ name: i.name || i.item_name || '', qty: Number(i.qty || i.quantity || 1), rate: Number(i.unitPrice || i.price || 0), amount: Number(i.totalPrice || i.item_total || 0) }));
  }, [session]);
  const upiAmount = paymentLines.filter(p => p.method === 'UPI').reduce((s, p) => s + p.amount, 0);

  useEffect(() => {
    if (!upiAmount || !franchiseId) { setUpiQr(null); return; }
    expiryRef.current = Date.now() + 600000; setUpiSecsLeft(600);
    fetch(`${API}/public/upi-qr/${franchiseId}?amount=${upiAmount.toFixed(2)}&sessionId=${session?._id || ''}&tokenNumber=${tokenNumber}&mobile=${customerMobile}`)
      .then(r => r.json()).then(d => { if (d.success && d.qr) setUpiQr(d); }).catch(() => {});
    const iv = setInterval(() => { const left = Math.max(0, Math.ceil((expiryRef.current - Date.now()) / 1000)); setUpiSecsLeft(left); if (!left) clearInterval(iv); }, 1000);
    return () => clearInterval(iv);
  }, [API, franchiseId, upiAmount, session?._id, tokenNumber, customerMobile]);

  const cols = width <= 58 ? 32 : width <= 80 ? 42 : 56;
  const px = Math.round(width / 25.4 * 96);
  const fs = width <= 58 ? '8px' : '9px';
  const divider = '─'.repeat(cols);
  const print = () => { const s = document.createElement('style'); s.id = 'thermal-css'; s.textContent = `@page{size:${width}mm auto;margin:0}@media print{body>*{display:none!important}#thermal-print-area{display:block!important;position:absolute;left:0;top:0;width:${width}mm;color:#000;background:#fff}}`; document.head.appendChild(s); window.print(); setTimeout(() => document.getElementById('thermal-css')?.remove(), 1200); };
  const whatsapp = () => {
    const phone = customerMobile.replace(/\D/g, ''); if (phone.length < 10) return alert('No mobile number on this bill');
    const lines = items.map(i => `• ${i.name} x${i.qty} = ${money(i.amount)}`).join('\n');
    const msg = [`🧾 *${franchise?.name || 'UTC Café'}*`, `Token: #${tokenNumber || '-'}`, `Table: ${tableNumber}`, '', '*Items:*', lines, '', `Total: *${money(totalAmount)}*`, `Payment: ${paymentMode}`, '', 'Thank you for visiting! 🙏'].join('\n');
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };
  const Row = ({ label, value, bold = false }) => <div style={{ display:'flex', justifyContent:'space-between', gap:8, fontWeight:bold?700:400 }}><span>{label}</span><span>{value}</span></div>;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden">
      <div className="no-print flex items-center justify-between gap-2 p-3 border-b bg-gray-50">
        <div><div className="font-bold text-gray-900">Thermal Invoice Preview</div><div className="text-xs text-gray-500">Cash / UPI / Card / Split / Loyalty</div></div>
        <div className="flex gap-2">
          <button onClick={()=>setShowConfig(v=>!v)} className="px-3 py-2 rounded-xl border text-gray-700 text-sm"><Settings size={15}/></button>
          <button onClick={print} className="px-3 py-2 rounded-xl bg-black text-white text-sm"><Printer size={15}/> Print</button>
          <button onClick={whatsapp} className="px-3 py-2 rounded-xl bg-green-600 text-white text-sm"><MessageCircle size={15}/> WhatsApp</button>
          <button onClick={onClose} className="w-10 rounded-xl bg-gray-100 text-gray-700"><X size={16}/></button>
        </div>
      </div>
      {showConfig && <div className="no-print px-4 py-3 border-b flex gap-2">{WIDTHS.map(w=><button key={w.value} onClick={()=>setWidth(w.value)} className={`px-3 py-1.5 rounded-lg border text-sm ${width===w.value?'bg-black text-white':'text-gray-700'}`}>{w.label}</button>)}<Download size={14} className="ml-auto text-gray-400"/></div>}
      <div className="max-h-[85vh] overflow-auto bg-gray-100 p-4"><div className="mx-auto w-fit bg-white shadow-sm">
        <div id="thermal-print-area" style={{fontFamily:'Courier New,monospace',fontSize:fs,lineHeight:1.3,color:'#000',background:'#fff',width:px,maxWidth:px,padding:4,boxSizing:'border-box'}}>
          <div style={{textAlign:'center'}}><strong style={{fontSize:width<=58?12:14}}>{franchise?.name || 'UTC CAFE'}</strong><div>{franchise?.address || ''}</div><div>GSTIN: {franchise?.gstin || ''}</div></div>
          <div>{divider}</div>
          <div>Date: {new Date().toLocaleString('en-IN')}<br/>Invoice: {invoiceNo}<br/>Token: #{tokenNumber || '-'}<br/>Table: {tableNumber}<br/>Customer: {customerName || 'Walk-In'}{customerMobile ? ` · ${customerMobile}` : ''}</div>
          <div>{divider}</div>
          <div style={{fontWeight:700}}>ITEM&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;QTY&nbsp;&nbsp;AMOUNT</div>
          {items.map((i,n)=><div key={n} style={{display:'flex',justifyContent:'space-between',gap:4}}><span style={{flex:1}}>{i.name}</span><span>{i.qty}</span><span>{money(i.amount)}</span></div>)}
          <div>{divider}</div>
          <Row label="Subtotal:" value={money(taxableAmount)}/><Row label="CGST:" value={money(cgst)}/><Row label="SGST:" value={money(sgst)}/>{discountAmount>0&&<Row label="Discount:" value={`-${money(discountAmount)}`}/>}<Row label="Total Tax:" value={money(totalTax)}/><Row label="Total Payable:" value={money(totalAmount)} bold/>
          <div>{divider}</div><div style={{textAlign:'center',fontWeight:700}}>PAYMENT BREAKDOWN</div>
          {paymentLines.map((p,i)=><div key={i}><Row label={paymentLabel(p.method)} value={money(p.amount)}/>{p.reference&&<Row label="Ref:" value={p.reference}/>}</div>)}
          <Row label="Total Amount Paid:" value={money(paymentLines.reduce((s,p)=>s+p.amount,0))} bold/>
          {upiAmount>0&&<div style={{textAlign:'center',marginTop:4}}><div>SCAN TO PAY (UPI)</div>{upiQr&&upiSecsLeft>0?<><img src={upiQr.qr} alt="UPI QR" style={{width:78,height:78}}/><div>Merchant UPI: {upiQr.upiId || upiQr.upi_id || ''}</div></>:<div>QR EXPIRED</div>}</div>}
          <div>{divider}</div><div style={{textAlign:'center'}}>Thank you for visiting!<br/>UTC Café</div>
        </div>
      </div></div>
    </div>
  </div>;
}