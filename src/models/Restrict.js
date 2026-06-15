const mongoose = require('mongoose');

const restrictSchema = new mongoose.Schema({
  restrictor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  restricted_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at:    { type: Date, default: Date.now },
});

restrictSchema.index({ restrictor_id: 1, restricted_id: 1 }, { unique: true });

module.exports = mongoose.model('Restrict', restrictSchema);
