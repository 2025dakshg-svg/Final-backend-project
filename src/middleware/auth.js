const jwt = require('jsonwebtoken');
const User = require('../models/User');
const firebase = require('../config/firebase');

// accepts a normal jwt from the login routes or a firebase id token
async function protect(req, res, next) {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const value = token.startsWith('Bearer ') ? token.slice(7) : token;
  let user = null;

  try {
    const decoded = jwt.verify(value, process.env.JWT_SECRET || 'devsecret');
    user = await User.findById(decoded.id);
  } catch (err) {
    if (firebase.isFirebaseReady()) {
      try {
        const decoded = await firebase.verifyIdToken(value);
        user = await User.findOne({ firebaseUid: decoded.uid });
        if (user && !user.firebaseUid) {
          user.firebaseUid = decoded.uid;
          await user.save();
        }
      } catch (fbErr) {
        return res.status(401).json({ message: 'Not authorized' });
      }
    }
  }

  if (!user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  req.user = user;
  next();
}

module.exports = protect;
