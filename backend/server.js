// Suppress punycode deprecation warning from dependencies
const originalEmitWarning = process.emitWarning;
process.emitWarning = function(warning, ...args) {
  if (typeof warning === 'string' && warning.includes('punycode')) {
    return; // Suppress punycode deprecation warnings
  }
  return originalEmitWarning.apply(process, [warning, ...args]);
};

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const sanitize = require('./middleware/sanitize');
require('./utils/checkEnv')();

// FRONTEND_URL may hold several origins separated by commas.
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean);

const app = express();
app.set('trust proxy', 1); // correct client IPs (rate limits) behind Render, Railway, nginx and similar
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// Import routes
const authRoutes = require('./routes/auth');
const societyRoutes = require('./routes/societies');
const visitorRoutes = require('./routes/visitors');
const publicPassRoutes = require('./routes/publicPass');
const deliveryRoutes = require('./routes/deliveries');
const vehicleRoutes = require('./routes/vehicles');
const noticeRoutes = require('./routes/notices');
const complaintRoutes = require('./routes/complaints');
const paymentRoutes = require('./routes/payments');
const bookingRoutes = require('./routes/bookings');
const userRoutes = require('./routes/users');
const uploadRoutes = require('./routes/uploads');
const pushRoutes = require('./routes/push');
const serviceRoutes = require('./routes/services');
const serviceRequestRoutes = require('./routes/serviceRequests');
const communityRoutes = require('./routes/community');
const emergencyRoutes = require('./routes/emergency');
const dailyHelpRoutes = require('./routes/dailyHelp');
const expenseRoutes = require('./routes/expenses');
const documentRoutes = require('./routes/documents');
const electionRoutes = require('./routes/elections');
const facilityRoutes = require('./routes/facility');
const rosterRoutes = require('./routes/roster');
const guardRoutes = require('./routes/guards');
const nearbyRoutes = require('./routes/nearby');
const manualRoutes = require('./routes/manual');

// Middleware
app.use(helmet());
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(sanitize);

// Rate limiting. The app makes several calls per page, so the general limit is generous;
// sign-in and password endpoints get a much tighter one.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down and try again shortly.' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many attempts. Please wait 15 minutes and try again.' }
});
['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/otp'].forEach((path) => app.use(path, authLimiter));

// Socket.io connection handling
// Only signed-in users may connect, and each can only join their own room.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Not authorized'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('_id isActive isApproved');
    if (!user || !user.isActive) return next(new Error('Not authorized'));
    socket.userId = String(user._id);
    next();
  } catch (e) {
    next(new Error('Not authorized'));
  }
});

io.on('connection', (socket) => {
  // The room is decided by the verified token, never by what the client asks for.
  socket.join(`user-${socket.userId}`);
  socket.on('join-room', () => {}); // kept so older clients do not error
});

// Make io available to routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/societies', societyRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/public', publicPassRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/service-requests', serviceRequestRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/daily-help', dailyHelpRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/elections', electionRoutes);
app.use('/api/facility', facilityRoutes);
app.use('/api/roster', rosterRoutes);
app.use('/api/guards', guardRoutes);
app.use('/api/nearby', nearbyRoutes);
app.use('/api/manual', manualRoutes);

// Uploaded images (used only when Cloudinary is not configured). Images must be loadable from the frontend's origin.
app.use('/uploads', express.static(require('path').join(__dirname, 'uploads'), {
  maxAge: '7d',
  index: false,
  setHeaders: (res) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('X-Content-Type-Options', 'nosniff');
  }
}));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Nivora API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  res.status(status).json({
    success: false,
    message: status < 500 || !isProd ? err.message || 'Something went wrong' : 'Something went wrong',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Connect to MongoDB and start listening. Skipped when the file is imported (for example by tests),
// so the app can be loaded and exercised without a database.
const start = () => {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mygate', {
    serverSelectionTimeoutMS: 10000 // fail fast with a clear message instead of hanging
  })
  .then(() => {
    console.log('MongoDB connected successfully');
  
    const PORT = process.env.PORT || 5000;
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    require('./utils/dailyHelpMail').startDailyCodeMail(); // the new gate QR is mailed to daily help each morning
  })
  .catch((error) => {
    console.error('\nMongoDB connection error:', error.message);
    const uri = process.env.MONGODB_URI || '';
    if (!uri) {
      console.error('Hint: MONGODB_URI is not set. Create backend/.env (copy .env.example) and set it.');
    } else if (/bad auth|authentication failed/i.test(error.message)) {
      console.error('Hint: wrong database username or password. If the password has special characters (@ : / ? # %), URL-encode them.');
    } else if (/ENOTFOUND|querySrv|ETIMEOUT|ECONNREFUSED|Server selection timed out|whitelist|IP/i.test(error.message)) {
      console.error('Hint: cannot reach the database. For MongoDB Atlas, open Network Access and allow your current IP address (or 0.0.0.0/0 while testing).');
    }
    process.exit(1);
  });

};

if (require.main === module) start();

module.exports = { app, io, httpServer, start };
