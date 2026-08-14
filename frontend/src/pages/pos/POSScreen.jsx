import { useEffect, useState, useCallback, useRef, useMemo, useTransition, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, MapPin, UtensilsCrossed, CheckSquare, PauseCircle,
  Package, BarChart2, Settings, LogOut, Search, Plus, Minus, X,
  ChevronRight, RefreshCw, Check, Coffee, Receipt, Send, ArrowLeft,
  Trash2, Printer, Phone, Star, User, Bell, Clock, IndianRupee,
  ChevronDown, AlertCircle, MessageSquare, Mail, Wallet,
  CreditCard, Smartphone,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import { getSocket, joinPOSRoom, joinFranchiseRoom } from '../../lib/socket';
import { playNewOrderSound, playOrderAcceptedSound } from '../../lib/audioNotify';
import useNotificationStore, { NOTIF_LABELS } from '../../store/notificationStore';
import QRPaymentModal from '../../components/pos/QRPaymentModal';
import SplitPaymentModal from '../../components/pos/SplitPaymentModal';
import EditPinModal from '../../components/pos/EditPinModal';

// ── Inline SVG cart icon (avoids lucide-react ShoppingCart import conflict) ──
function ShoppingCart({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}

// ─── status config ───────────────────────────────────────────────
const TS = {
  available:     { border:'border-gray-500',   bg:'bg-[#1e1e1e]',       text:'text-white',       dot:'bg-green-500',  label:'Available' },
  occupied:      { border:'border-red-600',    bg:'bg-red-900/30',      text:'text-white',       dot:'bg-red-500',    label:'Occupied'  },
  reserved:      { border:'border-amber-500',  bg:'bg-amber-900/20',    text:'text-white',       dot:'bg-amber-500',  label:'Reserved'  },
  bill_pending:  { border:'border-yellow-500', bg:'bg-yellow-900/20',   text:'text-yellow-300',  dot:'bg-yellow-400', label:'Bill Due'  },
  needs_cleaning:{ border:'border-gray-600',   bg:'bg-gray-800/30',     text:'text-gray-300',    dot:'bg-gray-500',   label:'Cleaning'  },
};
const tsCfg = (s) => TS[s] || TS.available;
const fmt = (n) => `₹${(+(n||0)).toFixed(2)}`;
const fmtShort = (n) => `₹${(+(n||0)).toLocaleString('en-IN')}`;

// ─── TablePickerModal (for customer ID screen) ────────────────────
function TablePickerModal({ onClose, onSelect }) {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const load = useCallback(async (silent=false) => {
    try { silent ? setSpinning(true) : setLoading(true);
      const r = await api.get('/tables/map'); setTables(r.data.tables || []);
    } catch {} finally { setLoading(false); setSpinning(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{
    const s = getSocket(); if(!s) return;
    const h = ({tableId,status}) => setTables(p=>p.map(t=>t._id?.toString()===tableId?.toString()?{...t,status}:t));
    s.on('table:statusUpdated',h); return ()=>s.off('table:statusUpdated',h);
  },[]);
  const avail = tables.filter(t=>t.status==='available');
  const occ   = tables.filter(t=>t.status!=='available');
  const next  = avail.length>0 ? avail.reduce((a,b)=>a.tableNumber<b.tableNumber?a:b) : null;
  const lbl   = s=>({occupied:'Occupied',reserved:'Reserved',bill_pending:'Bill Due',held:'On Hold',needs_cleaning:'Cleaning'}[s]||s);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#1c1c1c] border border-[#2e2e2e] shadow-2xl flex flex-col" style={{maxHeight:'82vh'}}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e2e2e]">
          <div>
            <h2 className="text-white font-bold text-base">Select Table</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2 h-2 rounded-full bg-green-500"/>Available <strong className="text-green-400">{avail.length}</strong></span>
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2 h-2 rounded-full bg-red-500"/>Occupied <strong className="text-red-400">{occ.length}</strong></span>
              <span className="text-xs text-gray-600">|</span>
              <span className="text-xs text-gray-400">Total <strong className="text-white">{tables.length}</strong></span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={()=>load(true)} className={`w-8 h-8 flex items-center justify-center rounded-full bg-[#2a2a2a] text-gray-400 hover:text-white transition-colors ${spinning?'animate-spin':''}`}><RefreshCw size={14}/></button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2a2a2a] text-gray-400 hover:text-white hover:bg-[#333]"><X size={15}/></button>
          </div>
        </div>
        {next && !loading && (
          <div onClick={()=>onSelect(next)} className="mx-4 mt-3 flex items-center justify-between px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/30 cursor-pointer hover:bg-green-500/20 transition-colors">
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/><span className="text-xs text-green-300 font-semibold">Suggested: Table {next.tableNumber}</span><span className="text-[10px] text-gray-500">({next.capacity} seats)</span></div>
            <span className="text-[10px] text-green-500 font-bold uppercase tracking-wide">Tap →</span>
          </div>
        )}
        <div className="overflow-y-auto flex-1 p-4 pt-3">
          {loading ? <div className="grid grid-cols-4 gap-3">{[...Array(8)].map((_,i)=><div key={i} className="h-24 rounded-xl bg-[#252525] animate-pulse"/>)}</div>
          : tables.length===0 ? <div className="text-center py-10 text-gray-500 text-sm">No tables configured.</div>
          : (
            <div className="grid grid-cols-4 gap-3">
              {tables.map(t=>{const a=t.status==='available'; return (
                <button key={t._id} onClick={()=>a&&onSelect(t)} disabled={!a} title={a?`Table ${t.tableNumber}`:`${t.tableNumber} — ${lbl(t.status)}`}
                  className={`relative flex flex-col items-center justify-center gap-1 rounded-xl border-2 py-3 px-2 transition-all duration-200 ${a?'border-green-500/60 bg-green-500/10 hover:bg-green-500/20 hover:border-green-400 hover:scale-105 cursor-pointer':'border-red-500/50 bg-red-900/20 cursor-not-allowed'}`}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className={a?'text-green-400':'text-red-400'}><path d="M5 9h14M5 9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2M5 9v10m14-10v10M5 19H3m2 0h14m0 0h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                  <span className={`font-black text-sm leading-none ${a?'text-white':'text-gray-300'}`}>T{t.tableNumber}</span>
                  <span className={`text-[10px] font-semibold ${a?'text-green-400':'text-red-400'}`}>{a?`${t.capacity} Seats`:lbl(t.status)}</span>
                  {!a && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 animate-pulse"/>}
                  {a  && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-green-400"/>}
                </button>
              );})}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-[#2e2e2e]">
          <div className="text-[10px] text-gray-500">Select an available table to begin a dine-in order</div>
          <button onClick={onClose} className="px-5 py-2 rounded-xl bg-[#2a2a2a] text-gray-300 text-sm font-semibold hover:bg-[#353535] transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
export default function POSScreen() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  // ── nav ────────────────────────────────────────────────────────
  const [screen, setScreen] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ── tables ─────────────────────────────────────────────────────
  const [tables, setTables]         = useState([]);
  const [tableSearch, setTableSearch] = useState('');
  const [tableTab, setTableTab]       = useState('dineIn');

  // ── current flow ───────────────────────────────────────────────
  const [selectedTable, setSelectedTable]     = useState(null);
  const [isParcel, setIsParcel]               = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [activeSession, setActiveSession]     = useState(null);

  // ── customer ───────────────────────────────────────────────────
  const [phone, setPhone]               = useState('');
  const [customer, setCustomer]         = useState(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustName, setNewCustName]   = useState('');
  const [customerType, setCustomerType] = useState('Single');
  const [custLoading, setCustLoading]   = useState(false);

  // ── menu ───────────────────────────────────────────────────────
  const [menuItems, setMenuItems]   = useState([]);
  const [menuSearch, setMenuSearch] = useState('');
  const [activeCat, setActiveCat]   = useState('All');
  const [cart, setCart]             = useState([]);
  const [specialNote, setSpecialNote] = useState('');

  // ── running order (add to existing) ───────────────────────────
  const [runningTab, setRunningTab]           = useState('add'); // 'add' | 'view'
  const [pendingDeleteItem, setPendingDeleteItem] = useState(null); // {itemId, sessionItemId, name}
  const [showDeletePin, setShowDeletePin]         = useState(false);

  // ── hold orders ────────────────────────────────────────────────
  const [heldOrders, setHeldOrders]     = useState([]);
  const [heldFilter, setHeldFilter]     = useState('all');
  const [heldSearch, setHeldSearch]     = useState('');

  const [expandedOrder, setExpandedOrder] = useState(null);
  const [orderHistory, setOrderHistory]   = useState([]);
  const [orderHistorySearch, setOrderHistorySearch] = useState('');
  const [orderHistoryFilter, setOrderHistoryFilter] = useState('all');
  const [orderHistoryLoading, setOrderHistoryLoading] = useState(false);
  const [franchiseInfo, setFranchiseInfo] = useState(null); // parcel/sitting picker

  // ── pending approvals ──────────────────────────────────────────
  const [pendingOrders, setPendingOrders] = useState([]);
  const [pendingFilter, setPendingFilter] = useState('all');

  // ── parcels ────────────────────────────────────────────────────
  const [parcelOrders, setParcelOrders] = useState([]);
  const [parcelTab, setParcelTab]       = useState('preparing');
  // ── independent parcel flow state ─────────────────────────────
  const [parcelPhone, setParcelPhone]   = useState('');
  const [parcelCustomer, setParcelCustomer] = useState(null);
  const [parcelCustName, setParcelCustName] = useState('');
  const [parcelCart, setParcelCart]     = useState([]);
  const [parcelNote, setParcelNote]     = useState('');
  const [parcelFlowScreen, setParcelFlowScreen] = useState('list'); // list | mobile | menu | cart
  const [parcelCustLoading, setParcelCustLoading] = useState(false);

  // ── billing ────────────────────────────────────────────────────
  const [paymentMode, setPaymentMode]   = useState('Cash');
  const [receivedAmt, setReceivedAmt]   = useState('');
  const [paymentRef, setPaymentRef]     = useState('');
  const [discount, setDiscount]         = useState(0);
  const [invoice, setInvoice]           = useState(null);
  const [runningInvoice, setRunningInvoice] = useState(null);
  const [invoicePaymentLoading, setInvoicePaymentLoading] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  // ── coupon ─────────────────────────────────────────────────────
  const [couponInput, setCouponInput]   = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null); // { code, discountAmount }
  const [couponLoading, setCouponLoading] = useState(false);

  // ── dashboard stats ────────────────────────────────────────────
  const [stats, setStats]           = useState({ totalOrders:0, pendingApprovals:0, heldOrders:0, parcels:0, completedOrders:0, todaySales:0, yesterdaySales:0 });
  const [recentActivity, setRecentActivity] = useState([]);
  const [notifBadge, setNotifBadge] = useState(0);
  // notifications come from global store (written by AppLayout on order:ready)
  const { notifications: notifs, unreadCount, markRead, removeNotification, clearAll } = useNotificationStore();
  // low-priority transitions — stats/activity updates won't block user interactions
  const [, startStatsTransition] = useTransition();

  // ── master admin has no fixed franchise_id (it's null by design — see User model) ──
  // so it must explicitly pick which franchise's POS/menu it's operating on, same
  // pattern used across MasterCustomersPage / FastMovingItemsPage / etc.
  const isMasterAdmin = user?.role === 'master_admin';
  const [franchiseList, setFranchiseList] = useState([]);
  const [selectedFranchiseId, setSelectedFranchiseId] = useState('');
  useEffect(() => {
    if (!isMasterAdmin) return;
    api.get('/franchises').then(r => {
      const list = r.data?.data || r.data?.franchises || (Array.isArray(r.data) ? r.data : []);
      setFranchiseList(list);
      setSelectedFranchiseId(prev => prev || list[0]?._id || '');
    }).catch(() => {});
  }, [isMasterAdmin]);

  // always extract the plain ID string — franchise_id may be a populated object
  const franchiseId = isMasterAdmin
    ? selectedFranchiseId
    : (user?.franchise_id?._id || user?.franchise_id)?.toString();

  // ── derived cart values ────────────────────────────────────────
  const subtotal  = cart.reduce((s,c) => s + c.price * c.qty, 0);
  // Items already sent/saved in the active session
  const prevItems = activeSession?.subOrders?.flatMap(o => o.items || []) || [];
  const gst       = cart.reduce((s,c) => s + c.price * c.qty * (c.gst_rate||5) / 100, 0);
  const total     = subtotal + gst;
  const cartCount = cart.reduce((s,c) => s + c.qty, 0);

  // ── load tables ────────────────────────────────────────────────
  const loadTables = useCallback(async () => {
    try { const r = await api.get('/tables/map'); setTables(r.data.tables||[]); } catch {}
  },[]);

  // ── load menu ──────────────────────────────────────────────────
  const loadMenu = useCallback(async () => {
    if (!franchiseId) { console.warn('[loadMenu] franchiseId not yet available'); return; }
    try {
      const r = await api.get(`/menu?franchiseId=${franchiseId}&limit=300`);
      const raw = r.data?.items || r.data?.menuItems || r.data?.data || (Array.isArray(r.data) ? r.data : []);
      console.log(`[loadMenu] protected endpoint: ${raw.length} items`);
      setMenuItems(raw);
    } catch(err) {
      const code = err.response?.data?.code;
      const status = err.response?.status;
      console.warn(`[loadMenu] protected failed (${status} ${code}), trying public endpoint`);
      // Fallback: public menu endpoint (no franchise guard)
      try {
        const r2 = await api.get(`/public/menu/${franchiseId}`);
        const raw2 = r2.data?.items || r2.data?.menuItems || (Array.isArray(r2.data) ? r2.data : []);
        console.log(`[loadMenu] public endpoint: ${raw2.length} items`);
        setMenuItems(raw2);
        if (raw2.length === 0) toast.error('Menu loaded but no items found. Add items in Master Admin.');
      } catch(err2) {
        console.error('[loadMenu] both endpoints failed:', err2.response?.data?.message || err2.message);
        toast.error(err?.response?.data?.message || 'Menu failed to load. Check franchise status in Master Admin.');
      }
    }
  }, [franchiseId]);

  // ── load stats ─────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const [held, pend, sessions] = await Promise.allSettled([
        api.get('/sessions/held'),
        api.get('/waiter/pending-sessions'),
        api.get('/sessions?status=open,bill_pending,paid&limit=50'),
      ]);
      const heldArr  = held.status==='fulfilled'  ? (held.value.data.sessions||[])   : [];
      const pendArr  = pend.status==='fulfilled'  ? (pend.value.data.sessions||[])   : [];
      const sessArr  = sessions.status==='fulfilled' ? (sessions.value.data.sessions||[]) : [];

      const today = new Date(); today.setHours(0,0,0,0);
      const todaySess  = sessArr.filter(s=>new Date(s.openedAt||s.createdAt)>=today);
      const todaySales = todaySess.filter(s=>s.status==='paid').reduce((sum,s)=>sum+(s.totalAmount||0),0);
      const parcelSess = heldArr.filter(s=>s.orderType==='parcel'||s.isParcel);

      // store all today's sessions for Orders History screen
      setOrderHistory(sessArr.slice().sort((a,b)=>new Date(b.openedAt||b.createdAt)-new Date(a.openedAt||a.createdAt)));

      // urgent — badge + pending list affect critical UX
      setNotifBadge(pendArr.length);
      setPendingOrders(pendArr);
      setHeldOrders(heldArr);
      setParcelOrders(parcelSess);

      // non-urgent — stats panel + activity can update at low priority
      // so they never block table clicks or menu interactions
      startStatsTransition(() => {
        setStats({
          totalOrders:      todaySess.length,
          pendingApprovals: pendArr.length,
          heldOrders:       heldArr.length,
          parcels:          parcelSess.length,
          completedOrders:  todaySess.filter(s=>s.status==='paid').length,
          todaySales,
          yesterdaySales:   todaySales * 0.87,
        });
        setRecentActivity(todaySess.slice(0,5).map(s=>({
          id:s._id, type:'order',
          text:`Order #${s.tokenNumber||s._id?.slice(-4)} — ${s.tableNumber||'Parcel'}`,
          time: format(new Date(s.openedAt||s.createdAt),'hh:mm a'),
          color: s.status==='paid'?'text-green-400':s.status==='open'?'text-orange-400':'text-yellow-400',
        })));
      });
    } catch {}
  },[]);

  useEffect(() => { loadTables(); loadMenu(); loadStats(); }, [loadTables, loadMenu, loadStats]);

  // ── Auto-refresh table statuses every 60 s (UI only) ──────────
  useEffect(() => {
    const iv = setInterval(() => { loadTables(); loadStats(); }, 60_000);
    return () => clearInterval(iv);
  }, [loadTables, loadStats]);

  // ── Trigger server-side stale session cleanup every 1 hour ─────
  useEffect(() => {
    api.post('/sessions/admin/expire-stale').catch(() => {}); // once on load
    const iv = setInterval(() => {
      api.post('/sessions/admin/expire-stale').catch(() => {});
    }, 60 * 60_000); // every 1 hour
    return () => clearInterval(iv);
  }, []);

  // ── socket ─────────────────────────────────────────────────────
  useEffect(() => {
    if(!franchiseId) return;
    joinPOSRoom(franchiseId); joinFranchiseRoom(franchiseId);
    const socket = getSocket(); if(!socket) return;

    const speak = (text) => {
      try {
        if (!window.speechSynthesis) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1;
        utterance.volume = 1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch {}
    };

    socket.on('table:statusUpdated', (payload) => {
      const { tableId, status, sessionCleared } = payload;
      setTables(p => p.map(t => {
        if (t._id?.toString() !== tableId?.toString()) return t;
        return {
          ...t,
          status,
          currentSessionId: sessionCleared ? null : t.currentSessionId,
        };
      }));
      if (sessionCleared) loadTables();
    });

    socket.on('waiter:order_placed', () => {
      setNotifBadge((b) => b + 1);
      loadStats();
      playNewOrderSound();
    });

    socket.on('waiter:cancel_requested', () => {
      setNotifBadge((b) => b + 1);
      loadStats();
    });

    socket.on('waiter:bill_requested', (data) => {
      setNotifBadge((b) => b + 1);
      loadStats();
      const tableLabel = data?.tableNumber ? `Table ${data.tableNumber}` : 'a table';
      toast.success(`Bill requested for ${tableLabel}`);
      speak(`Bill requested for ${tableLabel}. Please generate the bill.`);
      playNewOrderSound();
    });

    socket.on('waiter:order_approved', (data) => {
      setNotifBadge((b) => b + 1);
      loadStats();
      toast.success(data?.message || 'Approved by waiter');
      speak(`${data?.message || 'Approved by waiter'} for ${data?.tableNumber ? `table ${data.tableNumber}` : 'the current table'}.`);
      playNewOrderSound();
    });

    socket.on('session:paid', () => { loadStats(); loadTables(); });
    socket.on('order:new',    () => { loadStats(); });
    socket.on('order:accepted', () => { playOrderAcceptedSound(); });
    socket.on('order:statusUpdate', () => { loadStats(); });
    socket.on('menu:availability', () => { loadMenu(); });
    socket.on('menu:globalUpdate', () => { loadMenu(); });

    return () => {
      socket.off('table:statusUpdated');
      socket.off('waiter:order_placed');
      socket.off('waiter:cancel_requested');
      socket.off('waiter:bill_requested');
      socket.off('waiter:order_approved');
      socket.off('session:paid');
      socket.off('order:new');
      socket.off('order:accepted');
      socket.off('order:statusUpdate');
      socket.off('menu:availability');
      socket.off('menu:globalUpdate');
    };
  },[franchiseId, loadStats, loadTables]);

  // ── customer lookup ────────────────────────────────────────────
  const loadOrderHistory = useCallback(async () => {
    if (!franchiseId) return;
    setOrderHistoryLoading(true);
    try {
      const r = await api.get('/sessions?status=open,bill_pending,paid,on_hold&limit=100');
      const sessions = (r.data.sessions || []).sort(
        (a, b) => new Date(b.openedAt || b.createdAt) - new Date(a.openedAt || a.createdAt)
      );
      setOrderHistory(sessions);
    } catch { /* silent */ }
    setOrderHistoryLoading(false);
  }, [franchiseId]);

  // load order history when Orders screen is opened — MUST be after loadOrderHistory declaration
  useEffect(() => { if (screen === 'orders') loadOrderHistory(); }, [screen, loadOrderHistory]);

  const lookupCustomer = useCallback(async (val) => {
    if(val.length<10) { setCustomer(null); setIsNewCustomer(false); return; }
    setCustLoading(true);
    try {
      const r = await api.get(`/customers/lookup?phone=${val}`);
      if(r.data.customer) { setCustomer(r.data.customer); setIsNewCustomer(false); }
      else { setCustomer(null); setIsNewCustomer(true); }
    } catch { setIsNewCustomer(true); }
    finally { setCustLoading(false); }
  },[]);
  useEffect(() => { lookupCustomer(phone); },[phone, lookupCustomer]);

  // ── cart helpers ───────────────────────────────────────────────
  const addItem = (item) => setCart(p=>{
    const ex=p.find(c=>c._id===item._id);
    return ex ? p.map(c=>c._id===item._id?{...c,qty:c.qty+1}:c) : [...p,{...item,qty:1}];
  });
  const setQty = (id,delta) => setCart(p=>p.map(c=>c._id===id?{...c,qty:Math.max(0,c.qty+delta)}:c).filter(c=>c.qty>0));
  // Workspace aliases
  const addToCart      = (item) => addItem(item);
  const removeFromCart = (id)   => setQty(id, -1);

  // ── table select → reserve ─────────────────────────────────────
  const handleTableSelect = async (table) => {
    try { await api.patch(`/tables/${table._id}/status`,{status:'reserved'}); } catch {}
    setSelectedTable({...table,status:'reserved'});
    setShowTablePicker(false);
    toast.success(`Table ${table.tableNumber} reserved`);
  };

  // ── start session (continue to menu) ──────────────────────────
  const startSession = async () => {
    if(!isParcel && !selectedTable) { toast.error('Select a table first'); return; }
    if(!phone || phone.length < 10) { toast.error('Mobile number is mandatory. Please enter a valid 10-digit mobile number.'); return; }
    try {
      let custId = customer?._id;
      if(!custId && isNewCustomer && phone) {
        const r = await api.post('/customers',{ name:newCustName||'Walk-in', phone_no:phone });
        custId = r.data.customer?._id;
      }
      const r = await api.post('/sessions/start',{
        tableId: isParcel?null:selectedTable?._id,
        tableNumber: isParcel?'Parcel':selectedTable?.tableNumber,
        mobile: phone,
        customerId: custId||undefined,
        customerName: customer?.name||newCustName||'Walk-in',
        isParcel,
        franchiseId,
      });
      setActiveSession(r.data.session);
      setActiveCat('All'); setRunningTab('add'); setScreen('workspace'); loadMenu();
      if(selectedTable && !isParcel) await api.patch(`/tables/${selectedTable._id}/status`,{status:'occupied'});
    } catch(e) { toast.error(e.response?.data?.message||'Failed to start session'); }
  };

  // ── save items only (no kitchen) — ADD ITEMS & SAVE ──────────
  const saveItemsOnly = async () => {
    if (!cart.length || !activeSession) { toast.error('Add items first'); return; }
    try {
      await api.post(`/sessions/${activeSession._id}/orders`, {
        items: cart.map(c => ({ menuItemId: c._id, qty: c.qty, name: c.name, price: c.price, gst_rate: c.gst_rate || 5 })),
        notes: specialNote,
        destination: 'none',  // saved to session, NOT sent to kitchen
      });
      toast.success('Items saved!');
      setCart([]); setSpecialNote('');
      const r = await api.get(`/sessions/${activeSession._id}`);
      setActiveSession(r.data.session || r.data);
      // Stay on the add-items (runningOrder) screen — item list refreshes
    } catch(e) { toast.error(e.response?.data?.message || 'Save failed'); }
  };

  // ── confirm & send saved items to kitchen ──────────────────────
  const confirmToKitchen = async () => {
    if (!activeSession) { toast.error('No active session'); return; }
    const unsent = activeSession.subOrders?.filter(o => !o.sentToKitchen);
    if (!unsent?.length && !cart.length) { toast.error('No items to send'); return; }
    try {
      // If there are items still in cart, save them first with kitchen destination
      if (cart.length) {
        await api.post(`/sessions/${activeSession._id}/orders`, {
          items: cart.map(c => ({ menuItemId: c._id, qty: c.qty, name: c.name, price: c.price, gst_rate: c.gst_rate || 5 })),
          notes: specialNote,
          destination: 'kitchen',
        });
      } else {
        // Re-send all unsent suborders to kitchen
        await api.post(`/sessions/${activeSession._id}/confirm-kitchen`);
      }
      toast.success('Order sent to kitchen!');
      setCart([]); setSpecialNote('');
      const r = await api.get(`/sessions/${activeSession._id}`);
      setActiveSession(r.data.session || r.data);
      // stays on workspace
    } catch(e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  // ── legacy alias (used by older buttons) ──────────────────────
  const addOrderToSession = confirmToKitchen;

  // ── apply coupon ───────────────────────────────────────────────
  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    try {
      const orderAmount = Math.max(0, +(billSubtotal + billGST).toFixed(2));
      const r = await api.post('/coupons/validate', {
        code: couponInput.trim(),
        orderAmount,
        franchiseId,
      });
      setAppliedCoupon({ code: r.data.coupon.code, discountAmount: r.data.discountAmount });
      setDiscount(r.data.discountAmount);
      toast.success(`Coupon applied! ₹${r.data.discountAmount} off`);
    } catch(e) {
      toast.error(e.response?.data?.message || 'Invalid coupon');
      setAppliedCoupon(null);
      setDiscount(0);
    } finally { setCouponLoading(false); }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setDiscount(0);
  };

  // ── generate bill ──────────────────────────────────────────────
  const generateBill = async () => {
    if (!activeSession) return;

    try {
      const r = await api.post(`/sessions/${activeSession._id}/bill`, {
        couponCode: appliedCoupon?.code || undefined,
      });

      const updatedSession = r.data.session || activeSession;
      const billTotal = updatedSession.totalAmount || r.data.invoice?.final_amount || 0;

      setRunningInvoice(r.data.invoice || r.data || null);
      setInvoice(r.data.invoice || null);
      setActiveSession(updatedSession);
      setScreen('invoice');

      // Keep the first payment method selected for the invoice screen.
      if (paymentMode === 'UPI' && !receivedAmt) {
        setReceivedAmt(String(billTotal.toFixed(2)));
      } else if (paymentMode !== 'Split' && !receivedAmt) {
        setReceivedAmt(String(billTotal.toFixed(2)));
      }

      loadStats();
      loadTables();
      toast.success('Bill generated');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Billing failed');
    }
  };

  const recordInvoicePayment = async () => {
    if (!activeSession) return;

    // UPI must show a scannable QR — don't record a blind payment.
    if (paymentMode === 'UPI') {
      setShowQRModal(true);
      return;
    }

    // Split needs its own multi-entry interface, not a single amount field.
    if (paymentMode === 'Split') {
      setShowSplitModal(true);
      return;
    }

    const amount = parseFloat(receivedAmt || '0');
    if (!amount || amount <= 0) {
      toast.error('Enter payment amount');
      return;
    }

    setInvoicePaymentLoading(true);
    try {
      const payRes = await api.post(`/sessions/${activeSession._id}/payment`, {
        method: paymentMode,
        amount,
        reference: paymentRef.trim(),
      });

      const paidSession = payRes.data.session || activeSession;
      setInvoice(payRes.data.invoice || invoice || runningInvoice || null);
      setActiveSession(paidSession);
      setRunningInvoice(payRes.data.invoice || runningInvoice || null);
      setReceivedAmt('');
      setPaymentRef('');
      loadStats();
      loadTables();

      // After a fully paid order, always return to the table map so the
      // operator can immediately select the next table. Partial payments
      // remain on the invoice screen.
      if (paidSession?.paymentStatus === 'fully_paid' || paidSession?.status === 'paid') {
        toast.success('Payment recorded');
        resetFlow();
        setScreen('dashboard');
      } else {
        toast.success('Payment recorded');
      }
    } catch (e) {
      toast.error(e.response?.data?.message || 'Payment failed');
    } finally {
      setInvoicePaymentLoading(false);
    }
  };

  const handlePrintInvoice = () => {
    const style = document.createElement('style');
    style.id = 'pos-unified-thermal-print';
    style.textContent = `
      @page { size: 80mm auto; margin: 0; }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        body * { visibility: hidden !important; }
        #pos-thermal-receipt, #pos-thermal-receipt * { visibility: visible !important; }
        #pos-thermal-receipt { position: absolute; left: 0; top: 0; width: 80mm; padding: 2mm 1.5mm !important; font-size: 9px !important; line-height: 1.15 !important; }
        #pos-thermal-receipt .print-spacer { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => document.getElementById('pos-unified-thermal-print')?.remove(), 1000);
  };

  // ── waiter: request table cancellation (no food ordered yet) ──
  const requestTableCancel = async () => {
    if (!activeSession) return;
    try {
      await api.post(`/waiter/sessions/${activeSession._id}/request-cancel`, { reason: 'Customer left before ordering' });
      toast.success('Cancellation request sent to POS operator for approval');
      resetFlow(); setScreen('dashboard'); loadStats();
    } catch(e) { toast.error(e.response?.data?.message || 'Cancel request failed'); }
  };

  // ── POS operator: approve waiter cancel request ─────────────────
  const approveCancelRequest = async (sessionId) => {
    try {
      await api.post(`/sessions/${sessionId}/approve-cancel`);
      toast.success('Cancellation approved. Table is now available.');
      loadStats(); loadTables();
    } catch(e) { toast.error(e.response?.data?.message || 'Approve failed'); }
  };

  // ── POS operator: reject waiter cancel request ──────────────────
  const rejectCancelRequest = async (sessionId) => {
    try {
      await api.post(`/sessions/${sessionId}/reject-cancel`);
      toast.success('Cancellation request rejected.');
      loadStats();
    } catch(e) { toast.error(e.response?.data?.message || 'Reject failed'); }
  };

  // ── parcel: lookup customer ────────────────────────────────────
  const lookupParcelCustomer = async (val) => {
    if (val.length < 10) { setParcelCustomer(null); return; }
    setParcelCustLoading(true);
    try {
      const r = await api.get(`/customers/lookup?phone=${val}`);
      setParcelCustomer(r.data.customer || null);
    } catch { setParcelCustomer(null); }
    finally { setParcelCustLoading(false); }
  };

  // ── parcel: add/remove item to parcel cart ──────────────────────
  const addToParcelCart = (item) => {
    setParcelCart(prev => {
      const ex = prev.find(c => c._id === item._id);
      if (ex) return prev.map(c => c._id === item._id ? {...c, qty: c.qty + 1} : c);
      return [...prev, {...item, qty: 1}];
    });
  };
  const removeFromParcelCart = (itemId) => {
    setParcelCart(prev => {
      const ex = prev.find(c => c._id === itemId);
      if (!ex) return prev;
      if (ex.qty <= 1) return prev.filter(c => c._id !== itemId);
      return prev.map(c => c._id === itemId ? {...c, qty: c.qty - 1} : c);
    });
  };

  // ── parcel: submit order ────────────────────────────────────────
  const submitParcelOrder = async () => {
    if (!parcelCart.length) { toast.error('Add items first'); return; }
    if (!parcelPhone || parcelPhone.length < 10) { toast.error('Mobile number is mandatory'); return; }
    try {
      // Create customer if new
      let custId = parcelCustomer?._id || null;
      if (!custId && parcelPhone) {
        const r = await api.post('/customers', { name: parcelCustName || 'Walk-in', phone_no: parcelPhone });
        custId = r.data.customer?._id;
      }
      // Start session as parcel
      const sessRes = await api.post('/sessions/start', {
        customerId:     custId,
        customerName:   parcelCustomer?.name || parcelCustName || 'Walk-in',
        customerMobile: parcelPhone,
        tableId:        null,
        tableNumber:    'Parcel',
        orderType:      'parcel',
        isParcel:       true,
        mobile:         parcelPhone,
      });
      const sess = sessRes.data.session;
      // Add items to session
      await api.post(`/sessions/${sess._id}/orders`, {
        items: parcelCart.map(c => ({ menuItemId: c._id, qty: c.qty, price: c.price, name: c.name })),
        notes: parcelNote,
      });
      toast.success(`Parcel order #${sess.tokenNumber} created!`);
      // Reset parcel flow
      setParcelCart([]); setParcelPhone(''); setParcelCustomer(null);
      setParcelCustName(''); setParcelNote(''); setParcelFlowScreen('list');
      loadStats();
    } catch(e) { toast.error(e.response?.data?.message || 'Parcel order failed'); }
  };

  // ── hold session ───────────────────────────────────────────────
  const holdSession = async () => {
    if(!activeSession) return;
    try {
      await api.post(`/sessions/${activeSession._id}/hold`,{note:'Held by POS operator'});
      toast.success('Order put on hold');
      resetFlow(); setScreen('dashboard'); loadStats();
    } catch(e) { toast.error(e.response?.data?.message||'Hold failed'); }
  };

  // ── resume held session ────────────────────────────────────────
  const resumeSession = async (sessionId) => {
    try {
      const r = await api.post(`/sessions/${sessionId}/resume`);
      setActiveSession(r.data.session||r.data);
      const sess = r.data.session||r.data;
      if(sess.tableId||sess.tableNumber) {
        const t = tables.find(t=>t.tableNumber===sess.tableNumber||t._id?.toString()===sess.tableId?.toString());
        if(t) setSelectedTable(t);
      }
      // ── BUG FIX: refresh held-orders list so a resumed session is removed
      // immediately — without this the stale entry stays, and a second click
      // hits the backend with status !== 'on_hold' → 400
      loadStats();
      setScreen('workspace');
    } catch(e) { toast.error(e.response?.data?.message||'Resume failed'); }
  };

  // ── approve waiter order ───────────────────────────────────────
  const approveWaiterOrder = async (sessionId) => {
    try {
      await api.post(`/waiter/sessions/${sessionId}/approve`);
      toast.success('Order approved & sent to kitchen');
      loadStats();
    } catch(e) { toast.error(e.response?.data?.message||'Approve failed'); }
  };

  const rejectWaiterOrder = async (sessionId) => {
    try {
      await api.post(`/waiter/sessions/${sessionId}/reject`,{reason:'Rejected by POS operator'});
      toast.success('Order rejected');
      loadStats();
    } catch(e) { toast.error(e.response?.data?.message||'Reject failed'); }
  };

  // ── Cancel Order: cancel session + free table ─────────────────
  const cancelOrder = async () => {
    if (!activeSession) return;
    if (!window.confirm('Cancel this order and free the table?')) return;
    try {
      await api.post(`/sessions/${activeSession._id}/cancel`, { reason: 'Cancelled by POS operator' });
      toast.success('Order cancelled. Table is now available.');
      resetFlow(); setScreen('dashboard'); loadStats(); loadTables();
    } catch(e) { toast.error(e.response?.data?.message || 'Cancel failed'); }
  };

  // ── Clear Order: wipe items but keep table occupied ────────────
  const clearOrder = async () => {
    if (!activeSession) return;
    if (!window.confirm('Clear all items from this order? Table stays occupied.')) return;
    try {
      const r = await api.post(`/sessions/${activeSession._id}/clear-items`);
      setActiveSession(r.data.session || activeSession);
      setCart([]);
      toast.success('Items cleared. Add new items to continue.');
    } catch(e) { toast.error(e.response?.data?.message || 'Clear failed'); }
  };

  // ── secure delete saved session item (PIN verified server-side) ──
  const initiateDeleteItem = (item) => {
    setPendingDeleteItem({ itemId: item._id?.toString(), name: item.name });
    setShowDeletePin(true);
  };

  const executeDeleteItem = async (pin) => {
    if (!pendingDeleteItem || !activeSession) return;
    setShowDeletePin(false);
    try {
      const r = await api.post(`/sessions/${activeSession._id}/remove-item`, {
        itemId: pendingDeleteItem.itemId,
        pin,
        reason: 'Manual void by POS operator',
      });
      toast.success(r.data.message || `${pendingDeleteItem.name} removed`);
      setActiveSession(r.data.session);
      // A delete from an unpaid bill_pending session invalidates the old bill snapshot.
      if (r.data.billInvalidated) {
        setRunningInvoice(null);
        setInvoice(null);
        setReceivedAmt('');
        setPaymentMode('Cash');
      }
    } catch(e) {
      toast.error(e.response?.data?.message || 'Delete failed');
    } finally {
      setPendingDeleteItem(null);
    }
  };

  // ── reset flow ─────────────────────────────────────────────────
  const resetFlow = () => {
    if(selectedTable?.status==='reserved') {
      api.patch(`/tables/${selectedTable._id}/status`,{status:'available'}).catch(()=>{});
    }
    setSelectedTable(null); setActiveSession(null); setPhone(''); setCustomer(null);
    setIsNewCustomer(false); setNewCustName(''); setCustomerType('Single');
    setCart([]); setSpecialNote(''); setIsParcel(false); setPaymentMode('Cash');
    setReceivedAmt(''); setPaymentRef(''); setDiscount(0); setInvoice(null); setRunningInvoice(null);
    setCouponInput(''); setAppliedCoupon(null);
    setShowTablePicker(false); setRunningTab('add');
  };

  // ── filtered menu ──────────────────────────────────────────────
  const [debouncedMenuSearch, setDebouncedMenuSearch] = useState('');
  const menuSearchTimer = useRef(null);
  const handleMenuSearchChange = (e) => {
    setMenuSearch(e.target.value);
    clearTimeout(menuSearchTimer.current);
    menuSearchTimer.current = setTimeout(() => setDebouncedMenuSearch(e.target.value), 250);
  };
  const menuCats = useMemo(() => ['All',...new Set(menuItems.map(i=>i.category).filter(Boolean))], [menuItems]);
  // Single unified menu filter — activeCat + menuSearch used everywhere
  const filteredMenu = useMemo(() => menuItems.filter(i => {
    const c = activeCat === 'All' || i.category === activeCat;
    const s = !debouncedMenuSearch || i.name?.toLowerCase().includes(debouncedMenuSearch.toLowerCase());
    const avail = i.availability !== false && i.available !== false && i.is_available !== false;
    return c && s && avail;
  }), [menuItems, activeCat, debouncedMenuSearch]);

  // runningFilteredMenu = same source, separate search state for running order
  const runningFilteredMenu = useMemo(() => menuItems.filter(i => {
    const c = activeCat === 'All' || i.category === activeCat;
    const s = !menuSearch || i.name?.toLowerCase().includes(menuSearch.toLowerCase());
    const avail = i.availability !== false && i.available !== false && i.is_available !== false;
    return c && s && avail;
  }), [menuItems, activeCat, menuSearch]);

  // ── filtered tables ────────────────────────────────────────────
  const filteredTables = useMemo(() => tables.filter(t=>!tableSearch||String(t.tableNumber).includes(tableSearch)), [tables, tableSearch]);
  const tCount = {
    available:tables.filter(t=>t.status==='available').length,
    occupied: tables.filter(t=>t.status==='occupied').length,
    reserved: tables.filter(t=>t.status==='reserved').length,
    cleaning: tables.filter(t=>t.status==='needs_cleaning').length,
  };

  // ── open occupied table → order workspace ───────────────────────
  const openOccupiedTable = async (t) => {
    // Clear any previous table's state before loading the new session
    setPhone(''); setCustomer(null); setActiveSession(null);
    setIsNewCustomer(false); setNewCustName(''); setCart([]);
    setSelectedTable(t);
    try {
      // Include on_hold and pending_cancel so sessions are never lost
      const r = await api.get('/sessions?status=open,bill_pending,on_hold,pending_cancel');
      const sess = (r.data.sessions||[]).find(s =>
        s.tableId?.toString() === t._id?.toString() ||
        s.tableNumber === t.tableNumber
      );
      if (sess) {
        setActiveSession(sess);
        // Restore full customer state — never prompt mobile again for active session
        const cust = sess.customerId && typeof sess.customerId === 'object' ? sess.customerId : null;
        if (cust) {
          setCustomer(cust);
          setPhone(sess.customerMobile || cust.phone_no || '');
        } else if (sess.customerMobile) {
          setPhone(sess.customerMobile);
          api.get(`/customers/lookup?phone=${sess.customerMobile}`)
            .then(r2 => { if (r2.data.customer) setCustomer(r2.data.customer); })
            .catch(() => {});
        }
        // Auto-resume on_hold sessions
        if (sess.status === 'on_hold') {
          try {
            const resumed = await api.post(`/sessions/${sess._id}/resume`);
            setActiveSession(resumed.data.session || sess);
          } catch {}
        }
        setActiveCat('All');
        setRunningTab('add');
        setScreen('workspace');
      } else {
        setScreen('customerID');
      }
    } catch { setScreen('customerID'); }
  };

  // ═══════════════════════════════════════════════════════════════
  // SCREENS
  // ═══════════════════════════════════════════════════════════════

  // ── 1. DASHBOARD ──────────────────────────────────────────────
  const ScreenDashboard = (
    <div className="flex gap-5 h-full overflow-hidden p-5">
      {/* Left: Table Map */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Dine In / Take Away tabs ── */}
        <div className="flex rounded-xl overflow-hidden border border-[#2a2a2a] self-start mb-4">
          {[['dineIn','🪑 Dine In'],['takeAway','📦 Take Away']].map(([v,l])=>(
            <button key={v} onClick={()=>{ if(v==='takeAway'){ setScreen('parcels'); } else { setTableTab(v); } }}
              className={`px-5 py-2 text-sm font-bold transition-colors ${tableTab===v&&v!=='takeAway'?'bg-orange-500 text-white':'bg-[#1a1a1a] text-gray-400 hover:text-white'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-bold text-lg">Table Map — Ground Floor</h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-xs text-gray-300">
              Ground Floor <ChevronDown size={11} className="ml-1"/>
            </div>
            <button onClick={()=>{loadTables();loadStats();}} className="flex items-center gap-1.5 bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-xs text-gray-300 hover:text-white transition-colors">
              <RefreshCw size={11}/> Refresh
            </button>
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mb-3 text-xs text-gray-400">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500/30 border border-green-500"/>Available</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500/30 border border-red-500"/>Occupied</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500"/>Reserved</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-500/30 border border-gray-500"/>Cleaning</span>
        </div>
        {/* Table grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-4 gap-3">
            {filteredTables.map(t=>{
              const cfg = tsCfg(t.status);
              const isOcc = t.status!=='available';
              return (
                <button key={t._id}
                  onClick={()=>isOcc ? openOccupiedTable(t) : (resetFlow(), setSelectedTable(t), setScreen('customerID'))}
                  className={`relative flex flex-col items-start rounded-xl border-2 p-3 transition-transform hover:shadow-lg ${cfg.border} ${cfg.bg}`}
                  style={{willChange:'transform',transform:'translateZ(0)'}}>
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-white font-black text-xl">{t.tableNumber}</span>
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ${isOcc?'animate-pulse':''}`}/>
                  </div>
                  <span className="text-gray-400 text-xs">{t.capacity} Seats</span>
                  {t.status==='bill_pending' && <span className="text-yellow-400 text-[10px] font-bold">Bill Due</span>}
                  {t.status==='reserved' && t.hold_note && <span className="text-amber-400 text-[10px] font-mono">{t.hold_note?.slice(0,6)}</span>}
                  {t.heldAmount && <span className="text-orange-400 text-[10px] font-bold mt-0.5">{fmt(t.heldAmount)}</span>}
                  {t.currentSessionId?.customerName && (
                    <span className="text-blue-300 text-[10px] font-semibold mt-0.5 truncate w-full text-left">
                      👤 {t.currentSessionId.customerName}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: Stats + Activity */}
      <div className="w-72 flex flex-col gap-4 overflow-y-auto flex-shrink-0">
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl p-4">
          <div className="text-white font-bold text-sm mb-3">Today's Overview</div>
          <div className="space-y-2.5">
            {[
              ['Total Orders',      stats.totalOrders,      'text-white',    ()=>setScreen('dashboard')],
              ['Pending Approvals', stats.pendingApprovals, 'text-orange-400', ()=>setScreen('approvals')],
              ['Parcels',           stats.parcels,          'text-blue-400',  ()=>setScreen('parcels')],
              ['Completed Orders',  stats.completedOrders,  'text-green-400', ()=>{}],
            ].map(([lbl,val,cls,action])=>(
              <div key={lbl} onClick={action} className="flex items-center justify-between cursor-pointer hover:opacity-80">
                <span className="text-gray-400 text-xs">{lbl}</span>
                <span className={`font-bold text-base ${cls}`}>{val}</span>
              </div>
            ))}
            <div className="border-t border-[#2a2a2a] pt-2 mt-1">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-xs">Today's Sales</span>
                <span className="text-orange-400 font-black text-base">{fmtShort(stats.todaySales)}</span>
              </div>
              <div className="text-xs text-green-400 text-right mt-0.5">vs Yesterday +13.5%</div>
            </div>
          </div>
        </div>

        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl p-4 flex-1">
          <div className="text-white font-bold text-sm mb-3">Recent Activity</div>
          {recentActivity.length===0 ? (
            <div className="text-gray-500 text-xs text-center py-4">No activity today</div>
          ) : (
            <div className="space-y-3">
              {recentActivity.map(a=>(
                <div key={a.id} className="flex items-start gap-2">
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${a.color.replace('text-','bg-')}`}/>
                  <div>
                    <div className={`text-xs font-semibold ${a.color}`}>{a.text}</div>
                    <div className="text-gray-500 text-[10px]">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── 2. CUSTOMER IDENTIFICATION ────────────────────────────────
  const ScreenCustomerID = (
    <div className="h-full overflow-y-auto p-5 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={()=>{resetFlow();setScreen('dashboard');}} className="text-gray-400 hover:text-white"><ArrowLeft size={20}/></button>
        <div>
          <h1 className="text-xl font-bold text-white">Customer Details</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {selectedTable && !isParcel && <span className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded font-bold">Table {selectedTable.tableNumber} — OCCUPIED</span>}
            {isParcel && <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded font-bold">PARCEL</span>}
          </div>
        </div>
      </div>

      {/* Existing / New toggle */}
      <div className="flex rounded-xl overflow-hidden border border-[#2a2a2a] mb-5">
        {[['existing','Existing Customer'],['new','New Customer']].map(([v,l])=>(
          <button key={v} onClick={()=>{setIsNewCustomer(v==='new'); if(v==='new'){setPhone('');setCustomer(null);}}}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${(!isNewCustomer&&v==='existing')||(isNewCustomer&&v==='new')?'bg-orange-500 text-white':'bg-[#1a1a1a] text-gray-400 hover:text-white'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Mobile search */}
      <div className="mb-4">
        <label className="block text-xs text-gray-400 mb-1.5 font-semibold">
          Mobile Number * {isParcel && <span className="text-orange-400">(Required for Parcel — menu opens after entry)</span>}
        </label>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2.5">
            <Phone size={14} className="text-gray-400"/>
            <input className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
              placeholder="Enter mobile number" value={phone}
              onChange={e=>setPhone(e.target.value.replace(/\D/g,'').slice(0,10))} maxLength={10}/>
            {custLoading && <RefreshCw size={13} className="text-orange-400 animate-spin"/>}
          </div>
          <button onClick={()=>lookupCustomer(phone)} className="px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-colors">
            Search
          </button>
        </div>
      </div>

      {/* Found customer */}
      {customer && (
        <div className="rounded-xl bg-[#1a1a1a] border border-green-500/30 p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-black text-base">{customer.name?.[0]||'?'}</div>
            <div>
              <div className="text-white font-bold">{customer.name}</div>
              <div className="text-gray-400 text-xs">{customer.phone_no}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="flex items-center gap-1 text-amber-400 text-xs justify-end"><Star size={10} className="fill-amber-400"/>{customer.loyalty_points||0} pts</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#2a2a2a] text-xs text-center">
            <div><div className="text-gray-500">Loyalty Points</div><div className="text-amber-400 font-bold flex items-center justify-center gap-1"><Star size={10} className="fill-amber-400"/>{customer.loyalty_points||0}</div></div>
            <div><div className="text-gray-500">Total Visits</div><div className="text-white font-bold">{customer.total_visits||0}</div></div>
            <div><div className="text-gray-500">Last Visit</div><div className="text-white font-bold text-[10px]">{customer.last_visit?format(new Date(customer.last_visit),'d MMM yyyy'):'—'}</div></div>
          </div>
        </div>
      )}

      {/* New customer name */}
      {isNewCustomer && (
        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-1.5 font-semibold">Customer Name (Optional)</label>
          <input className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none"
            placeholder="Enter name" value={newCustName} onChange={e=>setNewCustName(e.target.value)}/>
        </div>
      )}

      {/* Customer type */}
      <div className="mb-5">
        <label className="block text-xs text-gray-400 mb-1.5 font-semibold">Customer Type (For Analytics Only)</label>
        <div className="flex gap-2">
          {['Single','Couple','Family','Group'].map(t=>(
            <button key={t} onClick={()=>setCustomerType(t)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${customerType===t?'bg-orange-500 border-orange-500 text-white':'bg-[#1a1a1a] border-[#2a2a2a] text-gray-400 hover:text-white'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-gray-600 mt-1">(This information will not be printed on the bill)</div>
      </div>

      <button onClick={startSession}
        className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-base transition-colors">
        CONTINUE TO MENU
      </button>
    </div>
  );

  // ── 3. MENU & ORDER ───────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════
  // ORDER WORKSPACE — unified new order + running order screen
  // ══════════════════════════════════════════════════════════════
  const ScreenOrderWorkspace = (() => {
    const allItems = [
      ...prevItems.map(i => ({ ...i, saved: true })),
      ...cart.map(i => ({ ...i, saved: false })),
    ];
    const prevTotal = allItems.filter(i => i.saved).reduce((s, i) => s + (i.totalPrice || i.price * i.qty || 0), 0);
    const cartTotal = allItems.filter(i => !i.saved).reduce((s, i) => s + (i.totalPrice || i.price * i.qty || 0), 0);
    const itemsTotal = prevTotal + cartTotal;
    const gstAmount = (activeSession?.cgst_amount || 0) + (activeSession?.sgst_amount || 0);
    const gstRate = activeSession?.subOrders?.[0]?.items?.[0]?.gst_rate || 0;
    const change = Math.max(0, parseFloat(receivedAmt || 0) - itemsTotal);
    const custName = activeSession?.customerName || customer?.name || newCustName || 'Walk-in';
    const custMobile = activeSession?.customerMobile || phone || '—';
    const tableNum   = selectedTable?.tableNumber || activeSession?.tableNumber || '—';
    const seats      = selectedTable?.capacity || activeSession?.seats || 4;
    const isActive   = !!activeSession;

    return (
      <div className="flex flex-col h-full overflow-hidden" style={{ background: '#111' }}>

      {/* ══ HEADER ══════════════════════════════════════════════════ */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-[#222]">
        <button onClick={()=>{resetFlow();setScreen('dashboard');}} className="text-gray-400 hover:text-white mr-1">
          <ArrowLeft size={18}/>
        </button>
        <span className="text-white font-bold text-base">Table {tableNum}</span>
        <span className="text-[11px] bg-red-500/25 text-red-400 border border-red-500/40 px-2 py-0.5 rounded font-bold">
          {isActive ? 'OCCUPIED' : 'NEW ORDER'}
        </span>
        <span className="text-[10px] text-gray-500">{seats} Seats</span>
        {activeSession?.tokenNumber && (
          <span className="ml-auto text-[11px] bg-orange-500/20 text-orange-400 border border-orange-500/40 px-3 py-0.5 rounded-full font-bold">
            #TOKEN-{activeSession.tokenNumber}
          </span>
        )}
      </div>

      {/* ── INFO BAR ── */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 bg-[#0e0e0e] border-b border-[#1d1d1d] text-xs">
        <span className="flex items-center gap-1.5 text-white font-semibold">
          <User size={11} className="text-gray-500"/>{custName}
        </span>
        <span className="flex items-center gap-1.5 text-gray-300">
          <Phone size={11} className="text-gray-500"/>{custMobile}
        </span>
        <span className="flex items-center gap-1.5 text-gray-400">
          <MapPin size={11} className="text-gray-600"/>Table {tableNum}
        </span>
        {activeSession?.tokenNumber && (
          <span className="flex items-center gap-1.5 text-orange-400 font-bold">
            <Receipt size={11} className="text-orange-500"/>Token #{activeSession.tokenNumber}
          </span>
        )}
        <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full border font-bold ${
          isActive ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
        }`}>{isActive ? 'OPEN' : 'NEW'}</span>
      </div>

      {/* ══ BODY ════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: menu area ── */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-[#222]">

          {/* Tabs + Clear/Cancel */}
          <div className="flex-shrink-0 flex items-stretch border-b border-[#222]">
            {[['add','Add New Items'],['view','Edit / View Items']].map(([v,l])=>(
              <button key={v} onClick={()=>setRunningTab(v)}
                className={`px-5 py-3 text-[13px] font-semibold transition-colors border-b-2 whitespace-nowrap ${
                  runningTab===v?'border-orange-500 text-white':'border-transparent text-gray-500 hover:text-gray-300'
                }`}>
                {l}
              </button>
            ))}
            {isActive && (
              <div className="flex-1 flex items-center justify-end gap-2 px-3">
                <button onClick={clearOrder}
                  className="px-3 py-1.5 rounded-lg border border-orange-500/60 text-orange-400 text-xs font-bold hover:bg-orange-500/10 whitespace-nowrap transition-colors">
                  Clear Order
                </button>
                <button onClick={cancelOrder}
                  className="px-3 py-1.5 rounded-lg border border-red-500/50 text-red-400 text-xs font-bold hover:bg-red-500/10 whitespace-nowrap transition-colors">
                  Cancel Order
                </button>
              </div>
            )}
          </div>

          {runningTab === 'add' ? (<>
            {/* Category pills */}
            <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-[#1d1d1d] overflow-x-auto">
              {menuCats.map(cat=>(
                <button key={cat} onClick={()=>setActiveCat(cat)}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                    activeCat===cat?'bg-orange-500 text-white':'text-gray-400 hover:text-white'
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
            {/* Search bar */}
            <div className="flex-shrink-0 px-4 py-2 border-b border-[#1d1d1d]">
              <div className="flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-1.5">
                <Search size={13} className="text-gray-400" />
                <input className="flex-1 bg-transparent text-xs text-white placeholder-gray-500 outline-none"
                  placeholder="Search menu items..." value={menuSearch} onChange={handleMenuSearchChange} />
              </div>
            </div>
            {/* Menu grid */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid grid-cols-3 gap-2.5">
                {filteredMenu.map(item=>{
                  const inCart = cart.find(ci=>ci._id===item._id);
                  return (
                    <div key={item._id}
                      className="relative flex flex-col rounded-xl overflow-hidden border border-[#242424] hover:border-[#333] transition-colors"
                      style={{background:'#1a1a1a'}}>
                      <div className="w-full h-[72px] flex items-center justify-center overflow-hidden" style={{background:'#252525'}}>
                        {item.image?.url
                          ? <img src={item.image.url} alt={item.name} className="w-full h-full object-cover"/>
                          : <span className="text-[28px] font-black text-[#383838]">{item.name?.[0]?.toUpperCase()}</span>
                        }
                      </div>
                      <div className="p-2.5 flex flex-col gap-1 flex-1">
                        <div className="text-white text-[11px] font-semibold leading-tight line-clamp-2">{item.name}</div>
                        <div className="text-orange-400 text-[11px] font-bold">{fmt(item.price)}</div>
                        {inCart ? (
                          <div className="flex items-center justify-between mt-auto pt-1">
                            <button onClick={()=>removeFromCart(item._id)}
                              className="w-6 h-6 rounded-md flex items-center justify-center font-bold text-sm text-white hover:bg-red-500/30"
                              style={{background:'#2e2e2e'}}>−</button>
                            <span className="text-white font-bold text-sm">{inCart.qty}</span>
                            <button onClick={()=>addToCart(item)}
                              className="w-6 h-6 rounded-md flex items-center justify-center font-bold text-sm text-white bg-orange-500 hover:bg-orange-400">+</button>
                          </div>
                        ) : (
                          <button onClick={()=>addToCart(item)}
                            className="mt-auto w-full py-1 rounded-md border border-[#2e2e2e] text-gray-500 text-xs font-bold hover:border-orange-500/60 hover:text-orange-400 flex items-center justify-center gap-0.5 transition-colors">
                            <Plus size={10}/> Add
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>) : (
            /* Edit / View tab */
            <div className="flex-1 overflow-y-auto p-4">
              {allItems.length === 0
                ? <p className="text-center text-gray-600 py-12 text-sm">No items in this order yet</p>
                : allItems.map((it,i)=>(
                  <div key={i} className="flex items-center justify-between py-2.5 border-b border-[#1e1e1e] last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-[13px] font-semibold truncate">{it.name}</div>
                      <div className="text-gray-500 text-xs">{fmt(it.unitPrice||it.price)} each</div>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      {!it.saved && (<>
                        <button onClick={()=>removeFromCart(it._id)} className="w-6 h-6 rounded bg-[#252525] text-white text-xs font-bold flex items-center justify-center">−</button>
                        <span className="text-white text-sm font-bold w-5 text-center">{it.qty}</span>
                        <button onClick={()=>addToCart(it)} className="w-6 h-6 rounded bg-orange-500 text-white text-xs font-bold flex items-center justify-center">+</button>
                      </>)}
                      {it.saved && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-gray-500 text-xs">x{it.qty}</span>
                          <button
                            onClick={()=>initiateDeleteItem(it)}
                            className="text-gray-600 hover:text-red-400 transition-colors ml-1"
                            title="Delete item (requires PIN)">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      )}
                      <span className="text-orange-400 text-sm font-bold w-16 text-right">{fmt(it.totalPrice||it.price*it.qty)}</span>
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </div>

          {/* ── RIGHT PANEL ── */}
          <div className="w-72 flex-shrink-0 flex flex-col overflow-hidden border-l border-[#222]" style={{ background: '#111' }}>
            <div className="flex-1 overflow-y-auto">

              {/* Current Order */}
              <div className="p-4 border-b border-[#222]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-bold text-sm">Current Order ({allItems.length} Items)</span>
                  {cart.length > 0 && (
                    <button onClick={() => setCart([])} className="flex items-center gap-1 text-red-400 text-xs hover:text-red-300 font-semibold">
                      Clear <Trash2 size={10} />
                    </button>
                  )}
                </div>
                {allItems.length === 0
                  ? <p className="text-gray-600 text-xs text-center py-3">No items added yet</p>
                  : (
                    <div className="space-y-2.5">
                      {allItems.map((it, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-white text-[12px] font-semibold truncate">{it.name}</div>
                            <div className="text-orange-400 text-[11px] font-bold">{fmt(it.unitPrice || it.price)}</div>
                          </div>
                          {!it.saved ? (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => setQty(it._id, -1)}
                                className="w-5 h-5 rounded flex items-center justify-center font-bold text-xs text-white"
                                style={{ background: '#252525' }}>−</button>
                              <span className="text-white text-xs font-bold w-4 text-center">{it.qty}</span>
                              <button onClick={() => addItem(it)}
                                className="w-5 h-5 rounded bg-orange-500 flex items-center justify-center font-bold text-xs text-white hover:bg-orange-400">+</button>
                              <button onClick={() => setCart(p => p.filter(c => c._id !== it._id))}
                                className="text-gray-600 hover:text-red-400 ml-0.5"><X size={10} /></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-gray-500 text-xs">x{it.qty}</span>
                          <button onClick={()=>initiateDeleteItem(it)}
                            className="text-gray-600 hover:text-red-400 transition-colors"
                            title="Delete (PIN required)">
                            <Trash2 size={11}/>
                          </button>
                        </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                }
                {/* Totals */}
                <div className="mt-4 pt-3 border-t border-[#1e1e1e] space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Items Total</span><span className="text-white">{fmt(itemsTotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>GST ({gstRate}%)</span><span className="text-white">{fmt(gstAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black pt-2 border-t border-[#1e1e1e] mt-1">
                    <span className="text-white">Total Amount</span>
                    <span className="text-orange-400">{fmt(itemsTotal + gstAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Unified Payment */}
              <div className="p-4 border-b border-[#222]">
                <div className="text-white font-bold text-sm mb-3">Unified Payment</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'Cash', icon: <IndianRupee size={14} />, label: 'Cash' },
                    { id: 'UPI', icon: <Smartphone size={14} />, label: 'UPI' },
                    { id: 'Card', icon: <CreditCard size={14} />, label: 'Card' },
                    { id: 'Split', icon: <span className="text-[13px] font-black leading-none">%</span>, label: 'Split' },
                  ].map(m => (
                    <button key={m.id} onClick={() => setPaymentMode(m.id)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-bold border transition-colors ${paymentMode === m.id
                        ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                        : 'border-[#252525] text-gray-500 hover:border-[#333] hover:text-gray-300'
                        }`} style={{ background: paymentMode === m.id ? undefined : '#1a1a1a' }}>
                      {m.icon}<span>{m.label}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="rounded-xl px-3 py-2.5 border border-[#252525]" style={{ background: '#1a1a1a' }}>
                    <div className="text-xs text-gray-500 font-semibold mb-1">Amount</div>
                    <div className="flex items-center gap-2">
                      <IndianRupee size={13} className="text-gray-500" />
                      <input
                        type="number"
                        min={0}
                        value={receivedAmt}
                        onChange={e => setReceivedAmt(e.target.value)}
                        placeholder={itemsTotal.toFixed(2)}
                        className="flex-1 bg-transparent text-white text-sm font-bold outline-none"
                      />
                    </div>
                  </div>
                  <div className="rounded-xl px-3 py-2.5 border border-[#252525]" style={{ background: '#1a1a1a' }}>
                    <div className="text-xs text-gray-500 font-semibold mb-1">Reference / Note</div>
                    <input
                      type="text"
                      value={paymentRef}
                      onChange={e => setPaymentRef(e.target.value)}
                      placeholder={paymentMode === 'Cash' ? 'Cash note' : 'Txn / Last 4 digits'}
                      className="w-full bg-transparent text-white text-sm font-bold outline-none placeholder:text-gray-600"
                    />
                  </div>
                </div>
                <div className="mt-2 flex justify-between text-xs">
                  <span className="text-gray-400">Change</span>
                  <span className="text-green-400 font-bold">{fmt(change)}</span>
                </div>
                <div className="mt-2 text-[10px] text-gray-600">All payment methods follow the same invoice format.</div>
              </div>

              {/* Customer Details */}
              <div className="p-4 border-b border-[#222]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-bold text-sm">Customer Details</span>
                  <button onClick={() => setScreen('customerID')}
                    className="text-orange-400 text-xs hover:text-orange-300 flex items-center gap-1">Edit ✏️</button>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-gray-300">
                    <User size={12} className="text-gray-600 flex-shrink-0" /><span>{custName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <Phone size={12} className="text-gray-600 flex-shrink-0" /><span>{custMobile}</span>
                  </div>
                </div>
              </div>

            {/* Customer Details */}
            <div className="p-4 border-b border-[#222]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-bold text-sm">Customer Details</span>
                {!isActive && (
                  <button onClick={()=>setScreen('customerID')}
                    className="text-orange-400 text-xs hover:text-orange-300">Edit ✏️</button>
                )}
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-gray-300">
                  <User size={12} className="text-gray-600 flex-shrink-0"/><span>{custName}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Phone size={12} className="text-gray-600 flex-shrink-0"/><span>{custMobile}</span>
                </div>
                <textarea value={specialNote} onChange={e => setSpecialNote(e.target.value)}
                  placeholder="No notes added" rows={2}
                  className="w-full bg-transparent text-xs text-gray-500 outline-none resize-none placeholder-gray-700" />
              </div>
            </div>
          </div>
        </div>
        </div>

        {/* ══ BOTTOM BAR ══ */}
        <div className="flex-shrink-0 flex border-t border-[#1e1e1e]">
          <button onClick={confirmToKitchen}
            className="flex-1 py-4 bg-orange-500 hover:bg-orange-400 text-white font-black text-sm tracking-wide transition-colors flex items-center justify-center">
            CONFIRM &amp; SEND TO KITCHEN
          </button>
          <button onClick={generateBill}
            className="flex-shrink-0 flex items-center gap-2 px-5 py-4 bg-orange-600 hover:bg-orange-500 text-white font-black text-sm transition-colors border-l border-orange-700/60">
            GENERATE BILL <Printer size={14} />
          </button>
        </div>
      </div>
    );
  })();

  // ── 4. HOLD ORDERS ────────────────────────────────────────────
  const filteredHeld = heldOrders.filter(s=>{
    const typeMatch = heldFilter==='all'||(heldFilter==='dine_in'&&!s.isParcel)||(heldFilter==='parcel'&&s.isParcel);
    const searchMatch = !heldSearch||s.tableNumber?.toString().includes(heldSearch)||s.customerName?.toLowerCase().includes(heldSearch.toLowerCase());
    return typeMatch&&searchMatch;
  });
  const ScreenHoldOrders = (
    <div className="flex flex-col h-full p-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Save Orders</h1>
        <button onClick={loadStats} className="text-gray-400 hover:text-orange-400"><RefreshCw size={16}/></button>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2">
          <Search size={13} className="text-gray-400"/>
          <input className="flex-1 bg-transparent text-xs text-white placeholder-gray-500 outline-none"
            placeholder="Search by table, name or mobile..." value={heldSearch} onChange={e=>setHeldSearch(e.target.value)}/>
        </div>
        <div className="flex rounded-xl overflow-hidden border border-[#2a2a2a]">
          {[['all',`All (${heldOrders.length})`],['dine_in',`Dine In (${heldOrders.filter(s=>!s.isParcel).length})`],['parcel',`Parcel (${heldOrders.filter(s=>s.isParcel).length})`]].map(([v,l])=>(
            <button key={v} onClick={()=>setHeldFilter(v)}
              className={`px-3 py-2 text-xs font-semibold transition-colors ${heldFilter===v?'bg-orange-500 text-white':'bg-[#1a1a1a] text-gray-400 hover:text-white'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[#2a2a2a] bg-[#161616]">
            {['Order No.','Table / Type','Customer','Items','Amount','Saved On','Action'].map(h=>(
              <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-semibold">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filteredHeld.length===0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-500 text-sm">No held orders</td></tr>
            ) : filteredHeld.map(s=>(
              <tr key={s._id} className="border-b border-[#2a2a2a] hover:bg-[#1e1e1e]">
                <td className="px-4 py-3 text-orange-400 font-bold text-xs">#{s.tokenNumber||s._id?.slice(-4)}</td>
                <td className="px-4 py-3 text-white text-xs">{s.isParcel?'Parcel':s.tableNumber||'Counter'}</td>
                <td className="px-4 py-3">
                    <div className="text-white font-semibold text-xs">{s.customerName||'Walk-in'}</div>
                    {s.customerMobile && <div className="text-gray-500 text-[10px]">{s.customerMobile}</div>}
                  </td>
                <td className="px-4 py-3 text-gray-300 text-xs">{s.subOrders?.reduce((sum,o)=>sum+(o.items?.length||0),0)||0}</td>
                <td className="px-4 py-3 text-orange-400 font-bold text-xs">{fmt(s.totalAmount)}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{s.heldAt?format(new Date(s.heldAt),'d MMM hh:mm a'):'—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={()=>resumeSession(s._id)} className="px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs font-bold hover:bg-green-500/30">RESUME</button>
                    <button className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold hover:bg-red-500/30">DEL</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={()=>setScreen('dashboard')} className="mt-3 w-full py-2 border border-[#2a2a2a] text-gray-400 rounded-xl text-xs hover:bg-[#1a1a1a] transition-colors">VIEW ALL SAVE ORDERS</button>
    </div>
  );

  // ── 5. PENDING APPROVALS ──────────────────────────────────────
  const SOURCE_BADGE = {
    waiter:       { label: 'Waiter',   cls: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    pos_operator: { label: 'POS',      cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    qr_customer:  { label: 'QR',       cls: 'bg-cyan-500/20   text-cyan-400   border-cyan-500/30'   },
  };
  const STATUS_COLOR = {
    Pending:    'bg-yellow-500/20 text-yellow-400',
    Accepted:   'bg-blue-500/20   text-blue-400',
    Preparing:  'bg-orange-500/20 text-orange-400',
    Ready:      'bg-green-500/20  text-green-400',
    Delivered:  'bg-teal-500/20   text-teal-400',
    Completed:  'bg-gray-500/20   text-gray-400',
  };

  const cancelRequests  = pendingOrders.filter(s => s.status === 'pending_cancel');
  const orderRequests   = pendingOrders.filter(s => s.status !== 'pending_cancel');
  const filteredPending = orderRequests.filter(s=>
    pendingFilter==='all'||(pendingFilter==='dine_in'&&!s.isParcel)||(pendingFilter==='parcel'&&s.isParcel)
  );
  const ScreenApprovals = (
    <div className="flex flex-col h-full p-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Approvals
          <span className="ml-2 text-sm text-orange-400 font-normal">({pendingOrders.length} pending)</span>
        </h1>
        <button onClick={loadStats} className="text-gray-400 hover:text-orange-400"><RefreshCw size={16}/></button>
      </div>
      <div className="flex rounded-xl overflow-hidden border border-[#2a2a2a] mb-4 self-start">
        {[['all',`All (${orderRequests.length})`],['dine_in',`Dine In (${orderRequests.filter(s=>!s.isParcel).length})`],['parcel',`Parcel (${orderRequests.filter(s=>s.isParcel).length})`]].map(([v,l])=>(
          <button key={v} onClick={()=>setPendingFilter(v)}
            className={`px-4 py-2 text-xs font-semibold transition-colors ${pendingFilter===v?'bg-orange-500 text-white':'bg-[#1a1a1a] text-gray-400 hover:text-white'}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto space-y-3">
        {/* ── Cancel requests section ─────────────────────────────── */}
        {cancelRequests.length > 0 && (
          <div>
            <div className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse inline-block"/>
              Table Cancellation Requests ({cancelRequests.length})
            </div>
            {cancelRequests.map(s => (
              <div key={s._id} className="bg-[#1a1a1a] border border-red-500/30 rounded-2xl p-4 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-red-400 font-black text-base mr-2">Table {s.tableNumber||'—'}</span>
                    <span className="text-xs text-gray-400">{s.customerName||'Walk-in'}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded border text-[10px] font-bold bg-red-500/20 text-red-400 border-red-500/30">CANCEL REQUEST</span>
                </div>
                <div className="text-xs text-gray-500 mb-3">
                  Reason: <span className="text-gray-300">{s.cancel_reason || 'Customer left before ordering'}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>approveCancelRequest(s._id)}
                    className="flex-1 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-xl text-xs font-bold hover:bg-green-500/30">
                    ✓ APPROVE CANCELLATION
                  </button>
                  <button onClick={()=>rejectCancelRequest(s._id)}
                    className="px-4 py-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-xl text-xs font-bold hover:bg-orange-500/30">
                    ✕ REJECT
                  </button>
                </div>
              </div>
            ))}
            {orderRequests.length > 0 && <div className="border-t border-[#2a2a2a] my-3"/>}
          </div>
        )}
        {filteredPending.length===0 && cancelRequests.length===0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <CheckSquare size={32} className="mb-3 opacity-40"/>
            <p className="text-sm">No pending orders</p>
          </div>
        ) : filteredPending.length===0 ? null : filteredPending.map(s=>{
          const allItems = s.subOrders?.flatMap(o=>o.items||[])||[];
          const expanded = expandedOrder===s._id;
          const src = s.orderSource || 'pos_operator';
          const badge = SOURCE_BADGE[src] || SOURCE_BADGE.pos_operator;
          return (
            <div key={s._id} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
              {/* Header row — click to expand */}
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#1e1e1e]"
                onClick={()=>setExpandedOrder(expanded?null:s._id)}>
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <div className="text-[10px] text-gray-500 mb-0.5">TOKEN</div>
                    <div className="text-orange-400 font-black text-base">#{s.tokenNumber||'—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 mb-0.5">TABLE</div>
                    <div className="text-white font-semibold text-sm">{s.tableNumber||'Parcel'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 mb-0.5">ITEMS / AMOUNT</div>
                    <div className="text-white text-sm">{allItems.length} items · <span className="text-orange-400 font-bold">{fmt(s.totalAmount)}</span></div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${s.isParcel?'bg-blue-500/20 text-blue-400':'bg-green-500/20 text-green-400'}`}>{s.isParcel?'Parcel':'Dine In'}</span>
                  </div>
                </div>
                <div className={`text-gray-400 transition-transform ${expanded?'rotate-180':''}`}>▼</div>
              </div>

              {/* Expandable items */}
              {expanded && (
                <div className="border-t border-[#2a2a2a] px-4 pb-3">
                  <div className="text-[10px] text-gray-500 mt-2 mb-2 uppercase tracking-wider">Ordered Items</div>
                  <div className="space-y-1.5 mb-3">
                    {allItems.map((item,i)=>(
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-white">{item.name}</span>
                        <span className="text-gray-400">×{item.quantity} <span className="text-orange-300 ml-1">₹{item.item_total||item.price*item.quantity}</span></span>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 mb-3">
                    Customer: <span className="text-white">{s.customerName||'Walk-in'}</span>
                    {s.orderSource && <> · Source: <span className={`font-semibold ${badge.cls.split(' ')[1]}`}>{badge.label}</span></>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={()=>approveWaiterOrder(s._id)} className="flex-1 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-xl text-xs font-bold hover:bg-green-500/30">✓ APPROVE & SEND TO KITCHEN</button>
                    <button onClick={()=>rejectWaiterOrder(s._id)} className="px-4 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold hover:bg-red-500/30">✕ REJECT</button>
                  </div>
                </div>
              )}
              {/* Quick action when collapsed */}
              {!expanded && (
                <div className="px-4 pb-3 flex gap-2">
                  <button onClick={()=>approveWaiterOrder(s._id)} className="flex-1 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-xl text-xs font-bold hover:bg-green-500/30">✓ APPROVE</button>
                  <button onClick={()=>rejectWaiterOrder(s._id)} className="px-4 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold hover:bg-red-500/30">✕ REJECT</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── 6. PARCEL SECTION (Independent flow) ─────────────────────
  const parcelMenuItems = menuItems; // reuse loaded menu
  const parcelCartTotal = parcelCart.reduce((s,c)=>s+c.price*c.qty,0);
  const parcelCartCount = parcelCart.reduce((s,c)=>s+c.qty,0);

  // Sub-screen: mobile entry
  const ParcelMobileScreen = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[#2a2a2a] flex items-center gap-3">
        <button onClick={()=>setParcelFlowScreen('list')} className="text-gray-400 hover:text-white"><ArrowLeft size={20}/></button>
        <div>
          <h1 className="text-white font-bold">New Parcel Order</h1>
          <p className="text-gray-500 text-xs">Step 1 of 3 — Customer Mobile</p>
        </div>
        <span className="ml-auto text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded-lg font-bold">📦 PARCEL</span>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-xs text-blue-300">
          Mobile number is mandatory for all parcel orders.
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5 font-semibold">Customer Mobile *</label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2.5">
              <Phone size={14} className="text-gray-400"/>
              <input className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
                placeholder="10-digit mobile number"
                value={parcelPhone}
                onChange={e=>{const v=e.target.value.replace(/\D/g,'').slice(0,10); setParcelPhone(v); lookupParcelCustomer(v);}}
                maxLength={10}/>
              {parcelCustLoading && <RefreshCw size={13} className="text-orange-400 animate-spin"/>}
              {parcelCustomer && <Check size={14} className="text-green-400"/>}
            </div>
          </div>
        </div>
        {parcelCustomer && (
          <div className="rounded-xl bg-[#1e1e1e] border border-green-500/40 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold">
                {parcelCustomer.name?.[0]||'?'}</div>
              <div>
                <div className="text-white font-semibold text-sm">{parcelCustomer.name}</div>
                <div className="text-gray-400 text-xs">{parcelCustomer.phone_no}</div>
              </div>
            </div>
          </div>
        )}
        {!parcelCustomer && parcelPhone.length > 0 && parcelPhone.length < 10 && (
          <p className="text-[10px] text-gray-500">Enter 10 digits to look up customer</p>
        )}
        {!parcelCustomer && parcelPhone.length === 10 && (
          <div className="rounded-xl bg-[#1e1e1e] border border-[#2a2a2a] p-3 space-y-2">
            <p className="text-xs text-gray-400">New customer — enter name (optional)</p>
            <input className="w-full bg-[#252525] border border-[#333] rounded-xl px-3 py-2 text-sm text-white outline-none placeholder-gray-500"
              placeholder="Customer name (optional)" value={parcelCustName} onChange={e=>setParcelCustName(e.target.value)}/>
          </div>
        )}
        <button
          disabled={parcelPhone.length < 10}
          onClick={()=>setParcelFlowScreen('parcelMenu')}
          className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-base transition-colors">
          CONTINUE TO MENU →
        </button>
      </div>
    </div>
  );

  // Sub-screen: parcel menu selection
  const ParcelMenuScreen = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[#2a2a2a] flex items-center gap-3">
        <button onClick={()=>setParcelFlowScreen('mobile')} className="text-gray-400 hover:text-white"><ArrowLeft size={20}/></button>
        <div>
          <h1 className="text-white font-bold">Select Items</h1>
          <p className="text-gray-500 text-xs">Step 2 of 3 — Menu · 📦 Parcel · {parcelCustomer?.name||parcelCustName||parcelPhone}</p>
        </div>
        {parcelCartCount > 0 && (
          <button onClick={()=>setParcelFlowScreen('parcelCart')}
            className="ml-auto flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-3 py-1.5 rounded-xl text-xs font-bold">
            🛒 {parcelCartCount} · {fmt(parcelCartTotal)}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          {parcelMenuItems.map(item=>{
            const inCart = parcelCart.find(c=>c._id===item._id);
            return (
              <div key={item._id} onClick={()=>addToParcelCart(item)}
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform hover:border-orange-500/40">
                <div className="w-full h-[80px] flex items-center justify-center overflow-hidden" style={{background:'#252525'}}>
                  {item.image?.url
                    ? <img src={item.image.url} alt={item.name} className="w-full h-full object-cover"/>
                    : <span className="text-[24px] font-black text-[#383838]">{item.name?.[0]?.toUpperCase()}</span>
                  }
                </div>
                <div className="p-3">
                <div className="text-white font-semibold text-sm mb-1 truncate">{item.name}</div>
                <div className="text-orange-400 font-bold text-sm mb-2">{fmt(item.price)}</div>
                {inCart ? (
                  <div className="flex items-center gap-2" onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>removeFromParcelCart(item._id)} className="w-7 h-7 rounded-lg bg-red-500/20 text-red-400 font-bold text-sm flex items-center justify-center">−</button>
                    <span className="text-white font-bold text-sm flex-1 text-center">{inCart.qty}</span>
                    <button onClick={()=>addToParcelCart(item)} className="w-7 h-7 rounded-lg bg-orange-500/20 text-orange-400 font-bold text-sm flex items-center justify-center">+</button>
                  </div>
                ) : (
                  <button onClick={e=>{e.stopPropagation(); addToParcelCart(item);}} className="w-full py-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg text-xs font-bold hover:bg-orange-500/30">+ ADD</button>
                )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // Sub-screen: parcel cart review & submit
  const ParcelCartScreen = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[#2a2a2a] flex items-center gap-3">
        <button onClick={()=>setParcelFlowScreen('parcelMenu')} className="text-gray-400 hover:text-white"><ArrowLeft size={20}/></button>
        <div>
          <h1 className="text-white font-bold">Review & Submit</h1>
          <p className="text-gray-500 text-xs">Step 3 of 3 — 📦 Parcel · {parcelCustomer?.name||parcelCustName||parcelPhone}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 space-y-2">
          {parcelCart.map(c=>(
            <div key={c._id} className="flex items-center justify-between">
              <div>
                <span className="text-white text-sm font-semibold">{c.name}</span>
                <span className="text-gray-500 text-xs ml-2">×{c.qty}</span>
              </div>
              <span className="text-orange-400 font-bold text-sm">{fmt(c.price*c.qty)}</span>
            </div>
          ))}
          <div className="border-t border-[#2a2a2a] pt-2 flex justify-between font-bold">
            <span className="text-white">Total</span>
            <span className="text-orange-400">{fmt(parcelCartTotal)}</span>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Note to Kitchen (Optional)</label>
          <input className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white outline-none placeholder-gray-600"
            placeholder="Special instructions..." value={parcelNote} onChange={e=>setParcelNote(e.target.value)}/>
        </div>
        <button onClick={submitParcelOrder} disabled={!parcelCart.length}
          className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold rounded-xl text-base transition-colors">
          PLACE PARCEL ORDER
        </button>
      </div>
    </div>
  );

  // Main ScreenParcels
  const ScreenParcels = parcelFlowScreen === 'mobile' ? ParcelMobileScreen
    : parcelFlowScreen === 'parcelMenu' ? ParcelMenuScreen
    : parcelFlowScreen === 'parcelCart' ? ParcelCartScreen
    : (
    <div className="flex flex-col h-full p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">📦 Parcels</h1>
          {isMasterAdmin && (
            <select value={selectedFranchiseId} onChange={e=>setSelectedFranchiseId(e.target.value)}
              className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-xs rounded-lg px-3 py-1.5 outline-none">
              {franchiseList.length===0 && <option value="">No franchises found</option>}
              {franchiseList.map(f=>(
                <option key={f._id} value={f._id}>{f.name || f.franchiseCode}</option>
              ))}
            </select>
          )}
        </div>
        <button onClick={()=>setParcelFlowScreen('mobile')}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors">
          + New Parcel Order
        </button>
      </div>
      <div className="flex rounded-xl overflow-hidden border border-[#2a2a2a] mb-4 self-start">
        {[['preparing',`Preparing (${parcelOrders.filter(p=>p.status==='open'||p.status==='pending_pos').length})`],['ready',`Ready (${parcelOrders.filter(p=>p.status==='bill_pending').length})`],['completed',`Completed (${parcelOrders.filter(p=>p.status==='paid').length})`]].map(([v,l])=>(
          <button key={v} onClick={()=>setParcelTab(v)}
            className={`px-4 py-2 text-xs font-semibold transition-colors ${parcelTab===v?'bg-orange-500 text-white':'bg-[#1a1a1a] text-gray-400 hover:text-white'}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[#2a2a2a] bg-[#161616]">
            {['Token','Customer','Mobile','Items','Amount','Status','Action'].map(h=>(
              <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-semibold">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {parcelOrders.length===0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-500 text-sm">No parcel orders</td></tr>
            ) : parcelOrders.map(s=>(
              <tr key={s._id} className="border-b border-[#2a2a2a] hover:bg-[#1e1e1e]">
                <td className="px-4 py-3 text-orange-400 font-black text-sm">#{s.tokenNumber||s._id?.slice(-4)}</td>
                <td className="px-4 py-3">
                  <div className="text-white font-semibold text-xs">{s.customerName||'Walk-in'}</div>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{s.customerMobile||'—'}</td>
                <td className="px-4 py-3 text-gray-300 text-xs">{s.subOrders?.reduce((sum,o)=>sum+(o.items?.length||0),0)||0}</td>
                <td className="px-4 py-3 text-orange-400 font-bold text-xs">{fmt(s.totalAmount||0)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    s.status==='pending_pos'?'bg-yellow-500/20 text-yellow-400':
                    s.status==='open'?'bg-blue-500/20 text-blue-400':
                    s.status==='bill_pending'?'bg-green-500/20 text-green-400':
                    'bg-gray-500/20 text-gray-400'
                  }`}>{s.status==='pending_pos'?'Pending Approval':s.status==='open'?'Preparing':s.status==='bill_pending'?'Ready':s.status}</span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={()=>{setActiveSession(s);setScreen('billing');}}
                    className="px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs font-bold hover:bg-green-500/30">BILL</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── 7. BILLING & PAYMENT ──────────────────────────────────────
  const billPrevTotal = (activeSession?.subOrders?.reduce((s,sub)=>s+(sub.items?.reduce((ss,it)=>ss+(it.totalPrice||0),0)||0),0))||0;
  const billNewTotal  = cart.reduce((s,c)=>s+c.price*c.qty,0);
  const billSubtotal  = billPrevTotal+billNewTotal;
  const billGST       = billSubtotal*0.05;
  const billGrandTotal= billSubtotal+billGST-discount;
  const balance       = parseFloat(receivedAmt||0)-billGrandTotal;
  const ScreenBilling = (
    <div className="h-full overflow-y-auto p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={()=>setScreen('workspace')} className="text-gray-400 hover:text-white"><ArrowLeft size={20}/></button>
          <h1 className="text-xl font-bold text-white">Table {selectedTable?.tableNumber||'Parcel'}</h1>
        </div>
        <span className="text-orange-400 text-sm font-mono">Invoice #{runningInvoice?.invoiceNumber||'—'}</span>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="text-white font-bold mb-3">Bill Summary</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-400"><span>Previous Items ({(activeSession?.subOrders?.length||0)})</span><span className="text-white">{fmt(billPrevTotal)}</span></div>
              {billNewTotal>0 && <div className="flex justify-between text-gray-400"><span>New Items ({cartCount})</span><span className="text-white">{fmt(billNewTotal)}</span></div>}
              <div className="flex justify-between text-gray-400"><span>Subtotal</span><span className="text-white">{fmt(billSubtotal)}</span></div>
              <div className="flex justify-between text-gray-400">
                <span>Discount</span>
                <div className="flex items-center gap-1">
                  <span className="text-red-400">-</span>
                  <input className="w-16 bg-[#252525] border border-[#333] rounded px-2 py-0.5 text-xs text-white text-right outline-none"
                    value={discount} onChange={e=>{ setDiscount(parseFloat(e.target.value)||0); setAppliedCoupon(null); setCouponInput(''); }}/>
                </div>
              </div>
              <div className="pt-1">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-1.5">
                    <span className="text-green-400 text-xs font-bold">🎟 {appliedCoupon.code} applied</span>
                    <button onClick={removeCoupon} className="text-red-400 text-xs hover:text-red-300 ml-2">✕ Remove</button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <input
                      className="flex-1 bg-[#252525] border border-[#333] rounded-l px-2 py-1 text-xs text-white outline-none placeholder-gray-600 uppercase"
                      placeholder="COUPON CODE"
                      value={couponInput}
                      onChange={e=>setCouponInput(e.target.value.toUpperCase())}
                      onKeyDown={e=>e.key==='Enter'&&applyCoupon()}
                    />
                    <button
                      onClick={applyCoupon}
                      disabled={couponLoading || !couponInput.trim()}
                      className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-xs px-3 py-1 rounded-r font-bold transition-colors">{couponLoading ? '...' : 'APPLY'}</button>
                  </div>
                )}
              </div>
              <div className="flex justify-between text-gray-400"><span>GST (5%)</span><span className="text-white">{fmt(billGST)}</span></div>
              <div className="flex justify-between font-black text-base border-t border-[#2a2a2a] pt-2">
                <span className="text-white">Grand Total</span><span className="text-orange-400">{fmt(billGrandTotal)}</span>
              </div>
            </div>
          </div>
          <button onClick={generateBill}
            className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-white font-black text-base rounded-2xl transition-all shadow-lg shadow-orange-500/20">
            GENERATE BILL
          </button>
        </div>

        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4 text-sm text-gray-400">
          <div className="font-bold text-white mb-2">Unified Billing</div>
          <p>Generate the bill once, then record Cash, UPI, Card, or Split payments from the same thermal invoice screen.</p>
          <p className="mt-3">This keeps every franchise on the same invoice pattern and print flow.</p>
        </div>
      </div>
    </div>
  );
  // ── 8. INVOICE / RECEIPT ─────────────────────────────────────

  const ScreenInvoice = (
    <div className="h-full overflow-y-auto p-3">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div id="pos-thermal-receipt" className="p-3 text-gray-900" style={{ fontFamily: '"Courier New", Courier, monospace', color: '#111', fontSize: '11px', lineHeight: 1.25 }}>
            <div className="text-center mb-2">
              <div className="text-lg font-black tracking-wide">{franchiseInfo?.name || 'Utc Cafe'}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{franchiseInfo?.address || '1-2-3, Main Road, Vijayawada, Andhra Pradesh - 520001'}</div>
              <div className="text-[10px] text-gray-500">GSTIN: {franchiseInfo?.gstin || '37ABCDE1234F1Z5'}</div>
            </div>

            <div className="border-t border-b border-dashed border-gray-300 py-2 grid grid-cols-2 gap-2 text-[10px]">
              <div className="space-y-0.5">
                <div><span className="text-gray-500">Date</span> <span className="font-bold">{format(new Date(invoice?.invoice_date || invoice?.createdAt || new Date()), 'd MMM yyyy hh:mm a')}</span></div>
                <div><span className="text-gray-500">Invoice No</span> <span className="font-bold">{invoice?.invoice_no || invoice?.invoiceNumber || runningInvoice?.invoice_no || runningInvoice?.invoiceNumber || 'INV0001'}</span></div>
                <div><span className="text-gray-500">Token</span> <span className="font-bold">#{invoice?.token_number || activeSession?.tokenNumber || '—'}</span></div>
                <div><span className="text-gray-500">Table</span> <span className="font-bold">{selectedTable?.tableNumber || activeSession?.tableNumber || '—'}</span></div>
              </div>
              <div className="space-y-0.5">
                <div><span className="text-gray-500">Customer</span> <span className="font-bold">{customer?.name || newCustName || 'Walk-in'} ({phone || customer?.phone_no || '—'})</span></div>
                <div><span className="text-gray-500">Payment</span> <span className="font-bold">{paymentMode}</span></div>
                <div><span className="text-gray-500">Visit</span> <span className="font-bold">{activeSession?.orderType === 'parcel' ? 'Parcel' : 'Dine-In'}</span></div>
                <div><span className="text-gray-500">Status</span> <span className="font-bold">{(activeSession?.paymentStatus || invoice?.payment_status || 'Pending').toString()}</span></div>
              </div>
            </div>

            <div className="mt-4">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-xs font-bold pb-2">
                <div>Item</div>
                <div className="text-right">Qty</div>
                <div className="text-right">Rate</div>
                <div className="text-right">Amount</div>
              </div>
              <div className="border-t border-dashed border-gray-300" />

              {[...prevItems, ...cart].map((it, i) => {
                const qty = Number(it.qty || it.quantity || 1);
                const rate = Number(it.unitPrice || it.price || 0);
                const amount = Number(it.totalPrice || it.item_total || rate * qty);
                return (
                  <div key={`${it._id || it.name || 'item'}-${i}`} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-xs py-2 border-b border-dashed border-gray-100">
                    <div className="break-words pr-2">{it.name}</div>
                    <div className="text-right">{qty}</div>
                    <div className="text-right">{fmt(rate)}</div>
                    <div className="text-right font-bold">{fmt(amount)}</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 border-t border-dashed border-gray-300 pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span>Subtotal:</span><span>{fmt(billSubtotal)}</span></div>
              {discount > 0 && <div className="flex justify-between text-red-500"><span>Discount:</span><span>-{fmt(discount)}</span></div>}
              <div className="flex justify-between"><span>GST (5%):</span><span>{fmt(billGST)}</span></div>
              <div className="flex justify-between font-bold text-base">
                <span>Grand Total:</span>
                <span className="text-orange-500">{fmt(billGrandTotal)}</span>
              </div>
              <div className="flex justify-between"><span>Rounding:</span><span>{fmt(Math.round(billGrandTotal) - billGrandTotal)}</span></div>
              <div className="border-t border-dashed border-gray-300 pt-2" />
              <div className="flex justify-between font-bold">
                <span>Total Payable:</span>
                <span>{fmt(Math.round(billGrandTotal))}</span>
              </div>
            </div>

            <div className="mt-4 border-t border-dashed border-gray-300 pt-3">
              <div className="text-center font-bold text-sm mb-2">PAYMENT BREAKDOWN</div>
              <div className="border-t border-dashed border-gray-300 mb-2" />
              {(() => {
                const paymentRows = (activeSession?.payments || invoice?.payments || []);
                const fallbackAmount = parseFloat(receivedAmt) || billGrandTotal;
                const rows = paymentRows.length > 0
                  ? paymentRows
                  : (paymentMode === 'Split' ? [] : [{ method: paymentMode, amount: fallbackAmount, reference: paymentRef || '' }]);

                const labelFor = (method) => {
                  const m = String(method || 'Cash').toLowerCase();
                  if (m.includes('upi')) return 'UPI Paid:';
                  if (m.includes('card')) return 'Credit Card (Visa) Paid:';
                  if (m.includes('bank')) return 'Net Banking Paid:';
                  if (m.includes('split')) return 'Split Paid:';
                  return 'Cash Paid:';
                };

                const totalPaid = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

                return (
                  <>
                    {rows.length === 0 ? (
                      <div className="text-[10px] text-gray-500">No payment recorded yet. Use the panel on the right to add Cash, UPI, Card, or Split entries.</div>
                    ) : rows.map((row, idx) => (
                      <div key={idx} className="space-y-0.5 text-sm">
                        <div className="flex justify-between">
                          <span>{labelFor(row.method)}</span>
                          <span>{fmt(row.amount)}</span>
                        </div>
                        {row.reference ? (
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>{String(row.method || 'Payment')} Ref:</span>
                            <span>{row.reference}</span>
                          </div>
                        ) : null}
                      </div>
                    ))}
                    <div className="flex justify-between text-sm mt-2 font-bold">
                      <span>Total Amount Paid:</span>
                      <span>{fmt(totalPaid || fallbackAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Change Due:</span>
                      <span>{fmt(Math.max(0, (totalPaid || fallbackAmount) - Math.round(billGrandTotal)))}</span>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="text-center text-xs text-gray-400 py-4 border-t border-dashed border-gray-300 mt-4">
              Thank you! Visit Again!
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4 text-sm space-y-2">
            <div className="flex justify-between text-gray-400"><span>Subtotal</span><span className="text-white">{fmt(billSubtotal)}</span></div>
            <div className="flex justify-between text-gray-400"><span>Discount</span><span className="text-red-400">-{fmt(discount)}</span></div>
            <div className="flex justify-between text-gray-400"><span>GST (5%)</span><span className="text-white">{fmt(billGST)}</span></div>
            <div className="flex justify-between font-black text-base border-t border-[#2a2a2a] pt-2">
              <span className="text-white">Grand Total</span>
              <span className="text-orange-400">{fmt(billGrandTotal)}</span>
            </div>
            <div className="border-t border-[#2a2a2a] pt-2 space-y-1">
              <div className="flex justify-between text-gray-400"><span>Paid Amount</span><span className="text-white">{fmt(activeSession?.paidAmount || invoice?.paidAmount || 0)}</span></div>
              <div className="flex justify-between font-bold"><span className="text-gray-400">Balance</span><span className="text-green-400">{fmt(Math.max(0, billGrandTotal - (activeSession?.paidAmount || invoice?.paidAmount || 0)))}</span></div>
            </div>
          </div>

          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4 space-y-3">
            <div className="text-white font-bold text-sm">Record Payment</div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: 'Cash', icon: <IndianRupee size={14} />, label: 'Cash' },
                { id: 'UPI', icon: <Smartphone size={14} />, label: 'UPI' },
                { id: 'Card', icon: <CreditCard size={14} />, label: 'Card' },
                { id: 'Split', icon: <span className="text-[13px] font-black leading-none">%</span>, label: 'Split' },
              ].map(m => (
                <button key={m.id} onClick={() => setPaymentMode(m.id)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-bold border transition-colors ${paymentMode === m.id
                    ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                    : 'border-[#252525] text-gray-500 hover:border-[#333] hover:text-gray-300'
                    }`} style={{ background: paymentMode === m.id ? undefined : '#1a1a1a' }}>
                  {m.icon}<span>{m.label}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div className="rounded-xl px-3 py-2.5 border border-[#252525]" style={{ background: '#1a1a1a' }}>
                <div className="text-xs text-gray-500 font-semibold mb-1">Amount</div>
                <input
                  type="number"
                  min={0}
                  value={receivedAmt}
                  onChange={e => setReceivedAmt(e.target.value)}
                  placeholder={String(Math.round(billGrandTotal))}
                  className="w-full bg-transparent text-white text-sm font-bold outline-none"
                />
              </div>
              <div className="rounded-xl px-3 py-2.5 border border-[#252525]" style={{ background: '#1a1a1a' }}>
                <div className="text-xs text-gray-500 font-semibold mb-1">Reference / Note</div>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={e => setPaymentRef(e.target.value)}
                  placeholder={paymentMode === 'Cash' ? 'Cash note' : 'Txn / Last 4 digits'}
                  className="w-full bg-transparent text-white text-sm font-bold outline-none placeholder:text-gray-600"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={recordInvoicePayment}
                disabled={invoicePaymentLoading}
                className="py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
                <Check size={16}/> {invoicePaymentLoading ? 'Saving...' : 'Record Payment'}
              </button>
              <button onClick={handlePrintInvoice}
                className="py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
                <Printer size={16}/> PRINT BILL
              </button>
            </div>
            <button className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"><MessageSquare size={16}/> WHATSAPP BILL</button>
            <button className="w-full py-3 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"><Mail size={16}/> EMAIL BILL</button>
            <button onClick={()=>{resetFlow();setScreen('dashboard');}} className="w-full py-3 border border-[#333] text-gray-300 font-bold rounded-xl text-sm hover:bg-[#1a1a1a] transition-colors">BACK TO DASHBOARD</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Orders History Screen ─────────────────────────────────────
  const filteredHistory = orderHistory.filter(s => {
    const q = orderHistorySearch.toLowerCase();
    const matchQ = !q || s.customerName?.toLowerCase().includes(q)
      || String(s.tableNumber).includes(q)
      || String(s.tokenNumber||'').includes(q);
    const matchF = orderHistoryFilter === 'all'
      || (orderHistoryFilter === 'paid'   && s.status === 'paid')
      || (orderHistoryFilter === 'open'   && s.status === 'open')
      || (orderHistoryFilter === 'held'   && s.status === 'on_hold')
      || (orderHistoryFilter === 'parcel' && s.isParcel);
    return matchQ && matchF;
  });

  const STATUS_STYLE = {
    paid:          'bg-green-500/20 text-green-400',
    open:          'bg-orange-500/20 text-orange-400',
    on_hold:       'bg-yellow-500/20 text-yellow-400',
    bill_pending:  'bg-blue-500/20 text-blue-400',
  };

  const ScreenOrders = (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Order History</h1>
          <p className="text-xs text-gray-500 mt-0.5">{orderHistory.length} orders today</p>
        </div>
        <button onClick={loadOrderHistory} className="text-gray-400 hover:text-orange-400"><RefreshCw size={16}/></button>
      </div>

      {/* Search */}
      <input
        className="input text-sm"
        placeholder="Search by customer, table, token..."
        value={orderHistorySearch}
        onChange={e => setOrderHistorySearch(e.target.value)}
      />

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          ['all',    `All (${orderHistory.length})`],
          ['paid',   `Paid (${orderHistory.filter(s=>s.status==='paid').length})`],
          ['open',   `Open (${orderHistory.filter(s=>s.status==='open').length})`],
          ['held',   `On Hold (${orderHistory.filter(s=>s.status==='on_hold').length})`],
          ['parcel', `Parcel (${orderHistory.filter(s=>s.isParcel).length})`],
        ].map(([v,l]) => (
          <button key={v} onClick={() => setOrderHistoryFilter(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              orderHistoryFilter === v ? 'bg-orange-500 text-white' : 'bg-[#1a1a1a] border border-[#2a2a2a] text-gray-400 hover:text-white'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {/* Orders list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {orderHistoryLoading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"/></div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <UtensilsCrossed size={32} className="mb-3 opacity-30"/>
            <p className="text-sm">No orders found</p>
          </div>
        ) : filteredHistory.map(s => {
          const allItems = s.subOrders?.flatMap(o => o.items || []) || [];
          const exp = expandedOrder === s._id;
          return (
            <div key={s._id} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
              {/* Summary row */}
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#1e1e1e]"
                onClick={() => setExpandedOrder(exp ? null : s._id)}>
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
                  <div>
                    <div className="text-[10px] text-gray-500">TOKEN</div>
                    <div className="text-orange-400 font-black text-base">#{s.tokenNumber || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">TABLE</div>
                    <div className="text-white font-semibold text-sm">{s.tableNumber || (s.isParcel ? 'Parcel' : '—')}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">AMOUNT</div>
                    <div className="text-orange-400 font-bold text-sm">{fmt(s.totalAmount || 0)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${STATUS_STYLE[s.status] || 'bg-gray-500/20 text-gray-400'}`}>
                      {s.status === 'on_hold' ? 'On Hold' : s.status === 'bill_pending' ? 'Bill Pending' : s.status === 'paid' ? 'Paid ✓' : 'Open'}
                    </span>
                    <span className="text-[10px] text-gray-600">{allItems.length} items</span>
                  </div>
                </div>
                <span className={`text-gray-500 text-xs transition-transform ${exp ? 'rotate-180' : ''}`}>▼</span>
              </div>

              {/* Expanded items */}
              {exp && (
                <div className="border-t border-[#2a2a2a] px-4 py-3 space-y-1.5">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                    {s.customerName || 'Walk-in'} · {s.openedAt ? format(new Date(s.openedAt), 'd MMM hh:mm a') : ''}
                  </div>
                  {allItems.length === 0
                    ? <p className="text-xs text-gray-600">No items recorded</p>
                    : allItems.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-white">{item.name}</span>
                        {/* session items use qty + totalPrice (not quantity/item_total) */}
                        <span className="text-gray-400">×{item.qty || item.quantity || 1}
                          <span className="text-orange-300 ml-2">₹{item.totalPrice || item.item_total || 0}</span>
                        </span>
                      </div>
                    ))
                  }
                  {s.status === 'paid' && (
                    <div className="mt-2 pt-2 border-t border-[#2a2a2a] flex justify-between text-xs font-bold">
                      <span className="text-gray-400">Total Paid</span>
                      <span className="text-green-400">{fmt(s.totalAmount || 0)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Screen router ─────────────────────────────────────────────

  const handlePOSAcceptDelivery = async (notif) => {
    try {
      await api.patch(`/kitchen/orders/${notif.orderId}/accept-delivery`);
      removeNotification(notif.id);
      toast.success(`✓ Order collected! Token #${notif.tokenNumber}`);
    } catch (e) { toast.error(e.response?.data?.message || 'Could not accept'); }
  };

  const ScreenNotifications = (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Notifications</h1>
          <p className="text-xs text-gray-500 mt-0.5">{notifs.length} total · auto-clear after 12h</p>
        </div>
        {notifs.length > 0 && (
          <button onClick={() => { clearAll(); }}
            className="text-xs text-gray-400 hover:text-white">Clear All</button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto space-y-3">
        {notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-600">
            <Bell size={36} className="mb-3 opacity-30" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : notifs.map(n => {
          const label = NOTIF_LABELS[n.type] || NOTIF_LABELS.ready;
          const colorMap = { green: 'bg-green-500/10 border-green-500/30', orange: 'bg-orange-500/10 border-orange-500/30', blue: 'bg-blue-500/10 border-blue-500/30' };
          const textMap  = { green: 'text-green-400', orange: 'text-orange-400', blue: 'text-blue-400' };
          return (
          <div key={n.id} className={`rounded-2xl border p-4 transition-all ${
            n.accepted ? 'bg-gray-500/10 border-gray-500/20 opacity-60' : (colorMap[label.color] || colorMap.green)
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-bold ${n.accepted ? 'text-gray-400' : (textMap[label.color] || textMap.green)}`}>
                {label.emoji} {label.text}
              </span>
              <span className="text-[10px] text-gray-600">
                {new Date(n.id).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex gap-3 mb-2">
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-1.5 border border-[#2a2a2a] text-center">
                <div className="text-[10px] text-gray-500">TOKEN</div>
                <div className="text-orange-400 font-black text-base">#{n.tokenNumber || '—'}</div>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-1.5 border border-[#2a2a2a] text-center">
                <div className="text-[10px] text-gray-500">TABLE</div>
                <div className="text-white font-bold text-sm">{n.tableNumber || 'Counter'}</div>
              </div>
              {n.customerName && <div className="self-center text-xs text-gray-400">{n.customerName}</div>}
            </div>
            {!n.accepted && n.orderId && n.type === 'ready' && (
              <button onClick={() => handlePOSAcceptDelivery(n)}
                className="w-full py-2 bg-green-500/20 border border-green-500/40 text-green-400 font-bold text-xs rounded-xl hover:bg-green-500/30 active:scale-95 transition-all">
                ✓ ACCEPT & COLLECT ORDER
              </button>
            )}
            {n.accepted && (
              <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-1">
                <CheckSquare size={11} className="text-green-500" />
                Collected by <span className="text-green-400 font-semibold">{n.acceptedBy}</span>
                {n.acceptedAt && <span>· {new Date(n.acceptedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
  const SCREENS = {
    dashboard:    ScreenDashboard,
    workspace:    ScreenOrderWorkspace,
    customerID:   ScreenCustomerID,
    approvals:    ScreenApprovals,
    parcels:      ScreenParcels,
    billing:      ScreenBilling,
    invoice:      ScreenInvoice,
    orders:       ScreenOrders,
    notifications: ScreenNotifications,
  };

  // ── NAV ────────────────────────────────────────────────────────
  const NAV = [
    { id:'dashboard',  icon:LayoutDashboard, label:'Dashboard'          },
    { id:'tableMap',   icon:MapPin,          label:'Table Map', action:()=>{resetFlow();setScreen('dashboard');} },
    { id:'orders',     icon:UtensilsCrossed, label:'Orders'             },
    { id:'approvals',     icon:CheckSquare,     label:'Approvals',     badge:notifBadge },
    { id:'notifications', icon:Bell,            label:'Notifications', badge:unreadCount },
    { id:'parcels',    icon:Package,         label:'Parcels', badge:stats.parcels },
    { id:'settings',   icon:Settings,        label:'Settings',  action: () => navigate('settings')   },
  ];

  // ═══════════════════════════════════════════════════════════════
  // MAIN LAYOUT
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="flex h-screen bg-[#0f0f0f] overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className={`flex flex-col bg-[#141414] border-r border-[#222] transition-all duration-200 flex-shrink-0 ${sidebarCollapsed?'w-16':'w-52'}`}>
        {/* Logo */}
        <div className={`flex items-center border-b border-[#222] py-4 ${sidebarCollapsed?'justify-center px-2':'gap-2.5 px-4'}`}>
          <div className="w-9 h-9 rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0">
            <Coffee size={18} className="text-orange-400"/>
          </div>
          {!sidebarCollapsed && (
            <div>
              <div className="text-white font-black text-sm leading-none">UTC Café</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{user?.name||'Bill Operator'}</div>
              <div className="text-[9px] text-orange-400 font-bold uppercase">{user?.employee_id||'BOP001'}</div>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto px-2">
          {NAV.map(({id,icon:Icon,label,badge,action})=>(
            <button key={id}
              onClick={()=>{ if(action) action(); else { setScreen(id); if(id==='notifications') markRead(); } }}
              title={sidebarCollapsed?label:''}
              className={`w-full flex items-center rounded-xl transition-colors relative ${sidebarCollapsed?'justify-center px-0 py-2.5':'gap-3 px-3 py-2.5'} ${screen===id?'bg-orange-500/20 text-orange-400':'text-gray-500 hover:text-white hover:bg-[#1e1e1e]'}`}>
              <Icon size={17} className="flex-shrink-0"/>
              {!sidebarCollapsed && <span className="text-xs font-medium">{label}</span>}
              {badge>0 && (
                <span className={`min-w-[18px] h-[18px] bg-orange-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 ${sidebarCollapsed?'absolute -top-1 -right-1':'ml-auto'}`}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Collapse + Logout */}
        <div className="px-2 py-3 border-t border-[#222] space-y-1">
          <button onClick={()=>setSidebarCollapsed(v=>!v)}
            className="w-full flex items-center justify-center rounded-xl py-2 text-gray-600 hover:text-gray-300 hover:bg-[#1e1e1e] transition-colors">
            <ChevronDown size={14} className={`transition-transform ${sidebarCollapsed?'-rotate-90':'rotate-90'}`}/>
          </button>
          <button onClick={logout}
            className={`w-full flex items-center rounded-xl py-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors ${sidebarCollapsed?'justify-center':'gap-3 px-3'}`}>
            <LogOut size={15}/>
            {!sidebarCollapsed && <span className="text-xs font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#141414] border-b border-[#222]">
          <div className="text-white font-bold text-sm">
            {screen==='dashboard'?'Table Map — Ground Floor': NAV.find(n=>n.id===screen)?.label||'POS Staff'}
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-sm">
              {user?.name?.[0]||'U'}
            </div>
          </div>
        </div>
        {/* Screen */}
        <div className="flex-1 overflow-hidden">
          {SCREENS[screen]||ScreenDashboard}
        </div>
      </main>

      {/* Table picker modal */}
      {showTablePicker && (
        <TablePickerModal
          onClose={()=>setShowTablePicker(false)}
          onSelect={handleTableSelect}
        />
      )}

      {/* UPI QR payment modal */}
      {showQRModal && activeSession && (
        <QRPaymentModal
          session={activeSession}
          franchise={franchiseInfo}
          onClose={()=>setShowQRModal(false)}
          onPaymentComplete={()=>{
            setShowQRModal(false);
            api.get(`/sessions/${activeSession._id}`).then(r=>{
              const updated = r.data.session || r.data;
              setActiveSession(updated);
              setInvoice(updated.invoice || invoice);
              setReceivedAmt('');
              loadStats();
              loadTables();
              toast.success('Payment recorded');
              if (updated?.paymentStatus === 'fully_paid' || updated?.status === 'paid') {
                resetFlow();
                setScreen('dashboard');
              }
            }).catch(()=>{
              toast.success('Payment recorded');
              resetFlow();
              setScreen('dashboard');
            });
          }}
        />
      )}

      {/* Split payment modal */}
      {showSplitModal && activeSession && (
        <SplitPaymentModal
          sessionId={activeSession._id}
          totalAmount={activeSession.totalAmount || 0}
          franchiseId={franchiseId}
          onClose={()=>setShowSplitModal(false)}
          onSuccess={({ invoice: newInvoice, session: newSession })=>{
            setShowSplitModal(false);
            const paidSession = newSession || activeSession;
            setInvoice(newInvoice || invoice);
            setActiveSession(paidSession);
            setReceivedAmt('');
            loadStats();
            loadTables();
            toast.success('Payment recorded');
            if (paidSession?.paymentStatus === 'fully_paid' || paidSession?.status === 'paid') {
              resetFlow();
              setScreen('dashboard');
            }
          }}
        />
      )}

      {/* Secure Delete PIN modal */}
      {showDeletePin && (
        <EditPinModal
          franchiseId={franchiseId}
          onSuccess={(pin) => executeDeleteItem(pin)}
          onClose={() => { setShowDeletePin(false); setPendingDeleteItem(null); }}
        />
      )}

    </div>
  );
}
