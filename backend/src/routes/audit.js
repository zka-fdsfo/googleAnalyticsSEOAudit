const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { startAudit, getAudit, getAuditHistory, deleteAudit } = require('../controllers/auditController');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Only throttle audit creation (POST), not status polling (GET)
const auditLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  keyGenerator: (req) => req.ip,
  message: { error: 'Audit limit reached. You can run up to 30 audits per hour. Please wait before analyzing another URL.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @route   POST /api/audit
 * @desc    Start a new SEO audit
 * @access  Public (optional auth for history tracking)
 */
router.post(
  '/',
  auditLimiter,
  optionalAuth,
  [body('url').trim().notEmpty().withMessage('URL is required.')],
  startAudit
);

/**
 * @route   GET /api/audit/history
 * @desc    Get user's audit history
 * @access  Private
 */
router.get('/history', authenticate, getAuditHistory);

/**
 * @route   GET /api/audit/:id
 * @desc    Get audit by ID (poll for status)
 * @access  Public
 */
router.get('/:id', getAudit);

/**
 * @route   DELETE /api/audit/:id
 * @desc    Delete an audit
 * @access  Private
 */
router.delete('/:id', authenticate, deleteAudit);

module.exports = router;
