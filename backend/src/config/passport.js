const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select('-password');
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',
        scope: [
          'profile',
          'email',
          'https://www.googleapis.com/auth/analytics.readonly',
          'https://www.googleapis.com/auth/webmasters.readonly',
        ],
        accessType: 'offline',
        prompt: 'consent',
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const existingUser = await User.findOne({ googleId: profile.id });

          if (existingUser) {
            existingUser.google.accessToken = accessToken;
            if (refreshToken) existingUser.google.refreshToken = refreshToken;
            existingUser.google.expiresAt = new Date(Date.now() + 3600 * 1000);
            await existingUser.save();
            return done(null, existingUser);
          }

          // Check if user exists with same email
          const emailUser = await User.findOne({
            email: profile.emails?.[0]?.value,
          });

          if (emailUser) {
            emailUser.googleId = profile.id;
            emailUser.google = {
              accessToken,
              refreshToken: refreshToken || emailUser.google?.refreshToken,
              expiresAt: new Date(Date.now() + 3600 * 1000),
              connectedAt: new Date(),
              email: profile.emails?.[0]?.value,
            };
            await emailUser.save();
            return done(null, emailUser);
          }

          const newUser = await User.create({
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails?.[0]?.value,
            avatar: profile.photos?.[0]?.value,
            google: {
              accessToken,
              refreshToken,
              expiresAt: new Date(Date.now() + 3600 * 1000),
              connectedAt: new Date(),
              email: profile.emails?.[0]?.value,
            },
          });

          return done(null, newUser);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );
}

module.exports = passport;
