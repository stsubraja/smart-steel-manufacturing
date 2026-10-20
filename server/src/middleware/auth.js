const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ message: 'Authentication required' });
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user || user.status === 'DISABLED') return res.status(401).json({ message: 'User is not active' });
    req.user = user;
    next();
  } catch (e) { res.status(401).json({ message: 'Invalid or expired token' }); }
}
function admin(req, res, next) { if (req.user?.role !== 'ADMIN') return res.status(403).json({ message: 'Admin access required' }); next(); }
module.exports = { auth, admin };
