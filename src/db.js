// db.js
require("dotenv").config();
const fs = require("fs");
const { Pool } = require("pg");

function resolveSslConfig() {
  const sslMode = (process.env.PG_SSL_MODE || "require").toLowerCase();
  const isProduction = process.env.NODE_ENV === "production";

  if (sslMode === "disable") {
    if (isProduction) {
      throw new Error("PG_SSL_MODE=disable is not allowed in production.");
    }
    return false;
  }

  if (!["require", "verify-full"].includes(sslMode)) {
    throw new Error("Invalid PG_SSL_MODE. Use disable, require, or verify-full.");
  }

  const ssl = {
    rejectUnauthorized: true
  };

  if (process.env.PG_SSL_CA_PATH) {
    ssl.ca = fs.readFileSync(process.env.PG_SSL_CA_PATH, "utf8");
  }

  if (process.env.PG_SSL_CERT_PATH) {
    ssl.cert = fs.readFileSync(process.env.PG_SSL_CERT_PATH, "utf8");
  }

  if (process.env.PG_SSL_KEY_PATH) {
    ssl.key = fs.readFileSync(process.env.PG_SSL_KEY_PATH, "utf8");
  }

  return ssl;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: resolveSslConfig()
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};
