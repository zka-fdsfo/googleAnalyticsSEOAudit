require('dotenv').config();

const dns =require('dns');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');
const cookieParser = require('cookie-parser');

const connectDB = require('./src/config/db');
require('./src/config/passport');

const authRoutes = require('./src/routes/auth');
const auditRoutes = require('./src/routes/audit');
const analyticsRoutes = require('./src/routes/analytics');
const searchConsoleRoutes = require('./src/routes/searchConsole');
const websiteRoutes  = require('./src/routes/websites');
const gscDebugRoutes = require('./src/routes/gscDebug');
const localSeoRoutes = require('./src/routes/localSeo');
const { errorHandler } = require('./src/middleware/errorHandler');
const { startScheduler } = require('./src/jobs/scheduler');

const app = express();

dns.setServers(['8.8.8.8', '8.8.4.4']);

connectDB();

app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000000000000000000000000000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// app.use(session({
//   secret: process.env.SESSION_SECRET || 'seo-audit-session-secret',
//   resave: false,
//   saveUninitialized: false,
//   cookie: {
//     secure: process.env.NODE_ENV === 'production',
//     httpOnly: true,
//     maxAge: 24 * 60 * 60 * 1000,
//   },
// }));

app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production'
      ? 'none'
      : 'lax',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

app.use(passport.initialize());
app.use(passport.session());

app.use('/api/auth', authRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/search-console', searchConsoleRoutes);
app.use('/api/websites', websiteRoutes);
app.use('/api/debug/gsc', gscDebugRoutes);
// Local SEO & Maps Ranking — completely independent from GA4 / GSC
app.use('/api/local-seo/:websiteId', localSeoRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', version: '1.0.0', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 SEO Audit API running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}\n`);
  startScheduler();
});

module.exports = app;
