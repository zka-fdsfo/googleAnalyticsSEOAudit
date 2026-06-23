const mongoose = require('mongoose');

const WebsiteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    domain: { type: String, required: true, trim: true },  // e.g. "example.com"
    displayName: { type: String, trim: true },              // user-friendly label
    favicon: { type: String },

    // ── Google Search Console ─────────────────────────────────────────────
    gsc: {
      siteUrl:         { type: String },  // exact URL from sites.list() — never user-typed
      propertyType:    { type: String, enum: ['URL_PREFIX', 'DOMAIN', null], default: null },
      permissionLevel: { type: String },  // siteOwner / siteFullUser / siteRestrictedUser
      isVerifiedOwner: { type: Boolean, default: false },
    },

    // ── Google Analytics 4 ───────────────────────────────────────────────
    ga4: {
      propertyId:   { type: String },
      propertyName: { type: String },
      accountId:    { type: String },
      accountName:  { type: String },
      measurementId:{ type: String },
    },

    // ── Sync state ───────────────────────────────────────────────────────
    isDefault:     { type: Boolean, default: false },
    lastSyncedAt:  { type: Date },
    syncStatus:    { type: String, enum: ['idle', 'syncing', 'error', 'never'], default: 'never' },
    syncError:     { type: String },
    nextSyncAt:    { type: Date },
  },
  { timestamps: true }
);

// One default website per user
WebsiteSchema.index({ userId: 1, isDefault: 1 });
WebsiteSchema.index({ userId: 1, domain: 1 }, { unique: true });

// Ensure only one default per user
WebsiteSchema.statics.setDefault = async function (userId, websiteId) {
  await this.updateMany({ userId }, { $set: { isDefault: false } });
  await this.findByIdAndUpdate(websiteId, { $set: { isDefault: true } });
};

module.exports = mongoose.model('Website', WebsiteSchema);
