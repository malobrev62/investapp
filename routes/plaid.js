const express = require('express');
const router = express.Router();
const plaid = require('../lib/plaidClient');
const supabase = require('../lib/supabaseClient');
const cache = require('../lib/cache');
const { Products, CountryCode } = require('plaid');

// For bank accounts (checking, savings)
router.post('/create-link-token/banking', async (req, res) => {
  try {
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: req.body.userId },
      client_name: 'InvestNetWorth',
      products: [Products.Balance],
      country_codes: [CountryCode.Us],
      language: 'en',
      redirect_uri: 'https://investapp-production.up.railway.app/oauth-return'
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

// For investment accounts (brokerage, 401k, retirement)
router.post('/create-link-token/investing', async (req, res) => {
  try {
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: req.body.userId },
      client_name: 'InvestNetWorth',
      products: [Products.Investments],
      country_codes: [CountryCode.Us],
      language: 'en',
      redirect_uri: 'https://investapp-production.up.railway.app/oauth-return'
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

// Step 2: Exchange public token → access token, save to Supabase
router.post('/exchange-token', async (req, res) => {
  const { public_token, institution_name, institution_id, userId } = req.body;
  try {
    const exchange = await plaid.itemPublicTokenExchange({ public_token });
    const access_token = exchange.data.access_token;

    const { error } = await supabase
      .from('plaid_items')
      .insert({ user_id: userId, access_token, institution_name, institution_id });

    if (error) throw error;
    cache.del(`accounts_${userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});
router.get('/oauth-return', (req, res) => {
  const { oauth_state_id } = req.query;
  const safeStateId = /^[a-zA-Z0-9_-]+$/.test(oauth_state_id || '') ? oauth_state_id : '';
  const stateParam = safeStateId ? `?oauth_state_id=${safeStateId}` : '';
  res.redirect(`investnetworth://oauth-return${stateParam}`);
});
module.exports = router;