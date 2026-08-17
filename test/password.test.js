const assert = require("node:assert/strict");
const test = require("node:test");
const { hashPassword, verifyPasswordHash } = require("../src/utils/password");

test("new password hashes use a portable scrypt format", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.match(hash, /^scrypt:32768:8:1\$/);
  assert.equal(await verifyPasswordHash(hash, "correct horse battery staple"), true);
  assert.equal(await verifyPasswordHash(hash, "wrong password"), false);
});
