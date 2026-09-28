const User = require('../models/User');
const { genToken } = require('../utils/token');
const firebase = require('../config/firebase');

// POST /api/auth/register
async function register(req, res) {
  try {
    const { name, email, password, role, fcmToken } = req.body;

    const user = await User.create({
      name: name,
      email: email,
      password: password,
      role: role || 'user',
      fcmToken: fcmToken || '',
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: genToken(user._id),
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(400).json({ message: err.message });
  }
}

// POST /api/auth/login
async function login(req, res) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: genToken(user._id),
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// POST /api/auth/firebase  (login with a firebase id token)
async function firebaseLogin(req, res) {
  try {
    const { idToken, fcmToken } = req.body;

    if (!firebase.isFirebaseReady()) {
      return res.status(503).json({ message: 'Firebase not configured' });
    }

    const decoded = await firebase.verifyIdToken(idToken);
    const email = decoded.email;

    if (!email) {
      return res.status(401).json({ message: 'Email not found in firebase token' });
    }

    let user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      user = await User.create({
        name: decoded.name || email.split('@')[0],
        email: email.toLowerCase(),
        password: Math.random().toString(36).slice(2),
        role: 'user',
        firebaseUid: decoded.uid,
        fcmToken: fcmToken || '',
      });
    } else {
      user.firebaseUid = decoded.uid;
      if (fcmToken) user.fcmToken = fcmToken;
      await user.save();
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: genToken(user._id),
    });
  } catch (err) {
    res.status(401).json({ message: 'Invalid firebase token' });
  }
}

module.exports = { register, login, firebaseLogin };
