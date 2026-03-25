

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const archiver = require('archiver');
const crypto = require('crypto');
const db = require('../db/database');
const { extractFolderId, listDriveImages } = require('../services/driveService');
const { optionalAuth, requireAuth } = require('../middleware/auth');


// Cập nhật thông tin album (mật khẩu, thời gian chia sẻ)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const album = await db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
    if (!album) return res.status(404).json({ error: 'Album không tồn tại' });
    if (album.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Không có quyền chỉnh sửa album này' });

    const { title, password, expiresAt } = req.body;
    let updateFields = [];
    let params = [];
    if (typeof title !== 'undefined' && title.trim()) {
      updateFields.push('title = ?');
      params.push(title.trim());
    }
    if (typeof password !== 'undefined') {
      updateFields.push('password = ?');
      params.push(password || null);
    }
    if (typeof expiresAt !== 'undefined') {
      updateFields.push('expires_at = ?');
      params.push(expiresAt ? new Date(expiresAt).toISOString() : null);
    }
    if (updateFields.length === 0) return res.json({ success: true });
    params.push(req.params.id);
    await db.prepare(`UPDATE albums SET ${updateFields.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true });
  } catch (err) {
    console.error('Update album error:', err);
    res.status(500).json({ error: 'Có lỗi khi cập nhật album' });
  }
});

router.post('/:id/download-zip', async (req, res) => {
  try {
    const { photoIds } = req.body;

    // Validate photoIds: chỉ nhận id là chuỗi không rỗng, loại bỏ phần tử không hợp lệ
    const validIds = Array.isArray(photoIds) ? photoIds.filter(id => typeof id === 'string' && id.trim().length > 0) : [];
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'Danh sách ảnh không hợp lệ' });
    }
    const album = await db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
    if (!album) return res.status(404).json({ error: 'Album không tồn tại' });
    const placeholders = validIds.map(() => '?').join(',');
    const photos = await db.prepare('SELECT * FROM photos WHERE album_id = ? AND id IN (' + placeholders + ') ORDER BY sort_order').all(req.params.id, ...validIds);
    if (!photos.length) return res.status(404).json({ error: 'Không tìm thấy ảnh' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="album_${album.id}_photos.zip"`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const photo of photos) {
      try {
        const url = photo.full_url || photo.thumbnail_url;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Không tải được ảnh');
        archive.append(response.body, { name: photo.name || (photo.id + '.jpg') });
      } catch (e) {
        // Bỏ qua ảnh lỗi
      }
    }
    archive.finalize();
  } catch (err) {
    console.error('Download zip error:', err);
    res.status(500).json({ error: 'Có lỗi khi nén file zip' });
  }
});


// Create a new album
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { title, driveLink, password, maxSelections, allowDownload, expiresInDays } = req.body;

    if (!title || !driveLink) {
      return res.status(400).json({ error: 'Tiêu đề và link Google Drive là bắt buộc' });
    }

    const folderId = extractFolderId(driveLink);
    if (!folderId) {
      return res.status(400).json({ error: 'Link Google Drive không hợp lệ' });
    }

    const albumId = crypto.randomUUID().substring(0, 8);
    const userId = req.user ? req.user.id : 'guest_khach';
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
      : null;

    await db.prepare(`
      INSERT INTO albums (id, user_id, title, drive_folder_id, drive_link, password, max_selections, allow_download, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(albumId, userId, title, folderId, driveLink, password || null, maxSelections || 0, allowDownload !== false ? 1 : 0, expiresAt);

    // Try to fetch images from Drive
    const apiKey = process.env.GOOGLE_API_KEY;
    let accessToken = null;
    if (userId) {
      const owner = await db.prepare('SELECT google_access_token, google_refresh_token FROM users WHERE id = ?').get(userId);
      if (owner && owner.google_access_token) {
        accessToken = owner.google_access_token;
        // Try to refresh if we have a refresh token
        if (owner.google_refresh_token) {
          try {
            const { refreshAccessToken } = require('../services/driveService');
            const newToken = await refreshAccessToken(owner.google_refresh_token);
            accessToken = newToken;
            await db.prepare('UPDATE users SET google_access_token = ? WHERE id = ?').run(newToken, userId);
          } catch (e) {
            console.log('Token refresh failed, using existing token:', e.message);
          }
        }
      }
    }
    if (accessToken || apiKey) {
      try {
        const images = await listDriveImages(folderId, { accessToken, apiKey });
        const insertPhoto = db.prepare(`
          INSERT INTO photos (id, album_id, drive_file_id, name, thumbnail_url, full_url, mime_type, width, height, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const [index, photo] of images.entries()) {
          await insertPhoto.run(
            crypto.randomUUID(), albumId, photo.id, photo.name,
            photo.thumbnailUrl, photo.fullUrl, photo.mimeType,
            photo.width, photo.height, index
          );
        }
      } catch (err) {
        console.log('Could not fetch Drive images:', err.message);
      }
    }

    res.json({ success: true, albumId, shareLink: `/album/${albumId}` });
  } catch (err) {
    console.error('Error creating album:', err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi tạo album' });
  }
});

