const User = require('../models/User');

// GET /api/users?role=agent  (returns id, name, email, role)
async function listUsers(req, res) {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;

    const users = await User.find(filter).select('name email role').sort({ name: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { listUsers };