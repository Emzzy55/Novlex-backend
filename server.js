require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const connectDB = require('./config/db');
const { generalLimiter } = require('./middleware/rateLimiter');
const startDailyEarningsCron = require('./cron/dailyEarnings');

const app = express();
connectDB();

// Bug 22 Fix: Only allow production frontend URL
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://novlex.com.ng',
  'https://www.novlex.com.ng',
  'https://novlex.netlify.app',
].filter(Boolean);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    // Allow exact matches
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow any netlify.app subdomain (for preview deploys)
    if (origin.endsWith('.netlify.app')) return callback(null, true);
    // Allow localhost for admin testing
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    console.warn('CORS blocked origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(mongoSanitize()); // Prevent NoSQL injection
app.use(morgan('dev'));
app.use(generalLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/investments', require('./routes/investment'));
app.use('/api/transactions', require('./routes/transaction'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/announcements', require('./routes/announcement'));
app.use('/api/notifications', require('./routes/notification'));

// Health check - used by UptimeRobot to keep server awake
app.get('/api/health', (req, res) => res.json({ success: true, message: 'Novlex API is running', time: new Date().toISOString() }));

// 404
app.use('*', (req, res) => res.status(404).json({ success: false, message: 'Route not found.' }));

// Global error handler
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }
  console.error(err.stack);
  res.status(err.status || 500).json({ success: false, message: 'Internal server error.' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Novlex server running on port ${PORT}`);
  startDailyEarningsCron();
});
