const express = require('express');
const { body } = require('express-validator');
const { register, login, firebaseLogin } = require('../controllers/authController');
const validate = require('../middleware/validate');

const router = express.Router();

router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Email is not valid'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(['user', 'agent', 'admin']).withMessage('Role is not valid'),
  ],
  validate,
  register
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Email is not valid'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  login
);

router.post(
  '/firebase',
  [body('idToken').notEmpty().withMessage('idToken is required')],
  validate,
  firebaseLogin
);

module.exports = router;
