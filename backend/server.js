require('dotenv').config();
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

connectDB();

// Trust the first proxy in front of Express (required on Railway/Render/Heroku).
// Without this, session cookies with secure:true are silently dropped because
// Express sees the connection as HTTP (the TLS terminates at the reverse proxy).
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));

// Support comma-separated origins in FRONTEND_URL so you can whitelist
// both the Vercel preview URL and the production URL without redeploying.
// e.g.  FRONTEND_URL=https://seodashboard-fullstack-pydx.vercel.app,http://localhost:5173
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin "${origin}" is not allowed.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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

app.use(session({
  secret: process.env.SESSION_SECRET || 'seo-audit-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    // secure:true requires HTTPS — set only in production.
    // Works because app.set('trust proxy', 1) is above.
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    // 'lax' allows the session cookie to be sent when Google redirects back
    // to the callback URL (a cross-site navigation, not a cross-site POST).
    sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax',
    // Session only needs to outlast the OAuth round-trip (~30 s).
    // Keeping it at 24 h is fine for robustness.
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
