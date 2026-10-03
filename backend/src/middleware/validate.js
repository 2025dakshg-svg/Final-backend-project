const { validationResult } = require('express-validator');

function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = result.array().map((e) => e.msg);
  res.status(400).json({ message: errors[0], errors: errors });
}

module.exports = validate;
