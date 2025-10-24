const fs = require('fs');
const path = require('path');

// Walk directory recursively
function walk(dir, cb) {
  fs.readdirSync(dir).forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, cb);
    else cb(full);
  });
}

// Only process controller files (common pattern under services)
const root = path.resolve(__dirname, '..');
const controllerFiles = [];
walk(root, (file) => {
  if (/\/controllers\//.test(file) && file.endsWith('.js')) controllerFiles.push(file);
});

const singleLinePattern = /return\s+handleError\s*\(\s*res\s*,\s*(\{[^}]*\})\s*(?:,\s*([^\)]+)\s*)?\)\s*;?/g;

let totalReplacements = 0;
for (const file of controllerFiles) {
  let src = fs.readFileSync(file, 'utf8');
  let replaced = 0;

  src = src.replace(singleLinePattern, (match, objLit, statusArg) => {
    // Attempt to parse the object literal to extract a `status` property if present
    let thrownObj = objLit;
    try {
      // naive eval in safe context: only object literal
      const sanitized = objLit.replace(/([\r\n])/g, ' ');
      const obj = eval('(' + sanitized + ')'); // intentionally simple; files are trusted in this workspace
      // normalize property name to statusCode if 'status' exists
      if (obj && (obj.status || obj.statusCode)) {
        const sc = obj.statusCode || obj.status;
        obj.statusCode = sc;
        delete obj.status;
        thrownObj = JSON.stringify(obj);
      }
    } catch {
      // leave object literal as-is
    }

    // if there's an explicit statusArg passed as third arg, use it as statusCode
    if (statusArg) {
      const s = statusArg.trim().replace(/;$/, '');
      // build a new object merging statusCode
      try {
        const base = JSON.parse(thrownObj);
        base.statusCode = parseInt(s) || base.statusCode || s;
        thrownObj = JSON.stringify(base);
      } catch {
        // fallback: wrap into object
        thrownObj = `{ statusCode: ${s}, message: ${JSON.stringify(statusArg)} }`;
      }
    }

    replaced += 1;
    totalReplacements += 1;
    return `throw ${thrownObj};`;
  });

  if (replaced > 0) {
    fs.writeFileSync(file, src, 'utf8');
    console.log(`Updated ${file}: ${replaced} replacements`);
  }
}

console.log(`Done. Total replacements: ${totalReplacements}`);

if (totalReplacements === 0) {
  console.log('No single-line patterns found. You may need manual review for multi-line handleError calls.');
}
