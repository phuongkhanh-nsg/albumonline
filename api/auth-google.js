const fetch = require('node-fetch');

module.exports = async (req, res) => {
  try {
    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    const appUrl = (process.env.APP_URL || 'https://album-nsg.vercel.app').trim().replace(/\/+$/, '');

    if (!clientId || !clientSecret) {
      return res.writeHead(302, { Location: `${appUrl}/login?error=google_not_configured` }).end();
    }

    const redirectUri = `${appUrl}/api/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
    });

    res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
    res.end();
  } catch (err) {
    console.error('Google OAuth init error:', err);
    const appUrl = (process.env.APP_URL || 'https://album-nsg.vercel.app').trim().replace(/\/+$/, '');
    res.writeHead(302, { Location: `${appUrl}/login?error=oauth_failed` });
    res.end();
  }
};
