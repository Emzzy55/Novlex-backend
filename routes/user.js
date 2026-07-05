const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, changePassword, getDashboard } = require('../controllers/userController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/dashboard', getDashboard);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.put('/change-password', changePassword);

module.exports = router;
