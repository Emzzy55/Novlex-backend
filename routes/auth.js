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

// One-time admin setup route - DELETE AFTER USE
// router.get('/make-admin', async (req, res) => {
 // try {
   // const { email, secret } = req.query;
  //  if (secret !== 'NovlexAdmin2025') return res.status(403).json({ success: false, message: 'Invalid secret.' });
  //  const User = require('../models/User');
  //  const user = await User.findOneAndUpdate({ email }, { role: 'admin' }, { new: true });
  //  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
  //  res.json({ success: true, message: `${user.fullName} is now admin!` });
//  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
//});

module.exports = router;
