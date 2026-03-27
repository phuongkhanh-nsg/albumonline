# AlbumOnline - Chia sẻ Album ảnh từ Google Drive

> Tạo album ảnh đẹp mắt từ link Google Drive. Chia sẻ cho khách hàng lọc và chọn ảnh dễ dàng.

**Phiên bản hiện tại: v2.0.0** | [Xem Changelog](#changelog)

## Tính năng

- 🔗 Tạo album từ link Google Drive folder
- 🖼️ Gallery responsive với lightbox xem ảnh lớn
- ✅ Chế độ lọc/chọn ảnh cho khách hàng
- 📥 Tải ảnh đã chọn dưới dạng ZIP
- 🔒 Bảo mật album bằng mật khẩu
- ⏰ Cài đặt thời hạn album
- 📱 Tương thích mọi thiết bị
- 👤 Hệ thống tài khoản (đăng ký / đăng nhập)
- 🔐 Đăng nhập Google OAuth 2.0
- 🔑 Quên mật khẩu qua OTP email
- 👑 Quản lý thành viên & album (Admin)
- ⚙️ Cấu hình SMTP email (Admin)
- 🔝 Nút scroll-to-top trên tất cả trang

## Tech Stack

- **Backend:** Node.js, Express 5
- **Database:** SQLite (local) / PostgreSQL (production)
- **Frontend:** Vanilla HTML/CSS/JS
- **API:** Google Drive API v3
- **Auth:** JWT + Google OAuth 2.0
- **Email:** Nodemailer (SMTP)
- **Deploy:** Vercel (serverless) / Render (container)

## Cài đặt Local

```bash
npm install
cp .env.example .env
# Cấu hình các biến môi trường trong .env
npm run dev
```

Truy cập: http://localhost:3000

## Biến môi trường

| Biến | Mô tả |
|------|--------|
| `PORT` | Port server (mặc định: 3000) |
| `GOOGLE_API_KEY` | Google Drive API key |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret key cho JWT token |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `GOOGLE_CALLBACK_URL` | Google OAuth callback URL |

## Cấu trúc dự án

```
albumonline/
├── public/              # Frontend tĩnh
│   ├── css/
│   │   ├── style.css    # CSS chính
│   │   └── admin.css    # CSS cho trang admin/manage
│   ├── js/
│   │   └── utils.js     # Shared utilities (API, auth, navbar, toast...)
│   ├── index.html       # Trang chủ
│   ├── album.html       # Xem album
│   ├── create.html      # Tạo album mới
│   ├── manage.html      # Quản lý album
│   ├── login.html       # Đăng nhập
│   ├── register.html    # Đăng ký
│   ├── account.html     # Quản lý tài khoản
│   ├── forgot-password.html  # Quên mật khẩu
│   ├── admin-users.html      # Quản lý thành viên
│   └── admin-settings.html   # Cấu hình hệ thống
├── routes/              # API routes
│   ├── auth.js          # Auth endpoints
│   └── albums.js        # Album endpoints
├── api/                 # Serverless API handlers
├── db/                  # Database config
├── services/            # Business logic
├── scripts/             # CLI scripts
├── server.js            # Express server
├── render.yaml          # Render deployment config
└── vercel.json          # Vercel deployment config
```

## Cấp quyền Admin

1. **Local**: `node scripts/set-admin-local.js <email_hoặc_username>`
2. **Production**: Truy cập `/api/set-admin` (cần cấu hình email trong `api/set-admin.js`)

## Deploy

### Vercel
1. Push code lên GitHub
2. Import project trên [Vercel](https://vercel.com)
3. Cấu hình biến môi trường
4. Deploy tự động

### Render
1. Push code lên GitHub
2. New → Blueprint → Chọn repo GitHub
3. Render sẽ tạo web service + PostgreSQL từ `render.yaml`
4. Thêm biến môi trường trong Dashboard

---

## Changelog

### v2.0.0 (2026-03-27)
**Tối ưu code & refactor**
- ♻️ Tách navbar toggle JS ra `utils.js` — loại bỏ trùng lặp trong 10 trang HTML
- ♻️ Tách inline CSS ra `admin.css` — gom ~850 dòng CSS từ 4 trang vào 1 file chung
- ♻️ Gộp hàm `escapeHtml` trùng lặp vào `utils.js`
- 🗑️ Xóa `avatar.png` (1.6MB) — thay bằng CSS placeholder
- 🗑️ Xóa `og-image.svg` — không sử dụng
- 📝 Cập nhật README.md với thông tin phiên bản, cấu trúc dự án, và changelog

### v1.3.0 (2026-03-27)
- 🔝 Thêm nút scroll-to-top trên tất cả trang
- 🔒 Bảo vệ tài khoản super admin khỏi bị xóa/sửa role
- 🔒 Bảo vệ tài khoản guest khỏi bị xóa
- 🔐 Tự động đăng xuất khi đóng trình duyệt

### v1.2.0 (2026-03-24)
- 🔑 Tính năng quên mật khẩu qua OTP email
- ⚙️ Trang cấu hình SMTP cho admin
- ✏️ Chỉnh sửa album (tiêu đề, mật khẩu, hạn sử dụng) từ trang quản lý
- 📄 Phân trang (30/trang) cho quản lý album và thành viên

### v1.1.0 (2026-03-24)
- 👑 Trang quản lý thành viên cho Admin (xem, sửa, xóa user)
- ✏️ Admin có thể chỉnh sửa/xóa album của bất kỳ user nào

### v1.0.0 (2026-03-23)
- 🚀 Ra mắt phiên bản đầu tiên
- 🔗 Tạo album từ Google Drive folder
- 🖼️ Gallery responsive với lightbox
- ✅ Chế độ lọc/chọn ảnh cho khách hàng
- 📥 Tải ảnh đã chọn (ZIP)
- 🔒 Bảo mật album bằng mật khẩu & thời hạn
- 👤 Đăng ký / đăng nhập
- 🔐 Google OAuth 2.0
