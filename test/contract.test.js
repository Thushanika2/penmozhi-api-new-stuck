const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp } = require("../src/app");

async function withServer(callback) {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try { return await callback(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("health endpoint reports MongoDB connection state without leaking configuration", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.deepEqual(Object.keys(payload).sort(), ["database", "detail", "error", "status"].sort());
    assert.equal(payload.database, "disconnected");
    assert.equal(JSON.stringify(payload).includes("MONGODB_URI"), false);
  });
});

test("protected routes preserve the authentication boundary", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dashboard/summary`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error_code: "auth.invalid_token", error: "Invalid authentication token." });
  });
});
