const User = require('../models/User');
const firebase = require('../config/firebase');

// POST /api/notifications/send  (send a push to any user, used for testing)
async function sendNotification(req, res) {
  try {
    const { userId, title, body } = req.body;

    if (!firebase.isFirebaseReady()) {
      return res.status(503).json({ message: 'Firebase not configured' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (!user.fcmToken) {
      return res.status(400).json({ message: 'User has no fcm token' });
    }

    const result = await firebase.sendPushToToken(user.fcmToken, title, body, {
      sentBy: req.user._id.toString(),
    });

    res.json({ sent: true, result: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { sendNotification };
