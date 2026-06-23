const express = require('express');
const passport = require('passport');
const { body } = require('express-validator');
const {
  register,
  login,
  getMe,
  googleCallback,
  updateGoogleSettings,
  disconnectGoogle,
  getGoogleDebug,
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register new user
 * @access  Public
 */
router.post(
  '/register',
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
  ],
  register
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
  ],
  login
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticate, getMe);

/**
 * @route   GET /api/auth/google
 * @desc    Google OAuth login
 * @access  Public
 */
router.get(
  '/google',
  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/webmasters.readonly',
    ],
    accessType: 'offline',
    prompt: 'consent',
  })
);

/**
 * @route   GET /api/auth/google/callback
 * @desc    Google OAuth callback
 * @access  Public
 */
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_failed` }),
  googleCallback
);

/**
 * @route   PUT /api/auth/google/settings
 * @desc    Update Google Analytics / Search Console settings
 * @access  Private
 */
router.put('/google/settings', authenticate, updateGoogleSettings);

/**
 * @route   DELETE /api/auth/google/disconnect
 * @desc    Disconnect Google account
 * @access  Private
 */
router.delete('/google/disconnect', authenticate, disconnectGoogle);

/**
 * @route   GET /api/auth/google/debug
 * @desc    Full OAuth + API connectivity diagnostic
 * @access  Private
 */
router.get('/google/debug', authenticate, getGoogleDebug);

module.exports = router;
