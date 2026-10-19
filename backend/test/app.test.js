const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/app");

test("unknown API routes return a JSON 404", async (t) => {
  const server = app.listen(0, "127.0.0.1");

  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  t.after(() =>
    new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    })
  );

  const { port } = server.address();
  const response = await fetch(
    `http://127.0.0.1:${port}/api/not-a-real-route`
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Not found" });
});

test("API app exports an Express application", () => {
  assert.equal(typeof app, "function");
  assert.equal(typeof app.listen, "function");
});
