const fetch = require('node-fetch');
const crypto = require('crypto');

module.exports = async (req, res) => {
  const appUrl = (process.env.APP_URL || 'https://album-nsg.vercel.app').trim().replace(/\/+$/, '');

  try {
    // Parse query params
    const url = new URL(req.url, `https://${req.headers.host}`);
    const code = url.searchParams.get('code');

    if (!code) {
      res.writeHead(302, { Location: `${appUrl}/login?error=no_code` });
      return res.end();
    }

    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    const redirectUri = `${appUrl}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      res.writeHead(302, { Location: `${appUrl}/login?error=google_not_configured` });
      return res.end();
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      console.error('Google token exchange failed:', tokens);
      res.writeHead(302, { Location: `${appUrl}/login?error=oauth_failed` });
      return res.end();
    }

    // Get user profile from Google
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

    const googleId = profile.id;
    const email = (profile.email || '').toLowerCase();
    const displayName = profile.name || email.split('@')[0];
    const avatarUrl = profile.picture || '';

    // Connect to database
    const db = require('../db/database');
    await db.ready;

    // Find or create user
    let user = await db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);

    if (!user && email) {
      user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (user) {
        await db.prepare('UPDATE users SET google_id = ?, avatar_url = COALESCE(avatar_url, ?), google_access_token = ?, google_refresh_token = COALESCE(?, google_refresh_token) WHERE id = ?')
          .run(googleId, avatarUrl, tokens.access_token || '', tokens.refresh_token || null, user.id);
      }
    }

    if (!user) {
      const userId = crypto.randomUUID().substring(0, 12);
      let username = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 30).toLowerCase();

      let finalUsername = username;
      let counter = 1;
      while (await db.prepare('SELECT id FROM users WHERE username = ?').get(finalUsername)) {
        finalUsername = `${username.substring(0, 26)}_${counter}`;
        counter++;
      }

      await db.prepare(
        'INSERT INTO users (id, username, email, password_hash, display_name, google_id, google_access_token, google_refresh_token, avatar_url, role) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)'
      ).run(userId, finalUsername, email, displayName, googleId, tokens.access_token || '', tokens.refresh_token || '', avatarUrl, 'user');

      user = { id: userId, username: finalUsername, email, display_name: displayName, role: 'user', avatar_url: avatarUrl };
    } else {
      await db.prepare('UPDATE users SET google_access_token = ?, google_refresh_token = COALESCE(?, google_refresh_token), avatar_url = COALESCE(?, avatar_url) WHERE id = ?')
        .run(tokens.access_token || '', tokens.refresh_token || null, avatarUrl, user.id);
    }

    // Create JWT
    const { createToken } = require('../middleware/auth');
    const token = createToken({ id: user.id, username: user.username, role: user.role, email: user.email });

    const userJson = encodeURIComponent(JSON.stringify({
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url || avatarUrl,
    }));

    res.writeHead(302, { Location: `${appUrl}/login?google_token=${token}&google_user=${userJson}` });
    res.end();
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.writeHead(302, { Location: `${appUrl}/login?error=oauth_failed` });
    res.end();
  }
};
