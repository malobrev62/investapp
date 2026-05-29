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
      const [balances, investments, institution] = await Promise.allSettled([
        plaid.accountsBalanceGet({ access_token: item.access_token }),
        plaid.investmentsHoldingsGet({ access_token: item.access_token }),
        plaid.institutionsGetById({
          institution_id: item.institution_id,
          country_codes: ['US'],
          options: { include_optional_metadata: true }
        })
      ]);

      if (balances.status === 'rejected') {
        console.error(`Balance fetch failed for ${item.institution_name}:`, balances.reason);
      }
      if (investments.status === 'rejected') {
        console.error(`Investments fetch failed for ${item.institution_name}:`, investments.reason);
      }

      const logo = institution.status === 'fulfilled'
        ? institution.value.data.institution.logo
        : null;

      const accounts = balances.status === 'fulfilled'
        ? balances.value.data.accounts : [];

      const holdings = investments.status === 'fulfilled'
        ? investments.value.data.holdings : [];

      const securities = investments.status === 'fulfilled'
        ? investments.value.data.securities : [];

      const holdingsTotal = holdings.reduce((sum, h) => sum + (h.institution_value || 0), 0);
      console.log(`Holdings total for ${item.institution_name}: $${holdingsTotal}, accounts count: ${accounts.length}`);

      return {
        institutionName: item.institution_name,
        institutionId: item.institution_id,
        logo: logo,
        accounts: accounts.length > 0 ? accounts.map(a => ({
          id: a.account_id,
          name: a.name,
          type: a.type,
          subtype: a.subtype,
          balance: a.balances.available ?? a.balances.current,
          available: a.balances.current,
        })) : [{
          id: item.institution_id,
          name: item.institution_name,
          type: 'investment',
          subtype: 'retirement',
          balance: holdingsTotal,
          available: holdingsTotal,
        }],
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

    const response = { accounts: results };
    cache.set(cacheKey, response);
    res.json(response);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

router.get('/:userId/history', auth, async (req, res) => {
  try {
    const { period } = req.query;
    let fromDate = new Date();

    if (period === '7D') fromDate.setDate(fromDate.getDate() - 7);
    else if (period === '1M') fromDate.setMonth(fromDate.getMonth() - 1);
    else if (period === '3M') fromDate.setMonth(fromDate.getMonth() - 3);
    else if (period === '1Y') fromDate.setFullYear(fromDate.getFullYear() - 1);
    else fromDate = new Date('2000-01-01');

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

module.exports = router;