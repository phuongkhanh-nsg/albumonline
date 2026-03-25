const db = require('../db/database');

const emailOrUsername = process.argv[2];

if (!emailOrUsername) {
  console.log('Sử dụng: node scripts/set-admin-local.js <email_hoặc_username>');
  process.exit(1);
}

try {
  const result = db.prepare(`UPDATE users SET role='admin' WHERE email=? OR username=?`).run(emailOrUsername, emailOrUsername);
  if (result.changes > 0) {
    console.log(`✅ Thành công! Đã cấp quyền admin cho: ${emailOrUsername}`);
  } else {
    console.log(`❌ Không tìm thấy user nào với email hoặc username là: ${emailOrUsername}`);
  }
} catch (err) {
  console.error('Lỗi khi cập nhật:', err.message);
}
