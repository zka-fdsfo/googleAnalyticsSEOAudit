const { google } = require('googleapis');
const User = require('../models/User');

/**
 * Creates an authenticated Google OAuth2 client for a user.
 * - Passes expiry_date so googleapis knows when to auto-refresh
 * - Listens to the 'tokens' event and persists new tokens to MongoDB
 */
const createOAuth2Client = (user) => {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
  );

  client.setCredentials({
    access_token:  user.google?.accessToken  || null,
    refresh_token: user.google?.refreshToken || null,
    expiry_date:   user.google?.expiresAt?.getTime?.() || null,
    token_type:    'Bearer',
  });

  // Persist refreshed tokens back to DB so the next request has a valid token
  client.on('tokens', (tokens) => {
    const update = {};
    if (tokens.access_token)  update['google.accessToken']  = tokens.access_token;
    if (tokens.refresh_token) update['google.refreshToken'] = tokens.refresh_token;
    if (tokens.expiry_date)   update['google.expiresAt']    = new Date(tokens.expiry_date);

    if (Object.keys(update).length > 0) {
      User.findByIdAndUpdate(user._id, { $set: update }).catch((err) =>
        console.error('[GoogleAuth] Failed to persist refreshed tokens:', err.message)
      );
    }
  });

  return client;
};

/**
 * Calls Google's tokeninfo endpoint to verify the access token and read granted scopes.
 * Falls back to refreshing the token if the current one is expired.
 */
const getTokenInfo = async (user) => {
  const client = createOAuth2Client(user);

  const tryTokenInfo = async (token) => {
    const res = await client.getTokenInfo(token);
    return {
      valid: true,
      scopes: res.scopes || [],
      email: res.email,
      expiresIn: res.expiry_date
        ? Math.round((res.expiry_date - Date.now()) / 1000)
        : null,
    };
  };

  try {
    return await tryTokenInfo(user.google?.accessToken);
  } catch {
    // Token might be expired — attempt a refresh first
    try {
      const { credentials } = await client.refreshAccessToken();
      return { ...(await tryTokenInfo(credentials.access_token)), refreshed: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }
};

module.exports = { createOAuth2Client, getTokenInfo };