// Get album info
router.get('/:id', async (req, res) => {
  try {
    const album = await db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
    if (!album) {
      return res.status(404).json({ error: 'Album không tồn tại' });
    }

    if (album.expires_at && new Date(album.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Album đã hết hạn', expired: true, expires_at: album.expires_at });
    }

    await db.prepare('UPDATE albums SET view_count = view_count + 1 WHERE id = ?').run(req.params.id);

    const photos = await db.prepare('SELECT * FROM photos WHERE album_id = ? ORDER BY sort_order').all(req.params.id);

    res.json({
      ...album,
      password: album.password ? true : false,
      photos,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra' });
  }
});

// Verify album password
router.post('/:id/verify', async (req, res) => {
  try {
    const album = await db.prepare('SELECT password FROM albums WHERE id = ?').get(req.params.id);
    if (!album) {
      return res.status(404).json({ error: 'Album không tồn tại' });
    }
    if (!album.password || album.password === req.body.password) {
      return res.json({ success: true });
    }
    res.status(401).json({ error: 'Mật khẩu không đúng' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra' });
  }
});

// Refresh album photos from Drive
router.post('/:id/refresh', async (req, res) => {
  try {
    const album = await db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
    if (!album) {
      return res.status(404).json({ error: 'Album không tồn tại' });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    let accessToken = null;
    if (album.user_id) {
      const owner = await db.prepare('SELECT google_access_token, google_refresh_token FROM users WHERE id = ?').get(album.user_id);
      if (owner && owner.google_access_token) {
        accessToken = owner.google_access_token;
        if (owner.google_refresh_token) {
          try {
            const { refreshAccessToken } = require('../services/driveService');
            const newToken = await refreshAccessToken(owner.google_refresh_token);
            accessToken = newToken;
            await db.prepare('UPDATE users SET google_access_token = ? WHERE id = ?').run(newToken, album.user_id);
          } catch (e) {
            console.log('Token refresh failed:', e.message);
          }
        }
      }
    }
    if (!accessToken && !apiKey) {
      return res.status(400).json({ error: 'Cần đăng nhập Google hoặc cấu hình API Key để truy cập Drive' });
    }

    const images = await listDriveImages(album.drive_folder_id, { accessToken, apiKey });

    await db.prepare('DELETE FROM photos WHERE album_id = ?').run(album.id);

    const insertPhoto = db.prepare(`
      INSERT INTO photos (id, album_id, drive_file_id, name, thumbnail_url, full_url, mime_type, width, height, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const [index, photo] of images.entries()) {
      await insertPhoto.run(
        crypto.randomUUID(), album.id, photo.id, photo.name,
        photo.thumbnailUrl, photo.fullUrl, photo.mimeType,
        photo.width, photo.height, index
      );
    }

    res.json({ success: true, count: images.length });
  } catch (err) {
    console.error('Error refreshing album:', err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi làm mới album' });
  }
});

// Select/Deselect photos
router.post('/:id/select', async (req, res) => {
  try {
    const { photoId, clientId, clientName, selected } = req.body;
    const albumId = req.params.id;

    const album = await db.prepare('SELECT * FROM albums WHERE id = ?').get(albumId);
    if (!album) {
      return res.status(404).json({ error: 'Album không tồn tại' });
    }

    if (selected) {
      if (album.max_selections > 0) {
        const count = await db.prepare('SELECT COUNT(*) as count FROM selections WHERE album_id = ? AND client_id = ?')
          .get(albumId, clientId);
        if (count.count >= album.max_selections) {
          return res.status(400).json({ error: `Bạn chỉ được chọn tối đa ${album.max_selections} ảnh` });
        }
      }

      const usePg = !!(process.env.DATABASE_URL || process.env.albumonline_DATABASE_URL || process.env.POSTGRES_URL);
      const insertSql = usePg
        ? 'INSERT INTO selections (album_id, photo_id, client_id, client_name) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING'
        : 'INSERT OR IGNORE INTO selections (album_id, photo_id, client_id, client_name) VALUES (?, ?, ?, ?)';
      await db.prepare(insertSql).run(albumId, photoId, clientId, clientName || 'Khách');
    } else {
      await db.prepare('DELETE FROM selections WHERE album_id = ? AND photo_id = ? AND client_id = ?')
        .run(albumId, photoId, clientId);
    }

    const rows = await db.prepare('SELECT photo_id FROM selections WHERE album_id = ? AND client_id = ?')
      .all(albumId, clientId);
    const selections = rows.map(s => s.photo_id);

    res.json({ success: true, selections });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra' });
  }
});

// Get selections for an album
router.get('/:id/selections', async (req, res) => {
  try {
    const { clientId } = req.query;
    const albumId = req.params.id;

    const rows = await db.prepare('SELECT photo_id FROM selections WHERE album_id = ? AND client_id = ?')
      .all(albumId, clientId || '');
    const selections = rows.map(s => s.photo_id);

    const allSelections = await db.prepare(`
      SELECT s.photo_id, s.client_name, s.selected_at
      FROM selections s WHERE s.album_id = ?
      ORDER BY s.selected_at
    `).all(albumId);

    res.json({ mySelections: selections, allSelections });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra' });
  }
});

// Delete album
router.delete('/:id', async (req, res) => {
  try {
    await db.prepare('DELETE FROM selections WHERE album_id = ?').run(req.params.id);
    await db.prepare('DELETE FROM photos WHERE album_id = ?').run(req.params.id);
    await db.prepare('DELETE FROM albums WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra' });
  }
});

// List albums (filter by user if authenticated)
router.get('/', optionalAuth, async (req, res) => {
  try {
    let albums;
    if (req.user) {
      albums = await db.prepare(`
        SELECT a.*, COUNT(p.id) as photo_count,
          (SELECT thumbnail_url FROM photos WHERE album_id = a.id ORDER BY sort_order LIMIT 1) as cover_photo
        FROM albums a LEFT JOIN photos p ON a.id = p.album_id
        WHERE a.user_id = ?
        GROUP BY a.id
        ORDER BY a.created_at DESC
      `).all(req.user.id);
    } else {
      albums = await db.prepare(`
        SELECT a.*, COUNT(p.id) as photo_count,
          (SELECT thumbnail_url FROM photos WHERE album_id = a.id ORDER BY sort_order LIMIT 1) as cover_photo
        FROM albums a LEFT JOIN photos p ON a.id = p.album_id
        WHERE a.user_id = 'guest_khach'
        GROUP BY a.id
        ORDER BY a.created_at DESC
      `).all();
    }
    // Nếu cover_photo null thì lấy ảnh đầu tiên trong album (nếu có)
    for (const album of albums) {
      if (!album.cover_photo) {
        const firstPhoto = await db.prepare('SELECT thumbnail_url FROM photos WHERE album_id = ? ORDER BY sort_order LIMIT 1').get(album.id);
        album.cover_photo = firstPhoto ? firstPhoto.thumbnail_url : null;
      }
    }
    res.json(albums);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra' });
  }
});

module.exports = router;
