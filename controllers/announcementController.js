const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const User = require('../models/User');

// Admin: create announcement
exports.createAnnouncement = async (req, res) => {
  try {
    const { title, message, type, expiresAt } = req.body;
    if (!title || !message) return res.status(400).json({ success: false, message: 'Title and message are required.' });

    const announcement = await Announcement.create({
      title, message, type: type || 'info',
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: req.user.id,
    });

    // Create notification for all users
    const users = await User.find({ role: 'user', isBanned: false }).select('_id');
    const notifications = users.map(u => ({
      user: u._id, title, body: message, type: 'announcement', data: { announcementId: announcement._id }
    }));
    await Notification.insertMany(notifications);

    res.status(201).json({ success: true, message: 'Announcement posted to all users.', announcement });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Admin: get all announcements
exports.getAllAnnouncements = async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, announcements });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Admin: delete announcement
exports.deleteAnnouncement = async (req, res) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Announcement deleted.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Admin: toggle announcement active state
exports.toggleAnnouncement = async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ success: false, message: 'Not found.' });
    ann.isActive = !ann.isActive;
    await ann.save();
    res.json({ success: true, message: `Announcement ${ann.isActive ? 'activated' : 'deactivated'}.`, isActive: ann.isActive });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Public: get active announcements (for users)
exports.getActiveAnnouncements = async (req, res) => {
  try {
    const now = new Date();
    const announcements = await Announcement.find({
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
    }).sort({ createdAt: -1 }).limit(5);
    res.json({ success: true, announcements });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
