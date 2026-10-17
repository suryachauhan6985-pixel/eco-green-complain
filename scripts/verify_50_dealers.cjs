const { Client } = require('pg');
const XLSX = require('xlsx');

const connStr = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
const client = new Client({ connectionString: connStr });

function levenshteinDist(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function tokenizeDealerStr(str) {
  if (!str) return [];
  return String(str)
    .toLowerCase()
    .replace(/[^\w\s]/gi, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !['and', 'the', 'pvt', 'ltd'].includes(t));
}

function computeWordSimilarity(w1, w2) {
  if (w1 === w2) return 1.0;
  if (w1.startsWith(w2) || w2.startsWith(w1)) {
    const minLen = Math.min(w1.length, w2.length);
    if (minLen >= 4) return 0.95;
    if (minLen >= 3) return 0.88;
  }
  const maxLen = Math.max(w1.length, w2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDist(w1, w2);
  const sim = 1 - (dist / maxLen);
  return sim >= 0.65 ? sim : 0;
}

function fuzzyMatchDealers(searchTerm, dealersList) {
  if (!searchTerm || !searchTerm.trim() || !Array.isArray(dealersList) || dealersList.length === 0) {
    return [];
  }
  const qClean = searchTerm.trim().toLowerCase();
  const qNorm = qClean.replace(/[^a-z0-9]/g, '');
  const qTokens = tokenizeDealerStr(searchTerm);

  const scored = [];

  for (const d of dealersList) {
    const dName = (d.dealer_name || '').trim().toLowerCase();
    if (!dName) continue;
    const dNorm = dName.replace(/[^a-z0-9]/g, '');

    // 1. Exact match (highest priority: 1000)
    if (dName === qClean) {
      scored.push({ dealer: d, score: 1000, reason: 'exact' });
      continue;
    }

    // 2. Exact match on normalized alphanumeric string (priority: 950)
    if (qNorm.length >= 3 && dNorm === qNorm) {
      scored.push({ dealer: d, score: 950, reason: 'exact_normalized' });
      continue;
    }

    // 3. Direct containment (one inside the other)
    if (qNorm.length >= 3 && dNorm.startsWith(qNorm)) {
      scored.push({ dealer: d, score: 900, reason: 'd_starts_with_q' });
      continue;
    }
    if (qNorm.length >= 3 && qNorm.startsWith(dNorm)) {
      scored.push({ dealer: d, score: 880, reason: 'q_starts_with_d' });
      continue;
    }
    if (qNorm.length >= 3 && dNorm.includes(qNorm)) {
      scored.push({ dealer: d, score: 850, reason: 'd_contains_q' });
      continue;
    }
    if (dNorm.length >= 3 && qNorm.includes(dNorm)) {
      scored.push({ dealer: d, score: 820, reason: 'q_contains_d' });
      continue;
    }

    // 4. Token-based matching with Levenshtein word similarity (capped at 85)
    const dTokens = tokenizeDealerStr(d.dealer_name);
    let matchScore = 0;
    let exactMatches = 0;

    for (const qt of qTokens) {
      let bestWordScore = 0;
      for (const dt of dTokens) {
        const sim = computeWordSimilarity(qt, dt);
        if (sim > bestWordScore) bestWordScore = sim;
      }
      if (bestWordScore > 0) {
        matchScore += bestWordScore;
        if (bestWordScore >= 0.95) exactMatches++;
      }
    }

    if (matchScore > 0 && qTokens.length > 0) {
      const queryCoverage = matchScore / qTokens.length;
      const targetCoverage = matchScore / Math.max(1, dTokens.length);
      const rawScore = (queryCoverage * 40) + (targetCoverage * 25) + (exactMatches * 10);
      const finalScore = Math.min(85, Math.round(rawScore));
      if (finalScore >= 35) {
        scored.push({ dealer: d, score: finalScore, reason: 'tokens', exactMatches });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score || a.dealer.dealer_name.localeCompare(b.dealer.dealer_name));
  return scored.map(s => ({ ...s.dealer, _matchScore: s.score, _matchReason: s.reason }));
}

async function verify50Dealers() {
  await client.connect();
  const dbRes = await client.query('SELECT id, dealer_name, contact_person, primary_contact, alternate_contacts, raw_contact FROM dealers');
  const allDealers = dbRes.rows;
  console.log('Total dealers in DB:', allDealers.length);

  const excelPath = 'c:\\Users\\Administrator\\Desktop\\DEALER NAME&NO.xlsx';
  const wb = XLSX.readFile(excelPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  console.log(`\n======================================================`);
  console.log(`VERIFYING FIRST 100 DEALERS FROM EXCEL FILE:`);
  console.log(`======================================================`);

  let successCount = 0;
  let hasMobileCount = 0;
  let hasPersonCount = 0;

  for (let i = 0; i < 100; i++) {
    const rawFirmName = String(rows[i][0] || '').trim();
    const rawColB = String(rows[i][1] || '').trim();
    if (!rawFirmName) continue;

    const matches = fuzzyMatchDealers(rawFirmName, allDealers);
    const best = matches[0];

    if (!best) {
      console.log(`[#${i + 1}] ❌ NO MATCH FOUND for: "${rawFirmName}"`);
      continue;
    }

    successCount++;
    if (best.primary_contact) hasMobileCount++;
    if (best.contact_person) hasPersonCount++;

    console.log(`[#${i + 1}] Input: "${rawFirmName}"`);
    console.log(`      Excel Column B: "${rawColB}"`);
    console.log(`      -> Fetched Firm Name   : "${best.dealer_name}"`);
    console.log(`      -> Fetched Mobile No.  : "${best.primary_contact || 'N/A'}"`);
    console.log(`      -> Fetched Contact Person: "${best.contact_person || 'N/A'}"`);
    console.log(`      -> Match Score: ${best._matchScore} (${best._matchReason})`);
    console.log(`------------------------------------------------------`);
  }

  console.log(`\n======================================================`);
  console.log(`TEST SUMMARY:`);
  console.log(`Dealers Tested      : 100`);
  console.log(`Successful Matches  : ${successCount} / 100 (${((successCount/100)*100).toFixed(1)}%)`);
  console.log(`With Mobile No.     : ${hasMobileCount} / 100`);
  console.log(`With Contact Person : ${hasPersonCount} / 100`);
  console.log(`======================================================\n`);

  await client.end();
}

verify50Dealers().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
