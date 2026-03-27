const fetch = require('node-fetch');

/**
 * Extract folder ID from various Google Drive link formats
 */
function extractFolderId(link) {
  // Format: https://drive.google.com/drive/folders/FOLDER_ID
  let match = link.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];

  // Format: https://drive.google.com/open?id=FOLDER_ID
  match = link.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match) return match[1];

  // Direct folder ID
  if (/^[a-zA-Z0-9_-]+$/.test(link)) return link;

  return null;
}

/**
 * List images from a Google Drive folder.
 * Uses OAuth2 access token if available, falls back to API key.
 * Lightweight implementation using node-fetch (no googleapis package).
 */
async function listDriveImages(folderId, { accessToken, apiKey }) {
  const images = [];
  let pageToken = null;

  const query = `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`;
  const fields = 'nextPageToken, files(id, name, mimeType, imageMediaMetadata, thumbnailLink, webContentLink)';

  do {
    const params = new URLSearchParams({
      q: query,
      fields: fields,
      pageSize: '1000',
      orderBy: 'name',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const headers = {};

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else if (apiKey) {
      params.set('key', apiKey);
    } else {
      throw new Error('Cần Google API Key hoặc đăng nhập Google để truy cập Drive');
    }

    // Build URL AFTER adding auth params
    const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('Drive API error:', res.status, errBody);
      throw new Error(`Drive API lỗi: ${res.status}`);
    }

    const data = await res.json();

    for (const file of data.files || []) {
      // Use thumbnailLink from API when available, fallback to drive.google.com/thumbnail
      const thumb = file.thumbnailLink
        ? file.thumbnailLink.replace(/=s\d+/, '=s400')
        : `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`;
      const full = `https://drive.google.com/thumbnail?id=${file.id}&sz=w1600`;
      images.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        thumbnailUrl: thumb,
        fullUrl: full,
        width: file.imageMediaMetadata?.width || 0,
        height: file.imageMediaMetadata?.height || 0,
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return images;
}

/**
 * Refresh a Google access token using a refresh token.
 * Lightweight implementation using node-fetch (no googleapis package).
 */
async function refreshAccessToken(refreshToken) {
  const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.albumonline_GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || process.env.albumonline_GOOGLE_CLIENT_SECRET || '').trim();

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const data = await res.json();
  if (!data.access_token) {
    console.error('Token refresh failed:', data);
    throw new Error('Không thể làm mới access token');
  }
  return data.access_token;
}

module.exports = { extractFolderId, listDriveImages, refreshAccessToken };
