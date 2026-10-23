
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

// Handle malformed JSON with a consistent JSON response.
app.use((err, _req, res, next) => {
  if (
    err instanceof SyntaxError &&
    err.status === 400 &&
    err.type === "entity.parse.failed"
  ) {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  next(err);
});

module.exports = app;
