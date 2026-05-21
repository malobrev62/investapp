const express = require('express');
const router = express.Router();
const plaid = require('../lib/plaidClient');
const supabase = require('../lib/supabaseClient');

router.get('/:userId', async (req, res) => {
  try {
    const { data: items, error } = await supabase
      .from('plaid_items')
      .select('*')
      .eq('user_id', req.params.userId);

    if (error) throw error;

    const results = await Promise.all(items.map(async (item) => {
      const [balances, investments] = await Promise.allSettled([
        plaid.accountsBalanceGet({ access_token: item.access_token }),
        plaid.investmentsHoldingsGet({ access_token: item.access_token }),
      ]);

      const accounts = balances.status === 'fulfilled'
        ? balances.value.data.accounts : [];

      const holdings = investments.status === 'fulfilled'
        ? investments.value.data.holdings : [];

      const securities = investments.status === 'fulfilled'
        ? investments.value.data.securities : [];

      return {
    institutionName: item.institution_name,
    institutionId: item.institution_id,
    accounts: accounts.map(a => ({
        id: a.account_id,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        balance: a.balances.current,
        available: a.balances.available,
    })),
    holdings: holdings.map(h => {
        const security = securities.find(s => s.security_id === h.security_id);
        return {
            ticker: security?.ticker_symbol || security?.name || 'Unknown',
            name: security?.name || 'Unknown',
            value: h.institution_value,
            quantity: h.quantity,
            returnPercent: 0,
        };
    }),
};
    }));

    res.json({ accounts: results });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

module.exports = router;