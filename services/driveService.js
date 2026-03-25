const { google } = require('googleapis');

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
 */
async function listDriveImages(folderId, { accessToken, apiKey }) {
  let drive;

  if (accessToken) {
    const oauth2 = new google.auth.OAuth2();
    oauth2.setCredentials({ access_token: accessToken });
    drive = google.drive({ version: 'v3', auth: oauth2 });
  } else if (apiKey) {
    drive = google.drive({ version: 'v3', auth: apiKey });
  } else {
    throw new Error('Cần Google API Key hoặc đăng nhập Google để truy cập Drive');
  }

  const images = [];
  let pageToken = null;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, imageMediaMetadata, thumbnailLink, webContentLink)',
      pageSize: 1000,
      orderBy: 'name',
      pageToken: pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    for (const file of res.data.files || []) {
      images.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        thumbnailUrl: `https://lh3.googleusercontent.com/d/${file.id}=w400`,
        fullUrl: `https://lh3.googleusercontent.com/d/${file.id}=w1600`,
        width: file.imageMediaMetadata?.width || 0,
        height: file.imageMediaMetadata?.height || 0,
      });
    }

    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return images;
}

/**
 * Refresh a Google access token using a refresh token
 */
async function refreshAccessToken(refreshToken) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID || process.env.albumonline_GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET || process.env.albumonline_GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2.refreshAccessToken();
  return credentials.access_token;
}

module.exports = { extractFolderId, listDriveImages, refreshAccessToken };
