const express = require('express');
const { param, body } = require('express-validator');
const { getSlas, updateSla } = require('../controllers/slaController');
const protect = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');

const router = express.Router();

router.get('/', protect, getSlas);

router.put(
  '/:id',
  protect,
  authorize('admin'),
  [
    param('id').isMongoId().withMessage('Invalid id'),
    body('responseTimeHours').optional().isInt({ min: 1 }).withMessage('responseTimeHours must be a number'),
    body('resolutionTimeHours').optional().isInt({ min: 1 }).withMessage('resolutionTimeHours must be a number'),
  ],
  validate,
  updateSla
);

module.exports = router;
