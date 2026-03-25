
const express = require('express');
const crypto = require('crypto');
const { google } = require('googleapis');
const router = express.Router();
const db = require('../db/database');
const { createToken, hashPassword, verifyPassword, requireAuth } = require('../middleware/auth');

// Google OAuth helper
function getGoogleOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = (process.env.APP_URL || 'https://album-nsg.vercel.app').replace(/\/+$/, '');
  if (!clientId || !clientSecret) return null;
  const redirectUri = `${appUrl}/api/auth/google/callback`;
  console.log('Google OAuth redirect_uri:', redirectUri);
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Middleware kiểm tra quyền admin
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ dành cho admin' });
  }
  next();
}

// API: Lấy danh sách user và album (chỉ admin)
router.get('/admin/users', requireAuth, async (req, res) => {
  // Lấy thông tin user hiện tại
  const currentUser = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!currentUser || currentUser.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ dành cho admin' });
  }
  // Lấy danh sách user
  const users = await db.prepare('SELECT id, username, email, display_name, role, created_at FROM users').all();
  // Lấy album của từng user
  const albums = await db.prepare('SELECT id, user_id, title, drive_link, created_at FROM albums').all();
  // Gộp dữ liệu
  const userMap = {};
  users.forEach(u => userMap[u.id] = { ...u, albums: [] });
  albums.forEach(a => { if (userMap[a.user_id]) userMap[a.user_id].albums.push(a); });
  res.json({ users: Object.values(userMap) });
});

// API: Cập nhật thông tin user (chỉ admin)
router.put('/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = req.params.id;
    const { displayName, email, newPassword, role } = req.body;

    // Kiểm tra user tồn tại
    const target = await db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!target) {
      return res.status(404).json({ error: 'Không tìm thấy user' });
    }

    // Validate email nếu có thay đổi
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Email không hợp lệ' });
      }
      const existing = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase(), targetId);
      if (existing) {
        return res.status(409).json({ error: 'Email đã được sử dụng bởi user khác' });
      }
    }

    // Validate mật khẩu mới nếu có
    if (newPassword && newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải ít nhất 6 ký tự' });
    }

    // Validate role nếu có thay đổi
    if (role && !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Quyền không hợp lệ. Chỉ chấp nhận admin hoặc user.' });
    }

    // Không cho phép hạ quyền admin cuối cùng
    if (role === 'user' && target.role === 'admin') {
      const adminCount = await db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get();
      if (adminCount.count <= 1) {
        return res.status(400).json({ error: 'Không thể hạ quyền admin cuối cùng. Hệ thống cần ít nhất 1 admin.' });
      }
    }

    // Cập nhật thông tin cơ bản
    await db.prepare('UPDATE users SET display_name = COALESCE(?, display_name), email = COALESCE(?, email) WHERE id = ?')
      .run(displayName || null, email ? email.toLowerCase() : null, targetId);

    // Cập nhật mật khẩu nếu có
    if (newPassword) {
      const newHash = await hashPassword(newPassword);
      await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, targetId);
    }

    // Cập nhật role nếu có
    if (role) {
      await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);
    }

    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi cập nhật user' });
  }
});

// API: Xóa user (chỉ admin)
router.delete('/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = req.params.id;

    // Không cho phép admin tự xóa chính mình
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'Không thể xóa chính mình' });
    }

    // Kiểm tra user tồn tại
    const target = await db.prepare('SELECT id, username FROM users WHERE id = ?').get(targetId);
    if (!target) {
      return res.status(404).json({ error: 'Không tìm thấy user' });
    }

    // Xóa user (albums sẽ SET NULL theo schema)
    await db.prepare('DELETE FROM users WHERE id = ?').run(targetId);

    res.json({ success: true, message: `Đã xóa user ${target.username}` });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi xóa user' });
  }
});


// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
    }
    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Tên đăng nhập phải từ 3-30 ký tự' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Tên đăng nhập chỉ chứa chữ, số và dấu _' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu phải ít nhất 6 ký tự' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email không hợp lệ' });
    }

    // Check existing
    const existing = await db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username.toLowerCase(), email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'Tên đăng nhập hoặc email đã tồn tại' });
    }

    const userId = crypto.randomUUID().substring(0, 12);
    const passwordHash = await hashPassword(password);

    await db.prepare(`
      INSERT INTO users (id, username, email, password_hash, display_name, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, username.toLowerCase(), email.toLowerCase(), passwordHash, displayName || username, 'user');

    const token = createToken({ id: userId, username: username.toLowerCase(), role: 'user', email: email.toLowerCase() });

    // Gửi email thông báo đăng ký (không block response)
    const siteUrl = `${req.protocol}://${req.get('host')}`;
    const userInfo = { username: username.toLowerCase(), email: email.toLowerCase(), displayName: displayName || username, siteUrl };
    try {
      const { sendRegistrationUserEmail, sendRegistrationAdminEmail } = require('../services/emailService');
      Promise.all([
        sendRegistrationUserEmail(userInfo),
        sendRegistrationAdminEmail(userInfo),
      ]).catch(err => console.error('Registration email error:', err));
    } catch (e) {
      console.error('Email service not available:', e.message);
    }

    res.json({
      success: true,
      token,
      user: { id: userId, username: username.toLowerCase(), email: email.toLowerCase(), displayName: displayName || username }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi đăng ký' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username.toLowerCase(), username.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }

    const token = createToken({ id: user.id, username: user.username, role: user.role, email: user.email });

    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, email: user.email, displayName: user.display_name }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi đăng nhập' });
  }
});

// Get current user info
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await db.prepare('SELECT id, username, email, display_name, google_id, avatar_url, password_hash, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Tài khoản không tồn tại' });
    }

    const albumCount = await db.prepare('SELECT COUNT(*) as count FROM albums WHERE user_id = ?').get(req.user.id);

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      hasGoogle: !!user.google_id,
      hasPassword: !!user.password_hash,
      created_at: user.created_at,
      albumCount: albumCount?.count || 0
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Có lỗi xảy ra' });
  }
});

// Update profile
router.put('/me', requireAuth, async (req, res) => {
  try {
    const { displayName, email } = req.body;

    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Email không hợp lệ' });
      }
      const existing = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase(), req.user.id);
      if (existing) {
        return res.status(409).json({ error: 'Email đã được sử dụng' });
      }
    }

    await db.prepare('UPDATE users SET display_name = COALESCE(?, display_name), email = COALESCE(?, email) WHERE id = ?')
      .run(displayName || null, email ? email.toLowerCase() : null, req.user.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Có lỗi xảy ra' });
  }
});

// Change password
router.put('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'Vui lòng nhập mật khẩu mới' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải ít nhất 6 ký tự' });
    }

    const user = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);

    // If user has a password, verify current password
    if (user.password_hash) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại' });
      }
      const valid = await verifyPassword(currentPassword, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
      }
    }

    const newHash = await hashPassword(newPassword);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Có lỗi xảy ra' });
  }
});

// ===== ADMIN SETTINGS (SMTP) =====

// GET settings (admin only)
router.get('/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { getSmtpSettings } = require('../services/emailService');
    const settings = await getSmtpSettings();
    // Mask password
    if (settings.smtp_pass) {
      settings.smtp_pass_masked = settings.smtp_pass.substring(0, 4) + '****';
    }
    res.json(settings);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Có lỗi xảy ra' });
  }
});

// PUT settings (admin only)
router.put('/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { saveSmtpSettings } = require('../services/emailService');
    await saveSmtpSettings(req.body);
    res.json({ success: true, message: 'Đã lưu cấu hình SMTP' });
  } catch (err) {
    console.error('Save settings error:', err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi lưu cấu hình' });
  }
});

// POST test email (admin only)
router.post('/admin/test-email', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { sendTestEmail } = require('../services/emailService');
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Vui lòng nhập email nhận test' });
    await sendTestEmail(email);
    res.json({ success: true, message: `Đã gửi email test tới ${email}` });
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ error: err.message || 'Gửi email thất bại' });
  }
});

// ===== FORGOT PASSWORD =====

// POST forgot-password: gửi OTP qua email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Vui lòng nhập email' });

    const user = await db.prepare('SELECT id, email FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) {
      // Không tiết lộ user có tồn tại hay không (bảo mật)
      return res.json({ success: true, message: 'Nếu email tồn tại, mã OTP sẽ được gửi.' });
    }

    // Tạo OTP 6 số
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const resetId = crypto.randomUUID().substring(0, 12);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 phút

    // Xoá OTP cũ chưa dùng
    await db.prepare('DELETE FROM password_resets WHERE user_id = ? AND used = 0').run(user.id);

    // Lưu OTP mới
    await db.prepare('INSERT INTO password_resets (id, user_id, otp, expires_at) VALUES (?, ?, ?, ?)').run(resetId, user.id, otp, expiresAt);

    // Gửi email
    const { sendResetOTP } = require('../services/emailService');
    await sendResetOTP(user.email, otp);

    res.json({ success: true, message: 'Mã OTP đã được gửi tới email của bạn.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    if (err.message.includes('Chưa cấu hình')) {
      return res.status(503).json({ error: err.message });
    }
    res.status(500).json({ error: 'Có lỗi xảy ra khi gửi mã OTP' });
  }
});

