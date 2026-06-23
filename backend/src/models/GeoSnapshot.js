const mongoose = require('mongoose');

// Unified geo data per website per day.
// Merges GA4 country/city traffic + GSC country search data.
const GeoSnapshotSchema = new mongoose.Schema(
  {
    websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
    date:      { type: Date, required: true },

    countries: [
      {
        countryCode: { type: String },  // ISO 3166-1 alpha-2 (e.g. "US", "GB")
        country:     { type: String },  // Display name

        // From GA4
        sessions:    { type: Number, default: 0 },
        users:       { type: Number, default: 0 },
        pageViews:   { type: Number, default: 0 },
        bounceRate:  { type: Number, default: 0 },
        newUsers:    { type: Number, default: 0 },

        // From GSC
        clicks:      { type: Number, default: 0 },
        impressions: { type: Number, default: 0 },
        ctr:         { type: Number, default: 0 },
        position:    { type: Number, default: 0 },

        // Computed growth vs previous snapshot
        sessionsChange:    { type: Number },
        clicksChange:      { type: Number },
        impressionsChange: { type: Number },

        _id: false,
      },
    ],

    cities: [
      {
        city:        { type: String },
        countryCode: { type: String },
        country:     { type: String },

        // From GA4
        sessions:    { type: Number, default: 0 },
        users:       { type: Number, default: 0 },
        pageViews:   { type: Number, default: 0 },

        // From GSC
        clicks:      { type: Number, default: 0 },
        impressions: { type: Number, default: 0 },

        _id: false,
      },
    ],

    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

GeoSnapshotSchema.index({ websiteId: 1, date: -1 }, { unique: true });
GeoSnapshotSchema.index({ userId: 1, date: -1 });
GeoSnapshotSchema.index({ date: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 395 });

module.exports = mongoose.model('GeoSnapshot', GeoSnapshotSchema);
