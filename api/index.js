const { ready: dbReady } = require('../db/database');
const app = require('../server');

module.exports = async (req, res) => {
  await dbReady;
  return app(req, res);
};
