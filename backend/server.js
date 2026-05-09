const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  },
});

app.set('io', io);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' },
});

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/franchises', require('./routes/franchise'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/kitchen', require('./routes/kitchen'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/loyalty', require('./routes/loyalty'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/token-sessions', require('./routes/tokenSessions'));

app.get('/api/health', (req, res) => res.json({ success: true, status: 'UTC Cafe API running' }));

io.on('connection', (socket) => {
  socket.on('join:franchise', (franchiseId) => {
    socket.join(`franchise:${franchiseId}`);
  });

  socket.on('join:pos', (franchiseId) => {
    socket.join(`pos:${franchiseId}`);
  });

  socket.on('join:kitchen', (franchiseId) => {
    socket.join(`kitchen:${franchiseId}`);
  });

  socket.on('join:display', (franchiseId) => {
    socket.join(`display:${franchiseId}`);
  });

  socket.on('disconnect', () => {});
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('MongoDB connected');
    Order.updateMany(
      { createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, archivedAt: null },
      { $set: { archivedAt: new Date() } }
    ).catch((err) => console.error('Order archive job failed:', err.message));
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
