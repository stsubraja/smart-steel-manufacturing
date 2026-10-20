const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  schedule: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionSchedule' },
  inspector: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  parameter: { type: String, required: true },
  measuredValue: { type: String, required: true },
  specification: { type: String, default: '' },
  result: { type: String, enum: ['PASS','FAIL','PENDING'], default: 'PENDING' },
  inspectedAt: { type: Date, default: Date.now },
  remarks: { type: String, default: '' }
}, { timestamps: true });
module.exports = mongoose.model('QualityInspection', schema);
