const express = require('express');
const { body } = require('express-validator');
const { sendNotification } = require('../controllers/notificationController');
const protect = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');

const router = express.Router();

router.post(
  '/send',
  protect,
  authorize('admin', 'agent'),
  [
    body('userId').isMongoId().withMessage('userId is required'),
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('body').trim().notEmpty().withMessage('Body is required'),
  ],
  validate,
  sendNotification
);

module.exports = router;
