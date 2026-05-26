/*
  Supabase table schema:

  create table balance_history (
    id            bigint generated always as identity primary key,
    user_id       text not null,
    institution_id   text,
    institution_name text not null,
    balance       numeric not null,
    snapshotted_at timestamptz not null default now()
  );

  create index on balance_history (user_id, snapshotted_at);
*/

const plaid = require('../lib/plaidClient');
const supabase = require('../lib/supabaseClient');

async function snapshotBalances() {
  console.log('📸 Running balance snapshot job...');

  const { data: items, error } = await supabase.from('plaid_items').select('*');
  if (error) throw error;

  for (const item of items) {
    try {
      const { data } = await plaid.accountsBalanceGet({ access_token: item.access_token });

      const balance = data.accounts.reduce((sum, a) => {
        return sum + (a.balances.available ?? a.balances.current ?? 0);
      }, 0);

      const { error: insertError } = await supabase.from('balance_history').insert({
        user_id: item.user_id,
        institution_id: item.institution_id,
        institution_name: item.institution_name,
        balance,
      });

      if (insertError) throw insertError;
      console.log(`✅ Snapshot saved for ${item.institution_name}: $${balance.toFixed(2)}`);
    } catch (err) {
      console.error(`❌ Snapshot failed for ${item.institution_name}:`, err.message);
    }
  }
}

module.exports = snapshotBalances;
