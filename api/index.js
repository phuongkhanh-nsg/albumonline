const { ready: dbReady } = require('../db/database');
const app = require('../server');

module.exports = async (req, res) => {
  try {
    await dbReady;
    return app(req, res);
  } catch (err) {
    console.error('API Init Error:', err);
    res.status(500).json({ error: true, message: 'Server initialization failed: ' + err.message });
  }
};
