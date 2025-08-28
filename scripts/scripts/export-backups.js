// scripts/export-backups.js
import fs from 'fs';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE envs');
  process.exit(1);
}

const tables = ['configs','offers','royalties_metadata','sales','payouts'];

function toCsv(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const header = keys.join(',');
  const lines = rows.map(r => keys.map(k => {
    const v = r[k] ?? '';
    return typeof v === 'string' ? `"${String(v).replace(/"/g,'""')}"` : v;
  }).join(','));
  return [header, ...lines].join('\n');
}

async function fetchTable(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) throw new Error('Failed to fetch ' + table + ': ' + await res.text());
  return res.json();
}

(async () => {
  try {
    const date = new Date().toISOString().slice(0,10);
    const base = `backups/${date}`;
    fs.mkdirSync(base, { recursive: true });
    for (const t of tables) {
      const rows = await fetchTable(t);
      const csv = toCsv(rows);
      fs.writeFileSync(`${base}/${t}.csv`, csv, 'utf8');
      console.log(`Wrote ${base}/${t}.csv`);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
