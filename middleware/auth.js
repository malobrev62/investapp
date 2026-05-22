const supabase = require('../lib/supabaseClient');

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (user.id !== req.params.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  req.user = user;
  next();
};
