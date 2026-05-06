import { useEffect, useState } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  User,
  Phone,
  Star,
  CreditCard,
  Banknote,
  Smartphone,
  ChevronRight,
  CheckCircle,
  Coffee,
  Printer,
  Download,
  Receipt,
  History,
  CalendarDays,
  IndianRupee,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import { getSocket, joinPOSRoom } from '../../lib/socket';

const CATEGORIES = ['All', 'Beverages', 'Snacks', 'Meals', 'Desserts', 'Breads', 'Specials', 'Add-ons'];
const CATEGORY_ICONS = {
  Beverages: 'C',
  Snacks: 'S',
  Meals: 'M',
  Desserts: 'D',
  Breads: 'B',
  Specials: '*',
  'Add-ons': '+',
  All: 'A',
};

const POINTS_PER_RUPEE = 0.1;
const RUPEES_PER_POINT = 0.1;

const emptyInsights = {
  last30DayVisits: 0,
  last30DayOrders: 0,
  last30DaySpent: 0,
  totalSpent: 0,
  purchaseHistory: [],
  previousBills: [],
  activityHistory: [],
};

const formatMoney = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;

const downloadBlob = (data, type, filename) => {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export default function POSScreen({ mode = 'billing', embedded = false }) {
  const { user } = useAuthStore();
  const franchiseId = (user?.franchise_id?._id || user?.franchise_id)?.toString();
  const isHistoryMode = mode === 'history';

  const [menuItems, setMenuItems] = useState([]);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [menuLoading, setMenuLoading] = useState(true);

  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [recentOrders, setRecentOrders] = useState([]);
  const [customerInsights, setCustomerInsights] = useState(emptyInsights);

  const [historySearch, setHistorySearch] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState(null);
  const [historyInsights, setHistoryInsights] = useState(emptyInsights);

  const [cart, setCart] = useState([]);
  const [redeemPoints, setRedeemPoints] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [step, setStep] = useState('menu');
  const [orderResult, setOrderResult] = useState(null);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (!franchiseId) return undefined;
    joinPOSRoom(franchiseId);
    const socket = getSocket();

    const handleStatusUpdate = (data) => {
      toast(`Order #${data.orderNumber}: ${data.status}`);
    };

    socket.on('order:statusUpdate', handleStatusUpdate);
    return () => socket.off('order:statusUpdate', handleStatusUpdate);
  }, [franchiseId]);

  useEffect(() => {
    if (!franchiseId) return undefined;
    const socket = getSocket();

    const handleMenuAvailability = ({ itemId, isEnabled, item }) => {
      setMenuItems((prev) => {
        if (isEnabled) {
          const exists = prev.some((menuItem) => menuItem._id === itemId);
          return exists
            ? prev.map((menuItem) => (menuItem._id === itemId ? item : menuItem))
            : [...prev, item];
        }
        return prev.filter((menuItem) => menuItem._id !== itemId);
      });

      if (!isEnabled) {
        setCart((prev) => prev.filter((cartItem) => cartItem.item_id !== itemId));
      }

      toast(isEnabled ? `${item?.name || 'Item'} is back in stock` : `${item?.name || 'Item'} marked out of stock`);
    };

    socket.on('menu:availability', handleMenuAvailability);
    return () => socket.off('menu:availability', handleMenuAvailability);
  }, [franchiseId]);

  useEffect(() => {
    if (!franchiseId || isHistoryMode) return undefined;

    const loadMenu = async () => {
      try {
        setMenuLoading(true);
        const res = await api.get(`/menu?franchiseId=${franchiseId}`);
        setMenuItems(res.data.items || []);
      } catch {
        toast.error('Failed to load menu');
      } finally {
        setMenuLoading(false);
      }
    };

    loadMenu();
    return undefined;
  }, [franchiseId, isHistoryMode]);

  const applyLookupPayload = (payload, target = 'billing') => {
    const insights = payload.customerInsights || emptyInsights;

    if (target === 'history') {
      setHistoryCustomer(payload.customer || null);
      setHistoryInsights(insights);
      return;
    }

    if (payload.customer) {
      setCustomer(payload.customer);
      setRecentOrders(payload.recentOrders || []);
      setCustomerInsights(insights);
      setIsNewCustomer(false);
      setNewCustName('');
    } else {
      setCustomer(null);
      setRecentOrders([]);
      setCustomerInsights(emptyInsights);
      setIsNewCustomer(Boolean(payload.isNew));
    }
  };

  const lookupCustomerByPhone = async (value, target = 'billing') => {
    if (value.length < 10) {
      if (target === 'history') {
        setHistoryCustomer(null);
        setHistoryInsights(emptyInsights);
      } else {
        setCustomer(null);
        setRecentOrders([]);
        setCustomerInsights(emptyInsights);
        setIsNewCustomer(false);
      }
      return;
    }

    if (target === 'history') setHistoryLoading(true);
    else setCustomerLoading(true);

    try {
      const res = await api.get(`/customers/lookup?phone=${value}`);
      applyLookupPayload(res.data, target);
    } catch {
      toast.error('Customer lookup failed');
    } finally {
      if (target === 'history') setHistoryLoading(false);
      else setCustomerLoading(false);
    }
  };

  useEffect(() => {
    if (!isHistoryMode) {
      lookupCustomerByPhone(phone, 'billing');
    }
  }, [phone, isHistoryMode]);

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((entry) => entry.item_id === item._id);
      if (existing) {
        return prev.map((entry) => (
          entry.item_id === item._id ? { ...entry, quantity: entry.quantity + 1 } : entry
        ));
      }

      return [
        ...prev,
        {
          item_id: item._id,
          name: item.name,
          price: item.price,
          gst_rate: item.gst_rate,
          hsn_code: item.hsn_code,
          quantity: 1,
          image: item.image?.url,
          isVeg: item.isVeg,
        },
      ];
    });
  };

  const updateQty = (itemId, delta) => {
    setCart((prev) => (
      prev
        .map((item) => (item.item_id === itemId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
        .filter((item) => item.quantity > 0)
    ));
  };

  const removeItem = (itemId) => setCart((prev) => prev.filter((item) => item.item_id !== itemId));

  const clearCart = () => {
    setCart([]);
    setCustomer(null);
    setRecentOrders([]);
    setCustomerInsights(emptyInsights);
    setPhone('');
    setNewCustName('');
    setIsNewCustomer(false);
    setRedeemPoints(false);
    setPointsToRedeem(0);
    setPaymentMode('Cash');
    setStep('menu');
    setOrderResult(null);
  };

  const openReceipt = async (invoiceId) => {
    const res = await api.get(`/invoices/${invoiceId}/receipt`, { responseType: 'text' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const downloadReceiptPdf = async (invoiceId, invoiceNo) => {
    const res = await api.get(`/invoices/${invoiceId}/pdf`, { responseType: 'blob' });
    downloadBlob(res.data, 'application/pdf', `${invoiceNo || 'invoice'}.pdf`);
  };

  const subTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const taxTotal = cart.reduce((sum, item) => sum + ((item.price * item.quantity * item.gst_rate) / 100), 0);
  const grossTotal = subTotal + taxTotal;
  const maxRedeemPoints = customer?.total_points || 0;
  const redeemDiscount = redeemPoints ? +(pointsToRedeem * RUPEES_PER_POINT).toFixed(2) : 0;
  const finalAmount = Math.max(0, +(grossTotal - redeemDiscount).toFixed(2));
  const pointsToEarn = Math.floor(finalAmount * POINTS_PER_RUPEE);

  const filteredMenu = menuItems.filter((item) => {
    const matchCategory = category === 'All' || item.category === category;
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  const getCartQty = (id) => cart.find((item) => item.item_id === id)?.quantity || 0;

  const placeOrder = async () => {
    if (!customer && !isNewCustomer) {
      toast.error('Add customer first');
      return;
    }
    if (!cart.length) {
      toast.error('Add items to cart');
      return;
    }

    setPlacing(true);
    try {
      let customerId = customer?._id;

      if (isNewCustomer) {
        if (!newCustName.trim()) {
          toast.error('Enter customer name');
          setPlacing(false);
          return;
        }
        const createRes = await api.post('/customers', { phone_no: phone, name: newCustName });
        customerId = createRes.data.customer._id;
      }

      const res = await api.post('/orders', {
        customer_id: customerId,
        items: cart.map((item) => ({ item_id: item.item_id, quantity: item.quantity })),
        payment_mode: paymentMode,
        points_to_redeem: redeemPoints ? pointsToRedeem : 0,
      });

      setOrderResult(res.data);
      setStep('success');
      toast.success(`Order ${res.data.order.order_number} placed`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Order failed');
    } finally {
      setPlacing(false);
    }
  };

  const historyPhone = historySearch.trim().replace(/\D/g, '').slice(0, 10);
  const showShellHeader = !embedded;

  const renderInsights = (insights, activeCustomer, compact = false) => (
    <div className="space-y-4">
      <div className={`grid gap-3 ${compact ? 'md:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">30 Day Visits</div>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-2xl font-bold text-white">{insights.last30DayVisits}</span>
            <span className="text-xs text-gray-600">days with orders</span>
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">30 Day Orders</div>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-2xl font-bold text-white">{insights.last30DayOrders}</span>
            <span className="text-xs text-gray-600">bills raised</span>
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">30 Day Spend</div>
          <div className="mt-2 text-2xl font-bold text-brand-400">{formatMoney(insights.last30DaySpent)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Lifetime Spend</div>
          <div className="mt-2 text-2xl font-bold text-green-400">{formatMoney(insights.totalSpent || activeCustomer?.total_spent)}</div>
        </div>
      </div>

      <div className={`grid gap-4 ${compact ? 'xl:grid-cols-2' : 'xl:grid-cols-[1.2fr,0.8fr]'}`}>
        <div className="card overflow-hidden">
          <div className="border-b border-dark-600 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Coffee size={16} className="text-brand-400" />
              Purchase History
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {insights.purchaseHistory.length ? insights.purchaseHistory.map((item) => (
              <div key={item.name} className="flex items-center justify-between border-b border-dark-600 px-4 py-3 text-sm last:border-b-0">
                <div>
                  <div className="font-medium text-white">{item.name}</div>
                  <div className="text-xs text-gray-600">{item.quantity} qty across {item.orders} orders</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-brand-400">{formatMoney(item.amount)}</div>
                  <div className="text-xs text-gray-600">{item.lastPurchasedAt ? format(new Date(item.lastPurchasedAt), 'dd MMM') : ''}</div>
                </div>
              </div>
            )) : (
              <div className="px-4 py-8 text-sm text-gray-600">No purchase history yet.</div>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-dark-600 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <History size={16} className="text-brand-400" />
              Customer Activity
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {insights.activityHistory.length ? insights.activityHistory.map((entry) => (
              <div key={entry.id} className="border-b border-dark-600 px-4 py-3 text-sm last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-white">{entry.title}</div>
                  <div className="text-xs text-gray-600">{entry.date ? format(new Date(entry.date), 'dd MMM, hh:mm a') : ''}</div>
                </div>
                <div className="mt-1 text-xs text-gray-500">{entry.description}</div>
              </div>
            )) : (
              <div className="px-4 py-8 text-sm text-gray-600">No activity history found.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderPreviousBills = (insights, emptyLabel = 'No previous bills found.') => (
    <div className="card overflow-hidden">
      <div className="border-b border-dark-600 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Receipt size={16} className="text-brand-400" />
          Previous Bills
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-dark-700/50">
            <tr>
              {['Invoice', 'Date', 'Amount', 'Payment', 'Actions'].map((heading) => (
                <th key={heading} className="table-head">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {insights.previousBills.length ? insights.previousBills.map((bill) => (
              <tr key={bill._id} className="table-row">
                <td className="table-cell font-mono text-brand-400 text-xs">{bill.invoice_no}</td>
                <td className="table-cell text-sm text-gray-300">{bill.invoice_date ? format(new Date(bill.invoice_date), 'dd MMM yyyy, hh:mm a') : ''}</td>
                <td className="table-cell font-semibold text-green-400">{formatMoney(bill.final_amount)}</td>
                <td className="table-cell">
                  <span className="badge bg-dark-700 text-gray-300 border border-dark-500">{bill.payment_mode || 'NA'}</span>
                </td>
                <td className="table-cell">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openReceipt(bill._id)} className="btn-ghost px-3 py-2 text-xs flex items-center gap-2">
                      <Printer size={14} />
                      Reprint
                    </button>
                    <button onClick={() => downloadReceiptPdf(bill._id, bill.invoice_no)} className="btn-ghost px-3 py-2 text-xs flex items-center gap-2">
                      <Download size={14} />
                      PDF
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-600">{emptyLabel}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (step === 'success' && orderResult) {
    const { order, invoice, customer: updatedCustomer } = orderResult;

    return (
      <div className={`${embedded ? '' : 'min-h-screen'} flex items-center justify-center`}>
        <div className="card w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15">
            <CheckCircle size={32} className="text-green-400" />
          </div>
          <h2 className="font-display text-2xl font-bold text-white">Order Placed</h2>
          <p className="mb-6 mt-1 text-sm text-gray-500">Kitchen has been notified.</p>

          <div className="mb-6 space-y-2 rounded-xl bg-dark-700 p-4 text-left">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Order #</span><span className="font-mono text-brand-400">{order.order_number}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Token</span><span className="text-lg font-bold text-white">#{order.token_number}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Invoice</span><span className="font-mono text-gray-300">{invoice.invoice_no}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Payment</span><span className="text-green-400">{order.payment_mode}</span></div>
            <div className="border-t border-dark-500 pt-2">
              <div className="flex justify-between"><span className="text-gray-500">Amount Paid</span><span className="text-lg font-bold text-green-400">{formatMoney(order.final_amount)}</span></div>
            </div>
          </div>

          {updatedCustomer ? (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-brand-500/20 bg-brand-500/10 p-3">
              <Star size={18} className="text-yellow-400 flex-shrink-0" />
              <div className="text-left text-sm">
                <div className="text-gray-400">
                  {order.points_earned} pts earned · Total: <span className="font-semibold text-white">{updatedCustomer.total_points} pts</span>
                </div>
                <div className="text-xs text-gray-600">Worth {formatMoney(updatedCustomer.total_points * RUPEES_PER_POINT)}</div>
              </div>
            </div>
          ) : null}

          <div className="flex gap-3">
            <button onClick={clearCart} className="btn-primary flex-1">New Order</button>
            <button onClick={() => openReceipt(invoice._id)} className="btn-ghost px-4 flex items-center gap-2">
              <Printer size={16} />
            </button>
            <button onClick={() => downloadReceiptPdf(invoice._id, invoice.invoice_no)} className="btn-ghost px-4 flex items-center gap-2">
              <Download size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isHistoryMode) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="section-title">Order History</h1>
            <p className="mt-1 text-sm text-gray-500">Search by customer mobile number to reprint or download past bills.</p>
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                className="input pl-9"
                placeholder="Enter 10-digit mobile number"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value.replace(/\D/g, '').slice(0, 10))}
                maxLength={10}
              />
            </div>
            <button
              onClick={() => lookupCustomerByPhone(historyPhone, 'history')}
              disabled={historyPhone.length < 10 || historyLoading}
              className="btn-primary flex items-center justify-center gap-2 px-5"
            >
              {historyLoading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
              Search Bills
            </button>
          </div>
        </div>

        {historyCustomer ? (
          <div className="space-y-6">
            <div className="card p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-white">
                    <User size={16} className="text-brand-400" />
                    <span className="text-lg font-semibold">{historyCustomer.name}</span>
                  </div>
                  <div className="mt-1 text-sm text-gray-500">{historyCustomer.phone_no}</div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <span className="badge border border-brand-500/20 bg-brand-500/15 text-brand-400">{historyCustomer.total_orders} orders</span>
                  <span className="badge border border-yellow-500/20 bg-yellow-500/10 text-yellow-400">{historyCustomer.total_points} pts</span>
                </div>
              </div>
            </div>

            {renderInsights(historyInsights, historyCustomer)}
            {renderPreviousBills(historyInsights)}
          </div>
        ) : (
          <div className="card px-6 py-14 text-center text-sm text-gray-600">
            Enter a customer mobile number to view previous bills, activity, and spending history.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${showShellHeader ? 'min-h-screen bg-dark-900' : ''}`}>
      {showShellHeader ? (
        <div className="flex items-center justify-between border-b border-dark-600 bg-dark-800 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500">
              <Coffee size={18} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">UTC Cafe POS</div>
              <div className="text-xs text-gray-600">{user?.franchise_id?.name}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.4fr,0.95fr]">
        <div className="min-w-0 space-y-4">
          <div className="card overflow-hidden">
            <div className="border-b border-dark-600 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <div className="relative flex-1">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    className="input pl-9 py-2 text-sm"
                    placeholder="Enter customer mobile number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    maxLength={10}
                  />
                </div>

                {customerLoading ? (
                  <div className="flex h-10 w-10 items-center justify-center">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                  </div>
                ) : null}

                {customer ? (
                  <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-2 text-sm">
                    <User size={14} className="text-green-400" />
                    <span className="font-medium text-green-400">{customer.name}</span>
                    <span className="flex items-center gap-1 text-gray-500">
                      <Star size={11} className="text-yellow-400" />
                      {customer.total_points} pts
                    </span>
                  </div>
                ) : null}

                {isNewCustomer && phone.length === 10 ? (
                  <input
                    className="input w-full py-2 text-sm xl:w-56"
                    placeholder="New customer name"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                  />
                ) : null}
              </div>

              {customer ? (
                <div className="mt-4">
                  {renderInsights(customerInsights, customer, true)}
                </div>
              ) : null}

              {customer && recentOrders.length ? (
                <div className="mt-4 flex gap-2 overflow-x-auto text-xs">
                  <span className="flex-shrink-0 text-gray-600">Recent orders:</span>
                  {recentOrders.slice(0, 5).map((order) => (
                    <span key={order._id} className="badge flex-shrink-0 border border-dark-500 bg-dark-700 text-gray-400">
                      {order.order_number} · {formatMoney(order.final_amount)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="border-b border-dark-600 px-4 py-3 sm:px-5">
              <div className="flex gap-2 overflow-x-auto">
                {CATEGORIES.map((item) => (
                  <button
                    key={item}
                    onClick={() => setCategory(item)}
                    className={[
                      'flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                      category === item ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-500 hover:bg-dark-600 hover:text-white',
                    ].join(' ')}
                  >
                    <span className="mr-1">{CATEGORY_ICONS[item]}</span>
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-4 py-3 sm:px-5">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                <input
                  className="input pl-9 py-2 text-sm"
                  placeholder="Search menu"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              {menuLoading ? (
                <div className="flex justify-center py-16">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
                  {filteredMenu.map((item) => {
                    const qty = getCartQty(item._id);
                    return (
                      <button
                        key={item._id}
                        onClick={() => addToCart(item)}
                        className={`card-hover overflow-hidden text-left active:scale-95 ${qty > 0 ? 'border-brand-500/50 glow-orange' : ''}`}
                      >
                        <div className="relative h-28 overflow-hidden bg-dark-700">
                          {item.image?.url ? (
                            <img src={item.image.url} alt={item.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-3xl text-gray-500">{CATEGORY_ICONS[item.category] || 'M'}</div>
                          )}
                          <div className="absolute left-1.5 top-1.5">
                            <div className={`flex h-4 w-4 items-center justify-center rounded border-2 ${item.isVeg ? 'border-green-500 bg-green-500/20' : 'border-red-500 bg-red-500/20'}`}>
                              <div className={`h-2 w-2 rounded-full ${item.isVeg ? 'bg-green-500' : 'bg-red-500'}`} />
                            </div>
                          </div>
                          {qty > 0 ? (
                            <div className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                              {qty}
                            </div>
                          ) : null}
                        </div>
                        <div className="p-3">
                          <div className="mb-1 line-clamp-2 text-xs font-medium leading-tight text-white">{item.name}</div>
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-sm font-bold text-brand-400">{formatMoney(item.price)}</span>
                            <span className="text-[10px] text-gray-600">{item.gst_rate}% GST</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {!filteredMenu.length ? (
                    <div className="col-span-full py-12 text-center text-sm text-gray-600">No items found.</div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {customer ? renderPreviousBills(customerInsights, 'No bills found for this customer yet.') : null}
        </div>

        <div className="min-w-0">
          <div className="card flex h-full flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-dark-600 px-5 py-4">
              <h2 className="font-display font-bold text-white">Current Bill</h2>
              {cart.length ? (
                <button onClick={clearCart} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300">
                  <Trash2 size={12} />
                  Clear
                </button>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto">
              {cart.length ? (
                <div className="divide-y divide-dark-600">
                  {cart.map((item) => (
                    <div key={item.item_id} className="bill-item flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-white">{item.name}</div>
                        <div className="text-xs text-gray-600">{formatMoney(item.price)} x {item.quantity}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQty(item.item_id, -1)} className="flex h-6 w-6 items-center justify-center rounded-full bg-dark-600 text-gray-400 transition-colors hover:bg-dark-500 hover:text-white">
                          <Minus size={12} />
                        </button>
                        <span className="w-4 text-center text-sm font-bold text-white">{item.quantity}</span>
                        <button onClick={() => updateQty(item.item_id, 1)} className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/20 text-brand-400 transition-colors hover:bg-brand-500/40">
                          <Plus size={12} />
                        </button>
                      </div>
                      <div className="w-20 text-right text-sm font-semibold text-white">{formatMoney(item.price * item.quantity)}</div>
                      <button onClick={() => removeItem(item.item_id)} className="text-gray-700 transition-colors hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-44 flex-col items-center justify-center gap-2 text-sm text-gray-600">
                  <Coffee size={28} className="text-gray-700" />
                  <span>No items added.</span>
                </div>
              )}
            </div>

            {cart.length ? (
              <div className="border-t border-dark-600">
                <div className="space-y-2 px-5 py-4 text-sm">
                  <div className="flex justify-between text-gray-500"><span>Sub Total</span><span className="font-mono">{formatMoney(subTotal)}</span></div>
                  <div className="flex justify-between text-gray-500"><span>GST</span><span className="font-mono">{formatMoney(taxTotal)}</span></div>

                  {customer && customer.total_points > 0 ? (
                    <div className="space-y-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={redeemPoints}
                          onChange={(e) => {
                            setRedeemPoints(e.target.checked);
                            if (!e.target.checked) setPointsToRedeem(0);
                          }}
                          className="h-4 w-4 accent-yellow-400"
                        />
                        <Star size={14} className="text-yellow-400" />
                        <span className="text-xs font-medium text-yellow-400">Redeem Loyalty Points</span>
                      </label>
                      {redeemPoints ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={maxRedeemPoints}
                            value={pointsToRedeem}
                            onChange={(e) => setPointsToRedeem(Math.min(Number(e.target.value), maxRedeemPoints))}
                            className="input flex-1 py-1.5 text-xs"
                            placeholder={`Max: ${maxRedeemPoints} pts`}
                          />
                          <span className="text-xs text-gray-500">{formatMoney(redeemDiscount)} off</span>
                        </div>
                      ) : null}
                      <div className="text-xs text-gray-600">Available: {customer.total_points} pts = {formatMoney(customer.total_points * RUPEES_PER_POINT)}</div>
                    </div>
                  ) : null}

                  {redeemDiscount > 0 ? (
                    <div className="flex justify-between text-green-400"><span>Points Discount</span><span className="font-mono">-{formatMoney(redeemDiscount)}</span></div>
                  ) : null}

                  <div className="flex justify-between border-t border-dark-600 pt-2">
                    <span className="font-semibold text-white">Total</span>
                    <span className="font-mono text-xl font-bold text-brand-400">{formatMoney(finalAmount)}</span>
                  </div>

                  {pointsToEarn > 0 ? (
                    <div className="flex items-center gap-1 text-xs text-gray-600">
                      <Star size={11} className="text-yellow-400" />
                      Will earn {pointsToEarn} points after payment
                    </div>
                  ) : null}
                </div>

                <div className="px-5 pb-3">
                  <div className="mb-2 text-xs text-gray-500">Payment Mode</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { mode: 'Cash', icon: Banknote },
                      { mode: 'Card', icon: CreditCard },
                      { mode: 'UPI', icon: Smartphone },
                    ].map(({ mode: payment, icon: Icon }) => (
                      <button
                        key={payment}
                        onClick={() => setPaymentMode(payment)}
                        className={[
                          'flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-medium transition-all',
                          paymentMode === payment
                            ? 'border-brand-500 bg-brand-500/20 text-brand-400'
                            : 'border-dark-500 bg-dark-700 text-gray-500 hover:text-white',
                        ].join(' ')}
                      >
                        <Icon size={16} />
                        {payment}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-5 pb-5">
                  <button
                    onClick={placeOrder}
                    disabled={placing || !cart.length || (!customer && !isNewCustomer)}
                    className="btn-primary flex w-full items-center justify-center gap-2 py-3.5 text-base shadow-lg shadow-brand-500/20"
                  >
                    {placing ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <>
                        <ChevronRight size={20} />
                        Place Order · {formatMoney(finalAmount)}
                      </>
                    )}
                  </button>
                  {!customer && !isNewCustomer ? (
                    <p className="mt-1.5 text-center text-xs text-gray-600">Enter customer phone to proceed.</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
