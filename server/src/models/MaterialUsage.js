const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  material: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
  schedule: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionSchedule' },
  quantityUsed: { type: Number, required: true, min: 0 },
  usedAt: { type: Date, default: Date.now },
  notes: { type: String, default: '' }
}, { timestamps: true });
module.exports = mongoose.model('MaterialUsage', schema);
