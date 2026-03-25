# AlbumOnline - Chia sẻ Album ảnh từ Google Drive

Tạo album ảnh đẹp mắt từ link Google Drive. Chia sẻ cho khách hàng lọc và chọn ảnh dễ dàng.

## Tính năng

- 🔗 Tạo album từ link Google Drive folder
- 🖼️ Gallery responsive với lightbox xem ảnh lớn
- ✅ Chế độ lọc/chọn ảnh cho khách hàng
- 🔒 Bảo mật album bằng mật khẩu
- ⏰ Cài đặt thời hạn album
- 📱 Tương thích mọi thiết bị

## Cài đặt Local

```bash
npm install
cp .env.example .env
# Thêm GOOGLE_API_KEY vào .env
npm run dev
```

Truy cập: http://localhost:3000

## Deploy lên Render

1. Push code lên GitHub
2. Vào [Render Dashboard](https://dashboard.render.com)
3. New → Blueprint → Chọn repo GitHub
4. Render sẽ tự tạo web service + PostgreSQL database từ `render.yaml`
5. Thêm biến môi trường `GOOGLE_API_KEY` trong Render Dashboard

## Biến môi trường

| Biến | Mô tả |
|------|--------|
| `PORT` | Port server (mặc định: 3000) |
| `GOOGLE_API_KEY` | Google Drive API key |
| `DATABASE_URL` | PostgreSQL connection string (tự động trên Render) |

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** SQLite (local) / PostgreSQL (production)
- **Frontend:** Vanilla HTML/CSS/JS
- **API:** Google Drive API v3

## Cấp quyền Admin cho tài khoản

1. **Local (Máy tính của bạn)**: Để phân quyền admin cho một tài khoản (email hoặc username):
   ```bash
   node scripts/set-admin-local.js <email_hoặc_username>
   ```
2. **Production (Vercel/Render)**: Truy cập đường dẫn `/api/set-admin` (Lưu ý: cần sửa cứng email của bạn trong `api/set-admin.js` trước khi deploy).

## Cách đưa code lên GitHub

Để lưu trữ code và chuẩn bị deploy, bạn cần đẩy code lên GitHub theo các bước:

1. Trong Terminal (cmd/powershell), gõ:
   ```bash
   git add .
   git commit -m "Cập nhật và sửa lỗi"
   ```
2. Truy cập [GitHub](https://github.com/) và tạo một Repository mới.
3. Liên kết với Repository vừa tạo và đẩy code lên:
   ```bash
   git branch -M main
   git remote add origin https://github.com/TEN_CUA_BAN/albumonline.git
   git push -u origin main
   ```
   *(Thay thế đường dẫn bằng link thực tế của repo bạn vừa tạo)*
