const express = require('express');
const { getAllTickets, getReports } = require('../controllers/adminController');
const protect = require('../middleware/auth');
const authorize = require('../middleware/authorize');

const router = express.Router();

router.get('/tickets', protect, authorize('admin'), getAllTickets);
router.get('/reports', protect, authorize('admin'), getReports);

module.exports = router;
