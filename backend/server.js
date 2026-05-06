const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();
const Order = require('./models/Order');

const app = express();
const server = http.createServer(app);
const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://utc-cafe.vercel.app',
];

const normalizeOrigin = (value) => {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, '');
  }
};

const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => normalizeOrigin(origin.trim()))
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([
  ...defaultOrigins,
  ...configuredOrigins,
]));

const corsOptions = {
  origin(origin, callback) {
    // Non-browser clients like curl and Render health checks do not send Origin.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
};

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});

// Make io accessible in routes
app.set('io', io);

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// ─── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/franchises', require('./routes/franchise'));
app.use('/api/menu',       require('./routes/menu'));
app.use('/api/orders',     require('./routes/orders'));
app.use('/api/customers',  require('./routes/customers'));
app.use('/api/kitchen',    require('./routes/kitchen'));
app.use('/api/dashboard',  require('./routes/dashboard'));
app.use('/api/invoices',   require('./routes/invoices'));
app.use('/api/loyalty',    require('./routes/loyalty'));
app.use('/api/staff',      require('./routes/staff'));

app.get('/api/health', (req, res) => res.json({ status: 'UTC Café API running ✓' }));

// ─── Socket.io ──────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  // Kitchen staff joins a franchise-specific room
  socket.on('join:franchise', (franchiseId) => {
    socket.join(`franchise:${franchiseId}`);
  });

  // POS staff joins the same room to receive kitchen status updates
  socket.on('join:pos', (franchiseId) => {
    socket.join(`pos:${franchiseId}`);
  });

  socket.on('disconnect', () => {});
});

// ─── Error Handler ──────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// ─── DB + Start ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('✓ MongoDB connected');
    Order.updateMany(
      { createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, archivedAt: null },
      { $set: { archivedAt: new Date() } }
    ).catch((err) => console.error('Order archive job failed:', err.message));
    server.listen(PORT, () => console.log(`✓ Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('✗ MongoDB connection failed:', err.message);
    process.exit(1);
  });
