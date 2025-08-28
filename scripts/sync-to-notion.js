// scripts/sync-to-notion.js
// Requires Node 18+ (GitHub Actions will use node 18)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

if (!SUPABASE_URL || !SUPABASE_KEY || !NOTION_TOKEN || !NOTION_DATABASE_ID) {
  console.error('Missing required env vars.');
  process.exit(1);
}

async function fetchQueuedPayouts() {
  const q = `${SUPABASE_URL}/rest/v1/payouts?status=eq.queued&notion_sync=eq.false&select=*`;
  const res = await fetch(q, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Failed to fetch payouts: ${await res.text()}`);
  return res.json();
}

function makeNotionProperties(payout) {
  return {
    "Sale ID": { "number": payout.sale_id },
    "Recipient Role": { "rich_text": [{ "text": { "content": payout.recipient_role || '' } }] },
    "Recipient ID": { "rich_text": [{ "text": { "content": payout.recipient_id || '' } }] },
    "Pct": { "number": Number(payout.pct) },
    "Amount": { "number": Number(payout.amount) },
    "Status": { "select": { "name": payout.status } },
    "Created At": { "date": { "start": payout.created_at } }
  };
}

async function createNotionPage(payout) {
  const body = {
    parent: { database_id: NOTION_DATABASE_ID },
    properties: makeNotionProperties(payout)
  };
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Notion API error: ' + txt);
  }
  return res.json();
}

async function markPayoutSynced(payoutId, notionUrl='') {
  const url = `${SUPABASE_URL}/rest/v1/payouts?id=eq.${payoutId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ notion_sync: true, notion_page_url: notionUrl })
  });
  if (!res.ok) {
    throw new Error('Failed to mark payout synced: ' + await res.text());
  }
  return res.json();
}

(async () => {
  try {
    const payouts = await fetchQueuedPayouts();
    console.log(`Found ${payouts.length} queued payouts to sync.`);
    for (const p of payouts) {
      try {
        const notionResp = await createNotionPage(p);
        const notionUrl = notionResp.url || '';
        await markPayoutSynced(p.id, notionUrl);
        console.log('Synced payout', p.id);
      } catch (err) {
        console.error('Error handling payout', p.id, err);
      }
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
