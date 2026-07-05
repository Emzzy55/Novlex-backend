const express = require('express');
const router = express.Router();
const { requestDeposit, uploadProof, requestWithdrawal, getMyTransactions } = require('../controllers/transactionController');
const { protect } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const { withdrawLimiter } = require('../middleware/rateLimiter');

router.use(protect);
router.post('/deposit', requestDeposit);
router.post('/deposit/:transactionId/proof', upload.single('proof'), uploadProof);
router.post('/withdraw', withdrawLimiter, requestWithdrawal);
router.get('/mine', getMyTransactions);

module.exports = router;
