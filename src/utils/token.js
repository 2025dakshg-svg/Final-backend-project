const jwt = require('jsonwebtoken');

function genToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'devsecret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

module.exports = { genToken };
