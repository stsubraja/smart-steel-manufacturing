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
  inProcessInspectedQuantity: { type: Number, default: 0, min: 0 },
  inProcessInspectionLots: [{
    batchReference: { type: String, required: true },
    normalizedReference: { type: String, required: true },
    lotQuantity: { type: Number, min: 0, default: 0 },
    passedQuantity: { type: Number, min: 0, default: 0 },
    heldQuantity: { type: Number, min: 0, default: 0 }
  }],
  inProcessAccountingVersion: { type: Number, min: 0, default: 0 },
  inProcessAccountingInitialized: { type: Boolean, default: false },
  notes: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
module.exports = mongoose.model('ProductionSchedule', schema);
