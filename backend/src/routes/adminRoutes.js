const express = require('express');
const { getAllTickets, getReports, getDatabaseStats } = require('../controllers/adminController');
const protect = require('../middleware/auth');
const authorize = require('../middleware/authorize');

const router = express.Router();

router.get('/tickets', protect, authorize('admin'), getAllTickets);
router.get('/reports', protect, authorize('admin'), getReports);
router.get('/db-stats', protect, getDatabaseStats);

module.exports = router;

