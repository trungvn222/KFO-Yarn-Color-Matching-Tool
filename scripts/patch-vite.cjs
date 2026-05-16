// Removes "module-sync" from vite's exports to fix ERR_REQUIRE_CYCLE_MODULE
// on Node 20.19+ / 22.12+ when vite-node (CJS) requires vite (ESM).
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'node_modules', 'vite', 'package.json');

if (!fs.existsSync(pkgPath)) {
  console.log('patch-vite: vite not found, skipping');
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

function removeModuleSync(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k !== 'module-sync') result[k] = removeModuleSync(v);
  }
  return result;
}

if (pkg.exports) {
  pkg.exports = removeModuleSync(pkg.exports);
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log('patch-vite: removed "module-sync" from vite exports');
}
