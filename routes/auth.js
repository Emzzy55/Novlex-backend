const express = require('express');
const router = express.Router();
const { register, login, adminLogin, refreshToken, logout } = require('../controllers/authController');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/auth');

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/admin/login', loginLimiter, adminLogin);
router.post('/refresh', refreshToken);
router.post('/logout', protect, logout);

module.exports = router;
