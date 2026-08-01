const express = require('express');
const router = express.Router();
const { getPlans, invest, getMyInvestments, claimEarnings, getClaimStatus } = require('../controllers/investmentController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/plans', getPlans);
router.post('/invest', invest);
router.get('/mine', getMyInvestments);
router.post('/claim', claimEarnings);
router.get('/claim-status', getClaimStatus);

module.exports = router;
