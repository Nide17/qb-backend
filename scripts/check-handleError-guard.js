const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const forbiddenPatterns = [
  {
    description: 'Passing `res` into helpers (function CALLS that pass res)',
    // We'll do line-level matching for this pattern and filter out function signatures
    regex: /,\s*res\s*\)/g,
    pathIncludes: ''
  },
  {
    description: 'Inline return handleError with object literal (should throw instead)',
    regex: /return\s+handleError\(\s*res\s*,\s*\{/g,
    pathIncludes: ''
  }
];

let failures = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, .git, and docs
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'docs') continue;
      walk(full);
    } else if (entry.isFile()) {
      // Skip markdown and docs files
      if (full.endsWith('.md')) continue;
  try {
        const rel = path.relative(repoRoot, full);
        const text = fs.readFileSync(full, 'utf8');
        const lines = text.split(/\r?\n/);
        for (const pat of forbiddenPatterns) {
          if (pat.pathIncludes && !rel.includes(pat.pathIncludes)) continue;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!pat.regex.test(line)) continue;

            // Filter out common function signature lines and comments
            const signatureIndicators = ['=>', 'exports.', 'function', 'async (', 'async(' , 'const ', 'let ', 'var ', 'module.exports', '//', '*', '/*'];
            const isSignature = signatureIndicators.some(ind => line.includes(ind));
            if (isSignature) continue;

            // Record a precise finding (file, line number, snippet)
            failures.push({ file: rel, description: pat.description, line: i + 1, snippet: line.trim() });
          }
        }
      } catch {
        // ignore binary files
      }
    }
  }
}

walk(repoRoot);

if (failures.length) {
  console.error('\nGuard found forbidden patterns:');
  for (const f of failures) {
    console.error(` - ${f.description} in ${f.file} (matches: ${f.matches})`);
  }
  console.error('\nPlease convert helpers to throw and remove inline handleError returns.');
  process.exit(1);
} else {
  console.log('Guard check passed: no forbidden patterns found in utils or inline handleError object-literals.');
  process.exit(0);
}
