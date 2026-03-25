module.exports = async (req, res) => {
  const { Client } = require('pg');
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  await client.connect();
  const result = await client.query("UPDATE users SET role='admin' WHERE email='nguyenluyen@nsg.edu.vn'");
  await client.end();
  res.status(200).json({ updated: result.rowCount });
};
