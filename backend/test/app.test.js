const { DEMO_MODE } = require("../src/config");
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
test("malformed JSON requests return HTTP 400", async (t) => {
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
    `http://127.0.0.1:${port}/api/auth/challenge`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"invalid":'
    }
  );

 assert.equal(response.status, 400);
assert.deepEqual(await response.json(), {
  error: "Invalid JSON",
});
});
test("batch endpoint rejects a non-numeric batch ID", async (t) => {
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
    `http://127.0.0.1:${port}/api/batches/abc`
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Batch ID must be a positive integer",
  });
});

const invalidBatchRequests = [
  {
    method: "POST",
    path: "/api/batches/abc/transfer",
    body: {
      from: "0x0000000000000000000000000000000000000001",
      to: "0x0000000000000000000000000000000000000002",
    },
  },
  {
    method: "POST",
    path: "/api/batches/abc/dispense",
    body: {
      pharmacy: "0x0000000000000000000000000000000000000001",
      serial: "TEST-SERIAL-001",
    },
  },
  {
    method: "POST",
    path: "/api/batches/abc/recall",
    body: {
      by: "0x0000000000000000000000000000000000000001",
      reason: "Test recall",
    },
  },
  {
    method: "GET",
    path: "/api/batches/abc/units",
  },
];

for (const item of invalidBatchRequests) {
  test(
    `${item.method} ${item.path} rejects an invalid batch ID`,
    { skip: !DEMO_MODE },
    async (t) => {
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

      const options = {
        method: item.method,
        headers: {},
      };

      if (item.body) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(item.body);
      }

      const response = await fetch(
        `http://127.0.0.1:${port}${item.path}`,
        options
      );

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: "Batch ID must be a positive integer",
      });
    }
  );
}
