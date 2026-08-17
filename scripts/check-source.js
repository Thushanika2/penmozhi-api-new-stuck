const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..", "src");
const banned = /flask|sqlalchemy|mysql\+pymysql|gunicorn/i;
const files = [];
function collect(directory) { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const full = path.join(directory, entry.name); if (entry.isDirectory()) collect(full); else if (entry.name.endsWith(".js")) files.push(full); } }
collect(root);
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) { process.stderr.write(result.stderr); process.exitCode = 1; }
  if (banned.test(fs.readFileSync(file, "utf8"))) { console.error(`Legacy backend reference found in ${file}`); process.exitCode = 1; }
}
if (!process.exitCode) console.log(`Checked ${files.length} Node.js source files; no legacy runtime references found.`);
