require("dotenv").config();
const path = require("path");

module.exports = {
  PORT: Number(process.env.PORT || 4000),
  RPC_URL: process.env.RPC_URL || "http://127.0.0.1:8545",
  DEMO_MODE: (process.env.DEMO_MODE ?? "true") === "true",
  DATA_DIR: path.join(__dirname, "..", "data"),
};
