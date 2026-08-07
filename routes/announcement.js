const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { createAnnouncement, getAllAnnouncements, deleteAnnouncement, toggleAnnouncement, getActiveAnnouncements } = require('../controllers/announcementController');

// Public - active announcements for users
router.get('/active', protect, getActiveAnnouncements);

// Admin only
router.use(protect, adminOnly);
router.get('/', getAllAnnouncements);
router.post('/', createAnnouncement);
router.delete('/:id', deleteAnnouncement);
router.put('/:id/toggle', toggleAnnouncement);

module.exports = router;
