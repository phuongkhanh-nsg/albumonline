const nodemailer = require('nodemailer');
const db = require('../db/database');

// Get SMTP settings from database
async function getSmtpSettings() {
  const keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'];
  const settings = {};
  for (const key of keys) {
    const row = await db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    settings[key] = row ? row.value : null;
  }
  return settings;
}

// Save SMTP settings to database
async function saveSmtpSettings(settings) {
  const usePg = !!(process.env.DATABASE_URL || process.env.albumonline_DATABASE_URL || process.env.POSTGRES_URL);
  for (const [key, value] of Object.entries(settings)) {
    if (key.startsWith('smtp_')) {
      const insertSql = usePg
        ? 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value'
        : 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)';
      await db.prepare(insertSql).run(key, value || null);
    }
  }
}

// Create transporter from DB settings
async function createTransporter() {
  const settings = await getSmtpSettings();
  if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_pass) {
    throw new Error('Chưa cấu hình email SMTP. Vui lòng liên hệ admin.');
  }
  return nodemailer.createTransport({
    host: settings.smtp_host,
    port: parseInt(settings.smtp_port) || 587,
    secure: parseInt(settings.smtp_port) === 465,
    auth: {
      user: settings.smtp_user,
      pass: settings.smtp_pass,
    },
  });
}

// Send password reset OTP
async function sendResetOTP(email, otp) {
  const transporter = await createTransporter();
  const settings = await getSmtpSettings();
  const fromName = settings.smtp_from || 'AlbumOnline';

  await transporter.sendMail({
    from: `"${fromName}" <${settings.smtp_user}>`,
    to: email,
    subject: '🔑 Mã OTP đặt lại mật khẩu - AlbumOnline',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #1a1a2e; color: #e2e8f0; border-radius: 16px; overflow: hidden; border: 1px solid #2d3748;">
        <div style="background: linear-gradient(135deg, #e53e3e, #ff6b6b); padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; color: #fff;">📸 AlbumOnline</h1>
          <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Đặt lại mật khẩu</p>
        </div>
        <div style="padding: 32px 24px;">
          <p style="margin: 0 0 16px; font-size: 15px;">Xin chào,</p>
          <p style="margin: 0 0 24px; font-size: 15px;">Bạn đã yêu cầu đặt lại mật khẩu. Mã OTP của bạn là:</p>
          <div style="background: #16213e; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px; border: 1px solid #2d3748;">
            <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #ff6b6b;">${otp}</span>
          </div>
          <p style="margin: 0 0 8px; font-size: 13px; color: #a0aec0;">⏰ Mã OTP có hiệu lực trong <strong style="color: #ed8936;">10 phút</strong>.</p>
          <p style="margin: 0; font-size: 13px; color: #a0aec0;">Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
        </div>
        <div style="padding: 16px 24px; background: rgba(0,0,0,0.2); text-align: center; font-size: 12px; color: #718096;">
          © ${new Date().getFullYear()} AlbumOnline — Chia sẻ Album ảnh từ Google Drive
        </div>
      </div>
    `,
  });
}

// Send test email
async function sendTestEmail(toEmail) {
  const transporter = await createTransporter();
  const settings = await getSmtpSettings();
  const fromName = settings.smtp_from || 'AlbumOnline';

  await transporter.sendMail({
    from: `"${fromName}" <${settings.smtp_user}>`,
    to: toEmail,
    subject: '✅ Test Email - AlbumOnline',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #1a1a2e; color: #e2e8f0; border-radius: 16px; overflow: hidden; border: 1px solid #2d3748;">
        <div style="background: linear-gradient(135deg, #48bb78, #38a169); padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; color: #fff;">✅ Email Test Thành Công!</h1>
        </div>
        <div style="padding: 32px 24px; text-align: center;">
          <p style="font-size: 16px;">Cấu hình SMTP đã hoạt động tốt.</p>
          <p style="font-size: 14px; color: #a0aec0;">Bạn có thể sử dụng tính năng quên mật khẩu qua email.</p>
        </div>
      </div>
    `,
  });
}

