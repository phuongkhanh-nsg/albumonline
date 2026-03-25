const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'albumonline_default_secret_change_me';

function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 7 * 86400 })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const [header, body, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (signature !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      resolve(salt.toString('hex') + ':' + key.toString('hex'));
    });
  });
}

async function verifyPassword(password, hash) {
  return new Promise((resolve, reject) => {
    const [saltHex, keyHex] = hash.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      resolve(key.toString('hex') === keyHex);
    });
  });
}

// Middleware: require authentication
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập' });
  }
  const user = verifyToken(authHeader.slice(7));
  if (!user) {
    return res.status(401).json({ error: 'Phiên đăng nhập hết hạn' });
  }
  req.user = user;
  next();
}

// Middleware: optional authentication (sets req.user if token present)
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    req.user = verifyToken(authHeader.slice(7));
  }
  next();
}

module.exports = { createToken, verifyToken, hashPassword, verifyPassword, requireAuth, optionalAuth };
