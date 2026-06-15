const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    messaging: {
      auto_download_images:    { type: Boolean, default: true },
      auto_download_videos:    { type: Boolean, default: false },
      auto_download_documents: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserSettings', userSettingsSchema);
