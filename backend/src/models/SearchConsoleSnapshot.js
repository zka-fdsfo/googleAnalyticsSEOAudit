const mongoose = require('mongoose');

const SearchConsoleSnapshotSchema = new mongoose.Schema(
  {
    websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },

    date: { type: Date, required: true },

    // ── Overview (28-day aggregate) ───────────────────────────────────────
    overview: {
      clicks:      { type: Number, default: 0 },
      impressions: { type: Number, default: 0 },
      ctr:         { type: Number, default: 0 },
      position:    { type: Number, default: 0 },
    },

    // ── Daily timeseries (last 28 days) ───────────────────────────────────
    timeseries: [{
      date:        String,
      clicks:      Number,
      impressions: Number,
      ctr:         Number,
      position:    Number,
      _id: false,
    }],

    // ── Top keywords (up to 500) ──────────────────────────────────────────
    topKeywords: [{
      query:       String,
      clicks:      Number,
      impressions: Number,
      ctr:         Number,
      position:    Number,
      _id: false,
    }],

    // ── Top pages ─────────────────────────────────────────────────────────
    topPages: [{
      page:        String,
      clicks:      Number,
      impressions: Number,
      ctr:         Number,
      position:    Number,
      _id: false,
    }],

    devices: [{
      device:      String,
      clicks:      Number,
      impressions: Number,
      ctr:         Number,
      position:    Number,
      _id: false,
    }],

    countries: [{
      country:     String,
      clicks:      Number,
      impressions: Number,
      _id: false,
    }],

    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

SearchConsoleSnapshotSchema.index({ websiteId: 1, date: -1 }, { unique: true });
SearchConsoleSnapshotSchema.index({ userId: 1, date: -1 });
SearchConsoleSnapshotSchema.index({ date: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 395 });

module.exports = mongoose.model('SearchConsoleSnapshot', SearchConsoleSnapshotSchema);
