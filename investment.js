const express = require('express');
const router = express.Router();
const { getPlans, invest, getMyInvestments } = require('../controllers/investmentController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/plans', getPlans);
router.post('/invest', invest);
router.get('/mine', getMyInvestments);

module.exports = router;
