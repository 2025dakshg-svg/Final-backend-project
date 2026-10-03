const express = require('express');
const { body, param } = require('express-validator');
const {
  getTickets,
  getTicketById,
  createTicket,
  updateTicket,
  deleteTicket,
  updateStatus,
  assignTicket,
} = require('../controllers/ticketController');
const protect = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');

const router = express.Router();

router.get('/', protect, getTickets);
router.get('/:id', protect, [param('id').isMongoId().withMessage('Invalid id')], validate, getTicketById);

router.post(
  '/',
  protect,
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('priority').optional().isIn(['low', 'medium', 'high']).withMessage('Priority is not valid'),
  ],
  validate,
  createTicket
);

router.put(
  '/:id',
  protect,
  [
    param('id').isMongoId().withMessage('Invalid id'),
    body('priority').optional().isIn(['low', 'medium', 'high']).withMessage('Priority is not valid'),
  ],
  validate,
  updateTicket
);

router.delete('/:id', protect, [param('id').isMongoId().withMessage('Invalid id')], validate, deleteTicket);

router.put(
  '/:id/status',
  protect,
  authorize('agent', 'admin'),
  [
    param('id').isMongoId().withMessage('Invalid id'),
    body('status')
      .isIn(['open', 'in-progress', 'resolved', 'closed'])
      .withMessage('Status is not valid'),
  ],
  validate,
  updateStatus
);

router.put(
  '/:id/assign',
  protect,
  authorize('agent', 'admin'),
  [
    param('id').isMongoId().withMessage('Invalid id'),
    body('agentId').isMongoId().withMessage('agentId is required'),
  ],
  validate,
  assignTicket
);

// Optional Advanced Feature: Attachments API (Page 73 of Case Study)
const {
  addAttachment,
  getAttachments,
  deleteAttachment,
} = require('../controllers/attachmentController');

router.post('/:id/attachments', protect, addAttachment);
router.get('/:id/attachments', protect, getAttachments);
router.delete('/:id/attachments/:attachmentId', protect, deleteAttachment);

module.exports = router;

