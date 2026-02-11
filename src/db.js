// db.js
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // safe for Neon + many hosted PGs
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
