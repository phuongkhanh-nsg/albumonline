module.exports = async (req, res) => {
  const { Client } = require('pg');
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  await client.connect();
  const result = await client.query("SELECT id, username, email, role FROM users WHERE email='nguyenluyen@nsg.edu.vn'");
  await client.end();
  res.status(200).json(result.rows[0] || {});
};