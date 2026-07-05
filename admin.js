const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const {
  getDashboard, getAllUsers, getUserDetail, updateUserBalance, banUser,
  getPendingDeposits, approveDeposit, rejectDeposit,
  getPendingWithdrawals, approveWithdrawal, rejectWithdrawal,
} = require('../controllers/adminController');

router.use(protect, adminOnly);

router.get('/dashboard', getDashboard);
router.get('/users', getAllUsers);
router.get('/users/:id', getUserDetail);
router.put('/users/:id/balance', updateUserBalance);
router.put('/users/:id/ban', banUser);

router.get('/deposits/pending', getPendingDeposits);
router.put('/deposits/:id/approve', approveDeposit);
router.put('/deposits/:id/reject', rejectDeposit);

router.get('/withdrawals/pending', getPendingWithdrawals);
router.put('/withdrawals/:id/approve', approveWithdrawal);
router.put('/withdrawals/:id/reject', rejectWithdrawal);

module.exports = router;
