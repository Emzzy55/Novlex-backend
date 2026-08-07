const Notification = require('../models/Notification');

// Get user notifications
exports.getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(30);
    const unreadCount = await Notification.countDocuments({ user: req.user.id, isRead: false });
    res.json({ success: true, notifications, unreadCount });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Mark all as read
exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user.id, isRead: false }, { isRead: true });
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Mark one as read
exports.markRead = async (req, res) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, { isRead: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Get unread count only
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ user: req.user.id, isRead: false });
    res.json({ success: true, count });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
