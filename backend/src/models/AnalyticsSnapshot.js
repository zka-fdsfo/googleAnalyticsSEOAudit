const mongoose = require('mongoose');

// Stores a full GA4 data snapshot for a website.
// One snapshot = one day's data collection covering the past 30 days.
// Historical trends are built by querying multiple snapshots' overview fields.
const AnalyticsSnapshotSchema = new mongoose.Schema(
  {
    websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },

    // Date this snapshot was captured (day granularity — time stripped)
    date:      { type: Date, required: true },

    // ── Overview (aggregated for last 30 days from snapshot date) ─────────
    overview: {
      users:              { type: Number, default: 0 },
      newUsers:           { type: Number, default: 0 },
      returningUsers:     { type: Number, default: 0 },
      sessions:           { type: Number, default: 0 },
      engagedSessions:    { type: Number, default: 0 },
      bounceRate:         { type: Number, default: 0 },
      engagementRate:     { type: Number, default: 0 },
      avgSessionDuration: { type: Number, default: 0 },
      pageViews:          { type: Number, default: 0 },
      pagesPerSession:    { type: Number, default: 0 },
      conversions:        { type: Number, default: 0 },
      conversionRate:     { type: Number, default: 0 },
      totalEvents:        { type: Number, default: 0 },
    },

    // ── Conversion events (top key events from GA4) ───────────────────────
    conversionEvents: [{
      eventName:   String,
      eventCount:  Number,
      conversions: Number,
      _id: false,
    }],

    // ── Daily breakdown for trend charts (last 30 days) ───────────────────
    timeseries: [{
      date:      String,
      sessions:  Number,
      users:     Number,
      pageViews: Number,
      _id: false,
    }],

    // ── Breakdowns ────────────────────────────────────────────────────────
    trafficSources: [{
      channel:  String,
      sessions: Number,
      users:    Number,
      _id: false,
    }],

    topPages: [{
      path:       String,
      title:      String,
      pageViews:  Number,
      users:      Number,
      bounceRate: Number,
      _id: false,
    }],

    devices: [{
      device:   String,
      sessions: Number,
      users:    Number,
      _id: false,
    }],

    countries: [{
      country:  String,
      sessions: Number,
      users:    Number,
      _id: false,
    }],

    // ── Extended dimensions (collected in v2) ─────────────────────────────
    landingPages: [{
      path:       String,
      sessions:   Number,
      users:      Number,
      bounceRate: Number,
      _id: false,
    }],

    exitPages: [{
      path:      String,
      exits:     Number,
      pageViews: Number,
      _id: false,
    }],

    browsers: [{
      browser:  String,
      sessions: Number,
      users:    Number,
      _id: false,
    }],

    cities: [{
      city:     String,
      country:  String,
      sessions: Number,
      users:    Number,
      _id: false,
    }],

    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// One snapshot per website per day
AnalyticsSnapshotSchema.index({ websiteId: 1, date: -1 }, { unique: true });
AnalyticsSnapshotSchema.index({ userId: 1, date: -1 });

// TTL: auto-delete snapshots older than 13 months
AnalyticsSnapshotSchema.index({ date: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 395 });

module.exports = mongoose.model('AnalyticsSnapshot', AnalyticsSnapshotSchema);