// POST reset-password: xác minh OTP và đổi mật khẩu
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải ít nhất 6 ký tự' });
    }

    const user = await db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) {
      return res.status(400).json({ error: 'Email không hợp lệ' });
    }

    // Tìm OTP hợp lệ
    const reset = await db.prepare(
      'SELECT * FROM password_resets WHERE user_id = ? AND otp = ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
    ).get(user.id, otp);

    if (!reset) {
      return res.status(400).json({ error: 'Mã OTP không đúng hoặc đã hết hạn' });
    }

    if (new Date(reset.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.' });
    }

    // Đánh dấu OTP đã dùng
    await db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);

    // Đổi mật khẩu
    const newHash = await hashPassword(newPassword);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

    res.json({ success: true, message: 'Đổi mật khẩu thành công! Hãy đăng nhập lại.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi đổi mật khẩu' });
  }
});


// ===== GOOGLE OAUTH =====

// GET /api/auth/google — Redirect to Google consent screen
router.get('/google', (req, res) => {
  const oauth2Client = getGoogleOAuth2Client();
  if (!oauth2Client) {
    return res.redirect('/login?error=google_not_configured');
  }
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  });
  res.redirect(url);
});

// GET /api/auth/google/callback — Handle Google OAuth callback
router.get('/google/callback', async (req, res) => {
  const appUrl = process.env.APP_URL || 'https://album-nsg.vercel.app';
  try {
    const { code } = req.query;
    if (!code) return res.redirect(`${appUrl}/login?error=no_code`);

    const oauth2Client = getGoogleOAuth2Client();
    if (!oauth2Client) return res.redirect(`${appUrl}/login?error=google_not_configured`);

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    const googleId = profile.id;
    const email = (profile.email || '').toLowerCase();
    const displayName = profile.name || email.split('@')[0];
    const avatarUrl = profile.picture || '';

    // Check if user with this google_id already exists
    let user = await db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);

    if (!user && email) {
      // Check if user with same email exists (link Google to existing account)
      user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (user) {
        // Link Google account to existing user
        await db.prepare('UPDATE users SET google_id = ?, avatar_url = COALESCE(avatar_url, ?), google_access_token = ?, google_refresh_token = COALESCE(?, google_refresh_token) WHERE id = ?')
          .run(googleId, avatarUrl, tokens.access_token || '', tokens.refresh_token || null, user.id);
        user.google_id = googleId;
      }
    }

    if (!user) {
      // Create new user from Google profile
      const userId = crypto.randomUUID().substring(0, 12);
      const username = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 30).toLowerCase();

      // Ensure username is unique
      let finalUsername = username;
      let counter = 1;
      while (await db.prepare('SELECT id FROM users WHERE username = ?').get(finalUsername)) {
        finalUsername = `${username.substring(0, 26)}_${counter}`;
        counter++;
      }

      await db.prepare(`
        INSERT INTO users (id, username, email, password_hash, display_name, google_id, google_access_token, google_refresh_token, avatar_url, role)
        VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'user')
      `).run(userId, finalUsername, email, displayName, googleId, tokens.access_token || '', tokens.refresh_token || '', avatarUrl);

      user = { id: userId, username: finalUsername, email, display_name: displayName, role: 'user', google_id: googleId, avatar_url: avatarUrl };
    } else {
      // Update tokens for existing user
      await db.prepare('UPDATE users SET google_access_token = ?, google_refresh_token = COALESCE(?, google_refresh_token), avatar_url = COALESCE(?, avatar_url) WHERE id = ?')
        .run(tokens.access_token || '', tokens.refresh_token || null, avatarUrl, user.id);
    }

    // Create JWT token
    const token = createToken({ id: user.id, username: user.username, role: user.role, email: user.email });
    const userJson = encodeURIComponent(JSON.stringify({
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url || avatarUrl,
    }));

    res.redirect(`${appUrl}/login?google_token=${token}&google_user=${userJson}`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect(`${appUrl}/login?error=oauth_failed`);
  }
});


module.exports = router;

