const Member = require('../models/Member');

exports.getMyMember = async (req, res) => {
  try {
    const userId = req.userId;
    const member = await Member.findOne({ user_id: userId });
    if (!member) return res.status(404).json({ message: 'Member profile not found' });
    return res.json(member);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getMemberByUserId = async (req, res) => {
  try {
    const userId = req.params.id;
    const member = await Member.findOne({ user_id: userId });
    if (!member) return res.status(404).json({ message: 'Member profile not found' });
    return res.json(member);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};
