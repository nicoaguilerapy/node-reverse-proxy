// app/config.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_PRIVATE_URL,
});

module.exports = {
  pool, // Exportamos el pool correctamente
  PROXY_TARGET: process.env.TARGET,
  PORT: process.env.PORT,
};
