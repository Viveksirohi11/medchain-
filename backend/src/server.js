const { PORT, DEMO_MODE, RPC_URL } = require("./config");
const app = require("./app");

app.listen(PORT, () => {
  console.log(`MedChain API  http://localhost:${PORT}/api/health`);
  console.log(`  chain: ${RPC_URL}   demo mode: ${DEMO_MODE}`);
});
