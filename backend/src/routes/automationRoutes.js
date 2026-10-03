const express = require('express');
const {
  getAutomations,
  createAutomation,
  runAutomations,
} = require('../controllers/automationController');
const protect = require('../middleware/auth');
const authorize = require('../middleware/authorize');

const router = express.Router();

router.get('/', protect, getAutomations);
router.post('/', protect, authorize('admin'), createAutomation);
router.post('/run', protect, authorize('admin'), runAutomations);

module.exports = router;
