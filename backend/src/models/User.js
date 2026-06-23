const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    password: {
      type: String,
      minlength: 6,
      select: false,
    },
    avatar: { type: String },
    googleId: { type: String, sparse: true },

    google: {
      accessToken: { type: String, select: false },
      refreshToken: { type: String, select: false },
      expiresAt: { type: Date },
      connectedAt: { type: Date },
      email: { type: String },
      analytics: {
        propertyId: { type: String },
        propertyName: { type: String },
        measurementId: { type: String },
      },
      searchConsole: {
        siteUrl: { type: String },
        siteName: { type: String },
      },
    },

    isGoogleConnected: { type: Boolean, default: false },
    auditCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.pre('save', function (next) {
  this.isGoogleConnected = !!(this.google?.refreshToken || this.google?.accessToken);
  next();
});

UserSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    avatar: this.avatar,
    isGoogleConnected: this.isGoogleConnected,
    google: this.google
      ? {
          email: this.google.email,
          connectedAt: this.google.connectedAt,
          analytics: this.google.analytics,
          searchConsole: this.google.searchConsole,
        }
      : null,
    auditCount: this.auditCount,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', UserSchema);
