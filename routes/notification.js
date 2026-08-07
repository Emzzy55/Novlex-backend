const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getMyNotifications, markAllRead, markRead, getUnreadCount } = require('../controllers/notificationController');

router.use(protect);
router.get('/', getMyNotifications);
router.get('/unread-count', getUnreadCount);
router.put('/mark-all-read', markAllRead);
router.put('/:id/read', markRead);

module.exports = router;
