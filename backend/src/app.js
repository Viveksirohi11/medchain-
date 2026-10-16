const express = require("express");
const cors = require("cors");
const routes = require("./routes");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/api", routes);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Not found" })
);

module.exports = app;
