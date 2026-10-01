const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '../client/dist/assets');
if (!fs.existsSync(distDir)) {
  console.error('Dist dir does not exist!');
  process.exit(1);
}

const files = fs.readdirSync(distDir).filter(f => f.endsWith('.js'));

const checks = [
  { name: 'Supabase DB password', regex: /postgres:[^@]+@aws-0/i },
  { name: 'Meta Access Token (EAAG)', regex: /EAAG[a-zA-Z0-9]{20,}/ },
  { name: 'JWT Secret assignment', regex: /JWT_SECRET\s*=\s*['"][^'"]{8,}['"]/i },
  { name: 'Supabase Pooler Host', regex: /aws-0-ap-southeast-1\.pooler\.supabase\.com/ },
  { name: 'R2 Secret Access Key', regex: /[a-f0-9]{64}/ }
];

let issues = 0;
for (const file of files) {
  const content = fs.readFileSync(path.join(distDir, file), 'utf8');
  for (const check of checks) {
    if (check.regex.test(content)) {
      console.warn(`[WARN] Possible secret pattern matched (${check.name}) in ${file}`);
      issues++;
    }
  }
}

if (issues === 0) {
  console.log(`[PASS] Bundle Security Check: Zero secrets or server credentials detected across ${files.length} production assets.`);
} else {
  console.error(`[FAIL] ${issues} potential issues detected.`);
  process.exit(1);
}
