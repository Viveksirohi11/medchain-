const express = require("express");
const cors = require("cors");
const { PORT, DEMO_MODE, RPC_URL } = require("./config");
const routes = require("./routes");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/api", routes);
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

app.listen(PORT, () => {
  console.log(`MedChain API  http://localhost:${PORT}/api/health`);
  console.log(`  chain: ${RPC_URL}   demo mode: ${DEMO_MODE}`);
});
