const mongoose = require('mongoose');

/**
 * Google Business Profile integration.
 * Requires OAuth scope: https://www.googleapis.com/auth/business.manage
 * This scope must be added to the Google OAuth consent screen and passport config
 * when GBP integration is enabled.
 */
const GBPSnapshotSchema = new mongoose.Schema({
  date: Date,
  // Impressions
  searchViews: { type: Number, default: 0 },   // from Google Search
  mapsViews:   { type: Number, default: 0 },   // from Google Maps
  totalViews:  { type: Number, default: 0 },
  // Actions
  websiteClicks:   { type: Number, default: 0 },
  phoneCalls:      { type: Number, default: 0 },
  directionRequests:{ type: Number, default: 0 },
  messages:        { type: Number, default: 0 },
  bookings:        { type: Number, default: 0 },
  // Reviews
  totalReviews: { type: Number, default: 0 },
  avgRating:    { type: Number, default: 0 },
  newReviews:   { type: Number, default: 0 },
  // Photos
  businessPhotoViews:  { type: Number, default: 0 },
  customerPhotoViews:  { type: Number, default: 0 },
  businessPhotoCount:  { type: Number, default: 0 },
  customerPhotoCount:  { type: Number, default: 0 },
  // Search queries
  topQueries: [{
    query:       String,
    impressions: Number,
    _id: false,
  }],
  fetchedAt: Date,
}, { _id: false });

const BusinessProfileSchema = new mongoose.Schema(
  {
    websiteId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true, unique: true },
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },

    // GBP account info
    accountId:    { type: String },
    locationId:   { type: String },
    businessName: { type: String },
    address:      { type: String },
    phone:        { type: String },
    website:      { type: String },
    category:     { type: String },
    isVerified:   { type: Boolean, default: false },

    // Current snapshot
    latest: GBPSnapshotSchema,

    // Historical (last 12 months, daily)
    history: [GBPSnapshotSchema],

    isConnected:  { type: Boolean, default: false },
    lastSyncedAt: { type: Date },
    syncError:    { type: String },
  },
  { timestamps: true }
);

BusinessProfileSchema.index({ userId: 1 });

module.exports = mongoose.model('BusinessProfile', BusinessProfileSchema);