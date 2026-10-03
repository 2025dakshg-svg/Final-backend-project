const express = require('express');
const { body, param } = require('express-validator');
const { addComment, getMyComments, getTicketComments } = require('../controllers/commentController');
const protect = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.post(
  '/',
  protect,
  [
    body('ticketId').isMongoId().withMessage('ticketId is required'),
    body('message').trim().notEmpty().withMessage('Message is required'),
  ],
  validate,
  addComment
);

router.get('/', protect, getMyComments);

router.get('/ticket/:id', protect, [param('id').isMongoId().withMessage('Invalid id')], validate, getTicketComments);

module.exports = router;
