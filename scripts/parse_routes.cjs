const fs = require('fs');

const content = fs.readFileSync('api/index.js', 'utf8');
const lines = content.split('\n');
const routes = [];
const routeRegex = /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/;

lines.forEach((line, idx) => {
  const m = line.match(routeRegex);
  if (m) {
    routes.push({ line: idx + 1, method: m[1].toUpperCase(), path: m[2] });
  }
});

console.log('Total routes count:', routes.length);
// Group by prefix
const groups = {};
routes.forEach(r => {
  const parts = r.path.split('/');
  const prefix = parts.slice(0, 3).join('/') || '/';
  if (!groups[prefix]) groups[prefix] = [];
  groups[prefix].push(`${r.method} ${r.path} (L${r.line})`);
});

for (const [k, v] of Object.entries(groups)) {
  console.log(`\n### ${k} (${v.length} endpoints)`);
  v.forEach(item => console.log('  ' + item));
}