// Send registration success email to user
async function sendRegistrationUserEmail({ username, email, displayName, siteUrl }) {
  const transporter = await createTransporter();
  const settings = await getSmtpSettings();
  const fromName = settings.smtp_from || 'AlbumOnline';
  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const loginUrl = siteUrl ? `${siteUrl}/login` : '/login';

  await transporter.sendMail({
    from: `"${fromName}" <${settings.smtp_user}>`,
    to: email,
    subject: '🎉 Chào mừng bạn đến với AlbumOnline!',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #1a1a2e; color: #e2e8f0; border-radius: 16px; overflow: hidden; border: 1px solid #2d3748;">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 28px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; color: #fff;">📸 AlbumOnline</h1>
          <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Đăng ký tài khoản thành công!</p>
        </div>
        <div style="padding: 32px 24px;">
          <p style="margin: 0 0 16px; font-size: 15px;">Xin chào <strong style="color: #a78bfa;">${displayName || username}</strong>,</p>
          <p style="margin: 0 0 24px; font-size: 15px;">Tài khoản của bạn đã được tạo thành công. Dưới đây là thông tin tài khoản:</p>
          <div style="background: #16213e; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #2d3748;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-size: 13px; color: #a0aec0; width: 120px;">👤 Tên đăng nhập</td>
                <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #e2e8f0;">${username}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-size: 13px; color: #a0aec0;">📧 Email</td>
                <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #e2e8f0;">${email}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-size: 13px; color: #a0aec0;">🏷️ Tên hiển thị</td>
                <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #e2e8f0;">${displayName || username}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-size: 13px; color: #a0aec0;">📅 Ngày đăng ký</td>
                <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #e2e8f0;">${now}</td>
              </tr>
            </table>
          </div>
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${loginUrl}" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 8px; letter-spacing: 0.5px;">🔑 Đăng nhập ngay</a>
          </div>
          <p style="margin: 0 0 8px; font-size: 13px; color: #a0aec0;">Hoặc truy cập link: <a href="${loginUrl}" style="color: #a78bfa; text-decoration: underline;">${loginUrl}</a></p>
          <p style="margin: 0; font-size: 13px; color: #718096;">Nếu bạn không thực hiện đăng ký này, vui lòng liên hệ quản trị viên.</p>
        </div>
        <div style="padding: 16px 24px; background: rgba(0,0,0,0.2); text-align: center; font-size: 12px; color: #718096;">
          © ${new Date().getFullYear()} AlbumOnline — Chia sẻ Album ảnh từ Google Drive
        </div>
      </div>
    `,
  });
}

// Send registration notification email to all admins
async function sendRegistrationAdminEmail({ username, email, displayName }) {
  const transporter = await createTransporter();
  const settings = await getSmtpSettings();
  const fromName = settings.smtp_from || 'AlbumOnline';
  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  // Get all admin emails
  const admins = await db.prepare("SELECT email FROM users WHERE role = 'admin' AND email IS NOT NULL").all();
  if (!admins || admins.length === 0) return;

  const adminEmails = admins.map(a => a.email).filter(Boolean);
  if (adminEmails.length === 0) return;

  await transporter.sendMail({
    from: `"${fromName}" <${settings.smtp_user}>`,
    to: adminEmails.join(', '),
    subject: `👤 Thành viên mới đăng ký: ${username} - AlbumOnline`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #1a1a2e; color: #e2e8f0; border-radius: 16px; overflow: hidden; border: 1px solid #2d3748;">
        <div style="background: linear-gradient(135deg, #ed8936, #dd6b20); padding: 28px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; color: #fff;">📸 AlbumOnline</h1>
          <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Thông báo thành viên mới</p>
        </div>
        <div style="padding: 32px 24px;">
          <p style="margin: 0 0 16px; font-size: 15px;">Xin chào Admin,</p>
          <p style="margin: 0 0 24px; font-size: 15px;">Có một thành viên mới vừa đăng ký tài khoản trên hệ thống:</p>
          <div style="background: #16213e; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #2d3748;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-size: 13px; color: #a0aec0; width: 120px;">👤 Tên đăng nhập</td>
                <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #e2e8f0;">${username}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-size: 13px; color: #a0aec0;">📧 Email</td>
                <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #e2e8f0;">${email}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-size: 13px; color: #a0aec0;">🏷️ Tên hiển thị</td>
                <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #e2e8f0;">${displayName || username}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-size: 13px; color: #a0aec0;">📅 Thời gian</td>
                <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #e2e8f0;">${now}</td>
              </tr>
            </table>
          </div>
          <p style="margin: 0; font-size: 13px; color: #a0aec0;">Bạn có thể quản lý thành viên tại trang <strong style="color: #ed8936;">Admin Users</strong>.</p>
        </div>
        <div style="padding: 16px 24px; background: rgba(0,0,0,0.2); text-align: center; font-size: 12px; color: #718096;">
          © ${new Date().getFullYear()} AlbumOnline — Chia sẻ Album ảnh từ Google Drive
        </div>
      </div>
    `,
  });
}

module.exports = { getSmtpSettings, saveSmtpSettings, sendResetOTP, sendTestEmail, sendRegistrationUserEmail, sendRegistrationAdminEmail };
