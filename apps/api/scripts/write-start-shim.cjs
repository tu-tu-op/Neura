const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const distDir = join(__dirname, "..", "dist");
const shimPath = join(distDir, "index.js");

mkdirSync(distDir, { recursive: true });
writeFileSync(shimPath, 'require("./apps/api/src/index.js");\n', "utf8");
