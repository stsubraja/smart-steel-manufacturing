const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  schedule: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionSchedule' },
  inspectionGroup: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  stage: { type: String, enum: ['IN_PROCESS','FINAL'], default: 'FINAL' },
  batchReference: { type: String, default: '' },
  lotQuantity: { type: Number, default: 0, min: 0 },
  quantityInspected: { type: Number, default: 0, min: 0 },
  disposition: { type: String, enum: ['CONTINUE','HOLD','REWORK'], default: 'CONTINUE' },
  resolutionStatus: { type: String, enum: ['NOT_REQUIRED','PENDING','RESOLVED'], default: 'NOT_REQUIRED' },
  correctiveAction: { type: String, default: '' },
  resolutionOutcome: { type: String, enum: ['RELEASED','REWORKED'], default: undefined },
  inspector: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  parameter: { type: String, required: true },
  measuredValue: { type: String, required: true },
  specification: { type: String, default: '' },
  result: { type: String, enum: ['PASS','FAIL','PENDING'], default: 'PENDING' },
  inspectedAt: { type: Date, default: Date.now },
  remarks: { type: String, default: '' }
}, { timestamps: true });
module.exports = mongoose.model('QualityInspection', schema);
