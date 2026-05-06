import { useEffect, useState, useCallback } from 'react';
import { Search, Plus, Minus, Trash2, User, Phone, Star, CreditCard, Banknote, Smartphone, ChevronRight, CheckCircle, Coffee, LogOut, X, Printer } from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import { joinPOSRoom } from '../../lib/socket';
import { getSocket } from '../../lib/socket';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const CATEGORIES = ['All', 'Beverages', 'Snacks', 'Meals', 'Desserts', 'Breads', 'Specials', 'Add-ons'];
const CATEGORY_ICONS = { Beverages: '☕', Snacks: '🍟', Meals: '🍽️', Desserts: '🍰', Breads: '🥐', Specials: '⭐', 'Add-ons': '➕', All: '🍴' };

const POINTS_PER_RUPEE = 0.1;
const RUPEES_PER_POINT = 0.1;

export default function POSScreen() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const franchiseId = (user?.franchise_id?._id || user?.franchise_id)?.toString();

  // Menu state
  const [menuItems, setMenuItems] = useState([]);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [menuLoading, setMenuLoading] = useState(true);

  // Customer state
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [recentOrders, setRecentOrders] = useState([]);

  // Cart
  const [cart, setCart] = useState([]);

  // Loyalty
  const [redeemPoints, setRedeemPoints] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);

  // Payment
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [step, setStep] = useState('menu'); // 'menu' | 'payment' | 'success'
  const [orderResult, setOrderResult] = useState(null);
  const [placing, setPlacing] = useState(false);

  // Socket for order updates
  useEffect(() => {
    if (franchiseId) {
      joinPOSRoom(franchiseId);
      const socket = getSocket();
      socket.on('order:statusUpdate', (data) => {
        toast(`Order #${data.orderNumber}: ${data.status}`, { icon: '🔔' });
      });
      return () => socket.off('order:statusUpdate');
    }
  }, [franchiseId]);

  // Keep POS availability in sync when owner/manager marks items out of stock.
  useEffect(() => {
    if (!franchiseId) return undefined;
    const socket = getSocket();

    const handleMenuAvailability = ({ itemId, isEnabled, item }) => {
      setMenuItems((prev) => {
        if (isEnabled) {
          const exists = prev.some((menuItem) => menuItem._id === itemId);
          return exists ? prev.map((menuItem) => menuItem._id === itemId ? item : menuItem) : [...prev, item];
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

  // Load menu
  useEffect(() => {
    const load = async () => {
      setMenuLoading(true);
      const res = await api.get(`/menu?franchiseId=${franchiseId}`);
      setMenuItems(res.data.items);
      setMenuLoading(false);
    };
    load();
  }, [franchiseId]);

  // Customer phone lookup
  const lookupCustomer = useCallback(async () => {
    if (phone.length < 10) return;
    setCustomerLoading(true);
    try {
      const res = await api.get(`/customers/lookup?phone=${phone}`);
      if (res.data.customer) {
        setCustomer(res.data.customer);
        setRecentOrders(res.data.recentOrders || []);
        setIsNewCustomer(false);
        setNewCustName('');
      } else {
        setCustomer(null);
        setRecentOrders([]);
        setIsNewCustomer(true);
      }
    } catch { toast.error('Lookup failed'); }
    setCustomerLoading(false);
  }, [phone]);

  useEffect(() => {
    if (phone.length === 10) lookupCustomer();
    else { setCustomer(null); setRecentOrders([]); setIsNewCustomer(false); }
  }, [phone]);

  // Cart operations
  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item_id === item._id);
      if (existing) return prev.map((c) => c.item_id === item._id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { item_id: item._id, name: item.name, price: item.price, gst_rate: item.gst_rate, hsn_code: item.hsn_code, quantity: 1, image: item.image?.url, isVeg: item.isVeg }];
    });
  };

  const updateQty = (itemId, delta) => {
    setCart((prev) => prev.map((c) => c.item_id === itemId ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c).filter((c) => c.quantity > 0));
  };

  const removeItem = (itemId) => setCart((prev) => prev.filter((c) => c.item_id !== itemId));

  const clearCart = () => {
    setCart([]);
    setCustomer(null);
    setRecentOrders([]);
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

  // Calculations
  const subTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const taxTotal = cart.reduce((s, i) => {
    const itemTax = (i.price * i.quantity * i.gst_rate) / 100;
    return s + itemTax;
  }, 0);
  const grossTotal = subTotal + taxTotal;
  const maxRedeemPoints = customer?.total_points || 0;
  const redeemDiscount = redeemPoints ? +(pointsToRedeem * RUPEES_PER_POINT).toFixed(2) : 0;
  const finalAmount = Math.max(0, +(grossTotal - redeemDiscount).toFixed(2));
  const pointsToEarn = Math.floor(finalAmount * POINTS_PER_RUPEE);

  // Filter menu
  const filteredMenu = menuItems.filter((i) => {
    const matchCat = category === 'All' || i.category === category;
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const getCartQty = (id) => cart.find((c) => c.item_id === id)?.quantity || 0;

  // Place order
  const placeOrder = async () => {
    if (!customer && !isNewCustomer) { toast.error('Add customer first'); return; }
    if (cart.length === 0) { toast.error('Add items to cart'); return; }
    setPlacing(true);
    try {
      let customerId = customer?._id;
      // Create new customer if needed
      if (isNewCustomer) {
        if (!newCustName.trim()) { toast.error('Enter customer name'); setPlacing(false); return; }
        const res = await api.post('/customers', { phone_no: phone, name: newCustName });
        customerId = res.data.customer._id;
      }
      const res = await api.post('/orders', {
        customer_id: customerId,
        items: cart.map((c) => ({ item_id: c.item_id, quantity: c.quantity })),
        payment_mode: paymentMode,
        points_to_redeem: redeemPoints ? pointsToRedeem : 0,
      });
      setOrderResult(res.data);
      setStep('success');
      toast.success(`Order ${res.data.order.order_number} placed!`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Order failed');
    }
    setPlacing(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (step === 'success' && orderResult) {
    const { order, invoice, customer: updatedCustomer } = orderResult;
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center p-6">
        <div className="card max-w-md w-full p-8 text-center animate-slide-up">
          <div className="w-16 h-16 bg-green-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-400" />
          </div>
          <h2 className="font-display text-2xl font-bold text-white mb-1">Order Placed!</h2>
          <p className="text-gray-500 text-sm mb-6">Kitchen has been notified</p>

          <div className="bg-dark-700 rounded-xl p-4 text-left space-y-2 mb-6">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Order #</span><span className="font-mono text-brand-400">{order.order_number}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Token</span><span className="font-bold text-white text-lg">#{order.token_number}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Invoice</span><span className="font-mono text-sm text-gray-300">{invoice.invoice_no}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Payment</span><span className="text-green-400">{order.payment_mode}</span></div>
            <div className="border-t border-dark-500 pt-2 mt-2">
              <div className="flex justify-between"><span className="text-gray-500">Amount Paid</span><span className="font-bold text-green-400 text-lg">₹{order.final_amount?.toFixed(2)}</span></div>
            </div>
          </div>

          {updatedCustomer && (
            <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-3 mb-6 flex items-center gap-3">
              <Star size={18} className="text-yellow-400 flex-shrink-0" />
              <div className="text-sm text-left">
                <div className="text-gray-400">{order.points_earned} pts earned · Total: <span className="text-white font-semibold">{updatedCustomer.total_points} pts</span></div>
                <div className="text-xs text-gray-600">Worth ₹{(updatedCustomer.total_points * RUPEES_PER_POINT).toFixed(2)}</div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={clearCart} className="btn-primary flex-1">New Order</button>
            <button onClick={() => openReceipt(invoice._id)} className="btn-ghost flex items-center gap-2 px-4">
              <Printer size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      {/* POS Header */}
      <header className="h-14 bg-dark-800 border-b border-dark-600 flex items-center px-5 gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <Coffee size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white leading-tight">UTC Café — POS</div>
            <div className="text-[10px] text-gray-600">{user?.franchise_id?.name}</div>
          </div>
        </div>
        <div className="flex-1" />
        <div className="text-xs text-gray-600">{user?.name}</div>
        <button onClick={() => { logout(); navigate('/login'); }}
          className="text-gray-500 hover:text-red-400 transition-colors p-1">
          <LogOut size={16} />
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT: Menu ───────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Customer lookup bar */}
          <div className="bg-dark-800 border-b border-dark-600 px-5 py-3 flex items-center gap-3">
            <Phone size={16} className="text-gray-500 flex-shrink-0" />
            <input
              className="input flex-1 py-2 text-sm"
              placeholder="Enter customer phone number..."
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              maxLength={10}
            />
            {customerLoading && <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />}
            {customer && (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-1.5 text-sm">
                <User size={14} className="text-green-400" />
                <span className="text-green-400 font-medium">{customer.name}</span>
                <span className="text-gray-500 flex items-center gap-1"><Star size={11} className="text-yellow-400" />{customer.total_points} pts</span>
              </div>
            )}
            {isNewCustomer && phone.length === 10 && (
              <div className="flex items-center gap-2">
                <input
                  className="input py-2 text-sm w-44"
                  placeholder="New customer name..."
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                />
              </div>
            )}
          </div>

          {customer && recentOrders.length > 0 && (
            <div className="bg-dark-800 border-b border-dark-600 px-5 py-2 flex gap-2 overflow-x-auto text-xs">
              <span className="text-gray-600 flex-shrink-0">Customer history:</span>
              {recentOrders.slice(0, 5).map((order) => (
                <span key={order._id} className="badge bg-dark-700 text-gray-400 border-dark-500 flex-shrink-0">
                  {order.order_number} · Rs.{Number(order.final_amount || 0).toFixed(0)}
                </span>
              ))}
            </div>
          )}

          {/* Category tabs */}
          <div className="bg-dark-800 border-b border-dark-600 px-5 py-2 flex gap-2 overflow-x-auto scrollbar-hide">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCategory(c)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${category === c ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-500 hover:text-white hover:bg-dark-600'}`}>
                <span>{CATEGORY_ICONS[c]}</span>{c}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="px-5 py-3 bg-dark-900">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input className="input pl-9 py-2 text-sm" placeholder="Search menu..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          {/* Menu grid */}
          <div className="flex-1 overflow-y-auto px-5 pb-5">
            {menuLoading ? (
              <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filteredMenu.map((item) => {
                  const qty = getCartQty(item._id);
                  return (
                    <button
                      key={item._id}
                      onClick={() => addToCart(item)}
                      className={`card-hover text-left overflow-hidden transition-all duration-150 active:scale-95 ${qty > 0 ? 'border-brand-500/50 glow-orange' : ''}`}
                    >
                      <div className="h-28 bg-dark-700 relative overflow-hidden">
                        {item.image?.url ? (
                          <img src={item.image.url} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-3xl">{CATEGORY_ICONS[item.category] || '🍽️'}</div>
                        )}
                        <div className="absolute top-1.5 left-1.5">
                          <div className={`w-4 h-4 rounded border-2 ${item.isVeg ? 'border-green-500 bg-green-500/20' : 'border-red-500 bg-red-500/20'} flex items-center justify-center`}>
                            <div className={`w-2 h-2 rounded-full ${item.isVeg ? 'bg-green-500' : 'bg-red-500'}`} />
                          </div>
                        </div>
                        {qty > 0 && (
                          <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg">
                            {qty}
                          </div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <div className="text-xs font-medium text-white leading-tight mb-1 line-clamp-2">{item.name}</div>
                        <div className="flex items-center justify-between">
                          <span className="text-brand-400 font-bold font-mono text-sm">₹{item.price}</span>
                          <span className="text-[10px] text-gray-600">{item.gst_rate}% GST</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {!filteredMenu.length && (
                  <div className="col-span-full text-center py-12 text-gray-600 text-sm">No items found</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Bill sidebar ──────────────────────────────────────────── */}
        <div className="w-80 xl:w-96 bg-dark-800 border-l border-dark-600 flex flex-col flex-shrink-0">
          {/* Cart header */}
          <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
            <h2 className="font-display font-bold text-white">Current Bill</h2>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-600 text-sm gap-2">
                <Coffee size={28} className="text-gray-700" />
                <span>No items added</span>
              </div>
            ) : (
              <div className="divide-y divide-dark-600">
                {cart.map((item) => (
                  <div key={item.item_id} className="px-5 py-3 flex items-center gap-3 bill-item">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{item.name}</div>
                      <div className="text-xs text-gray-600">₹{item.price} × {item.quantity}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQty(item.item_id, -1)} className="w-6 h-6 bg-dark-600 hover:bg-dark-500 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                        <Minus size={12} />
                      </button>
                      <span className="text-sm font-bold text-white w-4 text-center">{item.quantity}</span>
                      <button onClick={() => updateQty(item.item_id, 1)} className="w-6 h-6 bg-brand-500/20 hover:bg-brand-500/40 rounded-full flex items-center justify-center text-brand-400 transition-colors">
                        <Plus size={12} />
                      </button>
                    </div>
                    <div className="text-sm font-mono font-semibold text-white w-16 text-right">
                      ₹{(item.price * item.quantity).toFixed(2)}
                    </div>
                    <button onClick={() => removeItem(item.item_id)} className="text-gray-700 hover:text-red-400 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bill summary */}
          {cart.length > 0 && (
            <div className="border-t border-dark-600">
              <div className="px-5 py-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Sub Total</span>
                  <span className="font-mono">₹{subTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>GST</span>
                  <span className="font-mono">₹{taxTotal.toFixed(2)}</span>
                </div>

                {/* Loyalty redemption */}
                {customer && customer.total_points > 0 && (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={redeemPoints} onChange={(e) => { setRedeemPoints(e.target.checked); if (!e.target.checked) setPointsToRedeem(0); }}
                        className="w-4 h-4 accent-yellow-400" />
                      <Star size={14} className="text-yellow-400" />
                      <span className="text-xs text-yellow-400 font-medium">Redeem Loyalty Points</span>
                    </label>
                    {redeemPoints && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={maxRedeemPoints}
                          value={pointsToRedeem}
                          onChange={(e) => setPointsToRedeem(Math.min(Number(e.target.value), maxRedeemPoints))}
                          className="input py-1.5 text-xs flex-1"
                          placeholder={`Max: ${maxRedeemPoints} pts`}
                        />
                        <span className="text-xs text-gray-500">= ₹{redeemDiscount.toFixed(2)} off</span>
                      </div>
                    )}
                    <div className="text-xs text-gray-600">Available: {customer.total_points} pts = ₹{(customer.total_points * RUPEES_PER_POINT).toFixed(2)}</div>
                  </div>
                )}

                {redeemDiscount > 0 && (
                  <div className="flex justify-between text-green-400">
                    <span>Points Discount</span>
                    <span className="font-mono">-₹{redeemDiscount.toFixed(2)}</span>
                  </div>
                )}

                <div className="border-t border-dark-600 pt-2 flex justify-between">
                  <span className="font-semibold text-white">Total</span>
                  <span className="font-bold text-xl font-mono text-brand-400">₹{finalAmount.toFixed(2)}</span>
                </div>

                {pointsToEarn > 0 && (
                  <div className="text-xs text-gray-600 flex items-center gap-1">
                    <Star size={11} className="text-yellow-400" />
                    Will earn {pointsToEarn} points after payment
                  </div>
                )}
              </div>

              {/* Payment mode */}
              <div className="px-5 pb-3">
                <div className="text-xs text-gray-500 mb-2">Payment Mode</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { mode: 'Cash', icon: Banknote },
                    { mode: 'Card', icon: CreditCard },
                    { mode: 'UPI', icon: Smartphone },
                  ].map(({ mode, icon: Icon }) => (
                    <button
                      key={mode}
                      onClick={() => setPaymentMode(mode)}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium border transition-all ${paymentMode === mode ? 'bg-brand-500/20 border-brand-500 text-brand-400' : 'bg-dark-700 border-dark-500 text-gray-500 hover:text-white'}`}
                    >
                      <Icon size={16} />
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Place order */}
              <div className="px-5 pb-5">
                <button
                  onClick={placeOrder}
                  disabled={placing || !cart.length || (!customer && !isNewCustomer)}
                  className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20"
                >
                  {placing ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><ChevronRight size={20} /> Place Order · ₹{finalAmount.toFixed(2)}</>
                  )}
                </button>
                {!customer && !isNewCustomer && (
                  <p className="text-xs text-gray-600 text-center mt-1.5">Enter customer phone to proceed</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
