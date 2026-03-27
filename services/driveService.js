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
 * List images from a public Google Drive folder without API credentials.
 * Fetches the folder page HTML and extracts file IDs from it.
 */
async function listDriveImagesPublic(folderId) {
  const images = [];

  // Fetch the public folder page
  const url = `https://drive.google.com/embeddedfolderview?id=${folderId}#grid`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`Cannot access Drive folder: ${res.status}`);
  }

  const html = await res.text();

  // Extract file entries from the embedded folder view
  // Pattern: data-id="FILE_ID" ... data-target="FILE_URL"
  const idPattern = /\bdata-id="([a-zA-Z0-9_-]{10,})"/g;
  const fileIds = new Set();
  let match;
  while ((match = idPattern.exec(html)) !== null) {
    fileIds.add(match[1]);
  }

  // Also try to extract from flip- entries which contain image IDs
  const flipPattern = /\bflip-entry-id="([a-zA-Z0-9_-]{10,})"/g;
  while ((match = flipPattern.exec(html)) !== null) {
    fileIds.add(match[1]);
  }

  // Also try extracting from various JS data patterns in the page
  const jsPattern = /\["([a-zA-Z0-9_-]{20,})"(?:,|\])/g;
  while ((match = jsPattern.exec(html)) !== null) {
    // Filter to likely file IDs (they're typically 28-44 chars)
    if (match[1].length >= 20 && match[1].length <= 60) {
      fileIds.add(match[1]);
    }
  }

  // Remove the folder ID itself from results
  fileIds.delete(folderId);

  let sortIndex = 0;
  for (const fileId of fileIds) {
    images.push({
      id: fileId,
      name: `image_${sortIndex + 1}.jpg`,
      mimeType: 'image/jpeg',
      thumbnailUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`,
      fullUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`,
      width: 0,
      height: 0,
    });
    sortIndex++;
  }

  return images;
}

/**
 * List images from a Google Drive folder.
 * Uses OAuth2 access token if available, falls back to API key,
 * then falls back to public folder scraping.
 * Lightweight implementation using node-fetch (no googleapis package).
 */
async function listDriveImages(folderId, { accessToken, apiKey }) {
  // If no credentials at all, try public folder method
  if (!accessToken && !apiKey) {
    console.log('No API key or access token, trying public folder method...');
    return await listDriveImagesPublic(folderId);
  }

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
    }

    // Build URL AFTER adding auth params
    const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('Drive API error:', res.status, errBody);
      // If API fails with auth error, fallback to public method
      if (res.status === 401 || res.status === 403) {
        console.log('API auth failed, falling back to public folder method...');
        return await listDriveImagesPublic(folderId);
      }
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

  // If API returned 0 images, try public method as last resort
  if (images.length === 0) {
    console.log('API returned 0 images, trying public folder method...');
    try {
      return await listDriveImagesPublic(folderId);
    } catch (e) {
      console.log('Public folder method also failed:', e.message);
    }
  }

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

module.exports = { extractFolderId, listDriveImages, listDriveImagesPublic, refreshAccessToken };
