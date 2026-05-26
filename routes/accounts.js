const cache = require('../lib/cache');
const express = require('express');
const auth = require('../middleware/auth');
const router = express.Router();
const plaid = require('../lib/plaidClient');
const supabase = require('../lib/supabaseClient');

router.get('/:userId', auth, async (req, res) => {
  try {
    const cacheKey = `accounts_${req.params.userId}`;
    if (req.query.refresh === 'true') cache.del(cacheKey);
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

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

      if (balances.status === 'rejected') {
        console.error(`Balance fetch failed for ${item.institution_name}:`, balances.reason);
      }
      if (investments.status === 'rejected') {
        console.error(`Investments fetch failed for ${item.institution_name}:`, investments.reason);
      }
      if (investments.status === 'fulfilled') {
        console.log(`Investments for ${item.institution_name}:`, JSON.stringify(investments.value.data));
      }

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
            returnPercent: h.cost_basis && h.cost_basis > 0
              ? parseFloat((((h.institution_value - h.cost_basis) / h.cost_basis) * 100).toFixed(2))
              : null,
          };
        }),
      };
    }));
    router.get('/:userId/history', auth, async (req, res) => {
      try {
        const { period } = req.query; // '1M', '3M', '1Y', 'All'
        
        if (period === '7D') fromDate.setDate(fromDate.getDate() - 7);
else if (period === '1M') fromDate.setMonth(fromDate.getMonth() - 1);
else if (period === '3M') fromDate.setMonth(fromDate.getMonth() - 3);
else if (period === '1Y') fromDate.setFullYear(fromDate.getFullYear() - 1);
else fromDate = new Date('2000-01-01');// All
    
        const { data, error } = await supabase
          .from('balance_history')
          .select('*')
          .eq('user_id', req.params.userId)
          .gte('recorded_at', fromDate.toISOString())
          .order('recorded_at', { ascending: true });
    
        if (error) throw error;
    
        res.json({ history: data });
      } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to fetch balance history' });
      }
    });
    const response = { accounts: results };
    cache.set(cacheKey, response);
    res.json(response);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

module.exports = router;