const { validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const { getTokenInfo } = require('../utils/googleAuth');
const { listGA4Accounts, listGA4Properties } = require('../services/googleAnalyticsService');
const { listSearchConsoleSites } = require('../services/searchConsoleService');

const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    const user = await User.create({ name, email, password });
    const token = generateToken(user._id);
    res.status(201).json({ message: 'Account created successfully.', token, user: user.toPublicJSON() });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password +google');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const token = generateToken(user._id);
    res.json({ message: 'Login successful.', token, user: user.toPublicJSON() });
  } catch (err) {
    next(err);
  }
};

const getMe = async (req, res) => {
  const user = await User.findById(req.user._id).select(
    '+google.email +google.connectedAt +google.analytics +google.searchConsole'
  );
  res.json({ user: user.toPublicJSON() });
};

const googleCallback = async (req, res) => {
  try {
    const token = generateToken(req.user._id);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Trigger property discovery in background — don't block the redirect
    const user = await User.findById(req.user._id)
      .select('+google.accessToken +google.refreshToken +google.expiresAt');
    if (user?.isGoogleConnected) {
      const { discoverWebsites } = require('../services/websiteService');
      discoverWebsites(user).catch((err) =>
        console.error('[OAuth] Property discovery failed:', err.message)
      );
    }

    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  } catch {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
};

const updateGoogleSettings = async (req, res, next) => {
  try {
    const { analyticsPropertyId, analyticsPropertyName, searchConsoleSiteUrl } = req.body;
    const user = await User.findById(req.user._id);
    if (analyticsPropertyId) {
      user.google = user.google || {};
      user.google.analytics = { propertyId: analyticsPropertyId, propertyName: analyticsPropertyName || '' };
    }
    if (searchConsoleSiteUrl) {
      user.google = user.google || {};
      user.google.searchConsole = { siteUrl: searchConsoleSiteUrl };
    }
    await user.save();
    res.json({ message: 'Google settings updated.', user: user.toPublicJSON() });
  } catch (err) {
    next(err);
  }
};

const disconnectGoogle = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    user.googleId = undefined;
    user.google = undefined;
    user.isGoogleConnected = false;
    await user.save();
    res.json({ message: 'Google account disconnected.' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/google/debug
 * Comprehensive check of OAuth token, granted scopes, and API connectivity.
 */
const getGoogleDebug = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      '+google.accessToken +google.refreshToken +google.expiresAt +google.email'
    );

    const result = {
      connected:       user?.isGoogleConnected || false,
      hasAccessToken:  !!user?.google?.accessToken,
      hasRefreshToken: !!user?.google?.refreshToken,
      tokenExpiresAt:  user?.google?.expiresAt || null,
      tokenExpired:    user?.google?.expiresAt ? user.google.expiresAt < new Date() : null,
      googleEmail:     user?.google?.email || null,
      tokenInfo:       null,
      searchConsole:   { status: 'skipped', siteCount: 0, sites: [], error: null },
      analytics:       { status: 'skipped', accountCount: 0, propertyCount: 0, properties: [], error: null },
    };

    if (!user?.isGoogleConnected) {
      return res.json(result);
    }

    // ── 1. Verify token + read granted scopes ─────────────────────────────
    result.tokenInfo = await getTokenInfo(user);

    // ── 2. Test Search Console API ────────────────────────────────────────
    try {
      const sites = await listSearchConsoleSites(user);
      result.searchConsole = { status: 'ok', siteCount: sites.length, sites, error: null };
    } catch (err) {
      result.searchConsole = {
        status:    'error',
        siteCount: 0,
        sites:     [],
        error:     err.message,
        hint:      getHint('searchconsole', err),
      };
    }

    // ── 3. Test Analytics Admin + Data APIs ───────────────────────────────
    try {
      const [accounts, properties] = await Promise.all([
        listGA4Accounts(user),
        listGA4Properties(user),
      ]);
      result.analytics = {
        status:        'ok',
        accountCount:  accounts.length,
        propertyCount: properties.length,
        properties:    properties.slice(0, 10),
        error:         null,
      };
    } catch (err) {
      result.analytics = {
        status:        'error',
        accountCount:  0,
        propertyCount: 0,
        properties:    [],
        error:         err.message,
        hint:          getHint('analytics', err),
      };
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
};

const getHint = (service, err) => {
  const msg = err.message || '';
  if (msg.includes('disabled') || msg.includes('has not been used') || msg.includes('SERVICE_DISABLED')) {
    return service === 'analytics'
      ? 'Enable "Google Analytics Admin API" and "Google Analytics Data API" in Google Cloud Console → APIs & Services → Library.'
      : 'Enable "Google Search Console API" in Google Cloud Console → APIs & Services → Library.';
  }
  if (msg.includes('invalid_grant') || msg.includes('Token has been expired')) {
    return 'Your Google session has expired. Go to Settings and reconnect your Google account.';
  }
  if (msg.includes('insufficient authentication') || msg.includes('403')) {
    return 'The OAuth consent screen may be missing required scopes. Disconnect and reconnect your Google account to re-grant permissions.';
  }
  if (msg.includes('quota')) {
    return 'API quota exceeded. Wait a few minutes and try again.';
  }
  return null;
};

module.exports = {
  register,
  login,
  getMe,
  googleCallback,
  updateGoogleSettings,
  disconnectGoogle,
  getGoogleDebug,
};
