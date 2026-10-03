const express = require('express');
const { listUsers } = require('../controllers/userController');
const protect = require('../middleware/auth');
const authorize = require('../middleware/authorize');

const router = express.Router();

router.get('/', protect, authorize('agent', 'admin'), listUsers);

module.exports = router;