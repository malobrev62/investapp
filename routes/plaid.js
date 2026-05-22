const express = require('express');
const router = express.Router();
const plaid = require('../lib/plaidClient');
const supabase = require('../lib/supabaseClient');
const { Products, CountryCode } = require('plaid');

// Step 1: Create a link token — sent to iOS to open Plaid Link
router.post('/create-link-token', async (req, res) => {
  try {
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: req.body.userId },
      client_name: 'InvestNetWorth',
      products: [Products.Auth, Products.Balance],
      country_codes: [CountryCode.Us],
      language: 'en',
      link_customization_name: 'default',
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
    res.json({ success: true });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});
router.get('/oauth-return', (req, res) => {
  res.send('OAuth complete. You can close this window.');
});
module.exports = router;