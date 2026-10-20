const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  productType: { type: String, required: true, trim: true },
  productionDate: { type: Date, required: true },
  plannedQuantity: { type: Number, required: true, min: 0 },
  actualQuantity: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'], default: 'PLANNED' },
  inspectionStatus: { type: String, enum: ['PENDING','PASS','FAIL'], default: 'PENDING' },
  releaseStatus: { type: String, enum: ['NOT_READY','PENDING_FINAL','ON_HOLD','RELEASED'], default: 'NOT_READY' },
  inProcessHoldQuantity: { type: Number, default: 0, min: 0 },
  notes: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
module.exports = mongoose.model('ProductionSchedule', schema);
