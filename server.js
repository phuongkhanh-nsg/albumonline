require('dotenv').config();
const express = require('express');
const path = require('path');
const { ready: dbReady } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/albums', require('./routes/albums'));

// Page routes - Album with dynamic OG tags
app.get('/album/:id', async (req, res) => {
  try {
    const fs = require('fs');
    const albumHtml = fs.readFileSync(path.join(__dirname, 'public', 'album.html'), 'utf8');
    const db = require('./db/database');
    const album = await db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
    
    if (album) {
      const firstPhoto = await db.prepare('SELECT * FROM photos WHERE album_id = ? ORDER BY sort_order LIMIT 1').get(album.id);
      const ogImage = firstPhoto
        ? `https://lh3.googleusercontent.com/d/${firstPhoto.drive_file_id}=w800`
        : '';
      const ogTitle = album.title || 'Album Online';
      const ogDesc = `📸 Album ảnh: ${ogTitle} - Xem và chọn ảnh trực tuyến`;
      
      const ogTags = `
  <meta property="og:type" content="website">
  <meta property="og:title" content="${ogTitle.replace(/"/g, '&quot;')}">
  <meta property="og:description" content="${ogDesc.replace(/"/g, '&quot;')}">
  ${ogImage ? `<meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="800">
  <meta property="og:image:height" content="600">` : ''}
  <meta property="og:url" content="${req.protocol}://${req.get('host')}/album/${album.id}">`;
      
      const injectedHtml = albumHtml.replace('</head>', ogTags + '\n</head>');
      return res.send(injectedHtml);
    }
    
    res.sendFile(path.join(__dirname, 'public', 'album.html'));
  } catch (err) {
    console.error('Album page error:', err);
    res.sendFile(path.join(__dirname, 'public', 'album.html'));
  }
});

app.get('/create', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'create.html'));
});

app.get('/manage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'manage.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/account', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'account.html'));
});

app.get('/admin-users', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-users.html'));
});

app.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/admin-settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-settings.html'));
});

// Local development
if (process.env.NODE_ENV !== 'production') {
  dbReady.then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🎵 AlbumOnline đang chạy tại http://localhost:${PORT}`);
    });
  }).catch(err => {
    console.error('Database init failed:', err);
    process.exit(1);
  });
}

// Export for Vercel serverless
module.exports = app;
