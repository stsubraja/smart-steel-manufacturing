const mongoose = require('mongoose');
const QualityInspection = require('../models/QualityInspection');
const ProductionSchedule = require('../models/ProductionSchedule');
const createNotification = require('../utils/createNotification');
const cache = require('../config/redis');

exports.list = async (req, res) => res.json(await QualityInspection.find().populate('inspector', 'name').populate('schedule', 'productType productionDate status').sort({ inspectedAt: -1 }));

exports.queue = async (req, res) => {
  const schedules = await ProductionSchedule.find({ status: { $in: ['IN_PROGRESS', 'COMPLETED'] } }).sort({ productionDate: 1 });
  const inProcess = schedules.filter(schedule => schedule.status === 'IN_PROGRESS' && schedule.actualQuantity > 0);
  const passedFinal = await QualityInspection.distinct('schedule', { result: 'PASS', $or: [{ stage: 'FINAL' }, { stage: null }] });
  const final = schedules.filter(schedule => schedule.status === 'COMPLETED' && schedule.inspectionStatus !== 'PASS' && schedule.inspectionStatus !== 'FAIL' && !passedFinal.some(id => String(id) === String(schedule._id)) && schedule.inProcessHoldQuantity === 0);
  const pendingRows = await QualityInspection.find({ result: 'FAIL', resolutionStatus: 'PENDING' }).populate('schedule', 'productType productionDate status').sort({ inspectedAt: -1 });
  const groups = new Map();
  for (const row of pendingRows) {
    const key = String(row.inspectionGroup);
    if (!groups.has(key)) groups.set(key, { groupId: key, schedule: row.schedule, stage: row.stage || 'FINAL', batchReference: row.batchReference, quantityInspected: row.quantityInspected, disposition: row.disposition, parameters: [] });
    groups.get(key).parameters.push({ parameter: row.parameter, measuredValue: row.measuredValue, specification: row.specification });
  }
  res.json({ inProcess, final, holds: Array.from(groups.values()) });
};

exports.inspect = async (req, res) => {
  const schedule = await ProductionSchedule.findById(req.params.scheduleId);
  if (!schedule) return res.status(404).json({ message: 'Production schedule not found.' });
  const stage = req.body.stage;
  if (!['IN_PROCESS', 'FINAL'].includes(stage)) return res.status(400).json({ message: 'Choose an in-process or final inspection stage.' });
  if (stage === 'IN_PROCESS' && schedule.status !== 'IN_PROGRESS') return res.status(400).json({ message: 'In-process inspection is available while production is in progress.' });
  if (stage === 'FINAL' && schedule.status !== 'COMPLETED') return res.status(400).json({ message: 'Final inspection is available after production is completed.' });
  if (stage === 'FINAL' && schedule.inProcessHoldQuantity > 0) return res.status(409).json({ message: 'Resolve all in-process batch holds before final inspection.' });
  if (stage === 'FINAL' && schedule.releaseStatus === 'RELEASED') return res.status(409).json({ message: 'This production batch is already released.' });
  if (stage === 'FINAL' && schedule.inspectionStatus === 'FAIL') return res.status(409).json({ message: 'Resolve the previous final inspection hold before inspecting again.' });

  const parameters = req.body.parameters;
  if (!Array.isArray(parameters) || parameters.length === 0) return res.status(400).json({ message: 'Add at least one inspection parameter.' });
  const quantity = Number(req.body.quantityInspected);
  const batchReference = typeof req.body.batchReference === 'string' ? req.body.batchReference.trim() : '';
  const availableQuantity = Math.max(0, schedule.actualQuantity - (stage === 'FINAL' ? schedule.inProcessHoldQuantity : 0));
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > availableQuantity) return res.status(400).json({ message: `Inspection quantity must be between 1 and ${availableQuantity} units.` });
  if (stage === 'IN_PROCESS' && !batchReference) return res.status(400).json({ message: 'Enter a batch or lot reference for in-process inspection.' });
  if (stage === 'IN_PROCESS' && await QualityInspection.exists({ schedule: schedule._id, stage, batchReference: new RegExp(`^${batchReference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), resolutionStatus: 'PENDING' })) return res.status(409).json({ message: 'This batch already has an unresolved quality hold.' });
  if (stage === 'FINAL' && quantity !== availableQuantity) return res.status(400).json({ message: `Final inspection must cover all ${availableQuantity} releasable units.` });

  const names = new Set(); const measured = [];
  for (const item of parameters) {
    const parameter = typeof item.parameter === 'string' ? item.parameter.trim() : '';
    if (names.has(parameter.toLowerCase())) return res.status(409).json({ message: `The parameter "${parameter}" is listed more than once.` });
    names.add(parameter.toLowerCase());
    if (!parameter || item.measuredValue === '' || item.minimum === '' || item.maximum === '') return res.status(400).json({ message: 'Enter a parameter, non-negative measured value, and minimum and maximum limits for every row.' });
    const value = Number(item.measuredValue), minimum = Number(item.minimum), maximum = Number(item.maximum);
    if (![value, minimum, maximum].every(Number.isFinite) || value < 0 || minimum < 0 || maximum < minimum) return res.status(400).json({ message: 'Quality values and limits must be non-negative numbers, with maximum at least the minimum.' });
    measured.push({ parameter, value, minimum, maximum, remarks: typeof item.remarks === 'string' ? item.remarks.trim() : '' });
  }

  const failed = measured.some(item => item.value < item.minimum || item.value > item.maximum);
  const disposition = failed ? req.body.disposition : 'CONTINUE';
  if (failed && !['HOLD', 'REWORK'].includes(disposition)) return res.status(400).json({ message: 'A failed inspection must be placed on hold or assigned for rework.' });
  const inspectionGroup = new mongoose.Types.ObjectId();
  const rows = measured.map((item, index) => ({
    schedule: schedule._id, inspectionGroup, stage, batchReference, quantityInspected: quantity,
    disposition, resolutionStatus: failed ? 'PENDING' : 'NOT_REQUIRED', inspector: req.user._id,
    parameter: item.parameter, measuredValue: String(item.value), specification: `${item.minimum}–${item.maximum}`,
    result: item.value >= item.minimum && item.value <= item.maximum ? 'PASS' : 'FAIL', remarks: item.remarks
  }));
  const result = failed ? 'FAIL' : 'PASS';
  const inspections = await QualityInspection.insertMany(rows);

  if (stage === 'IN_PROCESS') {
    if (failed) {
      schedule.inProcessHoldQuantity += quantity;
      schedule.releaseStatus = 'ON_HOLD';
    }
  } else {
    schedule.inspectionStatus = result;
    schedule.releaseStatus = failed ? 'ON_HOLD' : 'RELEASED';
  }
  await schedule.save();
  await cache.invalidateAnalytics();
  const label = stage === 'IN_PROCESS' ? `in-process ${result.toLowerCase()} for batch ${batchReference} (${quantity} units)` : `final ${result.toLowerCase()} for ${quantity} units`;
  await createNotification(req.app, { message: `${schedule.productType}: ${label}${failed ? ` · ${disposition.toLowerCase()} required` : ''}.`, type: failed ? 'ALERT' : 'SUCCESS' });
  res.status(201).json({ schedule, inspections, result, disposition });
};

exports.resolve = async (req, res) => {
  const { correctiveAction, outcome } = req.body;
  if (typeof correctiveAction !== 'string' || correctiveAction.trim().length < 5) return res.status(400).json({ message: 'Describe the corrective action (at least 5 characters).' });
  if (!['RELEASED', 'REWORKED'].includes(outcome)) return res.status(400).json({ message: 'Choose whether the held batch was released after review or reworked.' });
  const rows = await QualityInspection.find({ inspectionGroup: req.params.groupId, result: 'FAIL', resolutionStatus: 'PENDING' });
  if (!rows.length) return res.status(404).json({ message: 'Pending quality hold not found.' });
  const schedule = await ProductionSchedule.findById(rows[0].schedule);
  if (!schedule) return res.status(404).json({ message: 'Production schedule not found.' });
  if (rows[0].stage === 'FINAL' && outcome !== 'REWORKED') return res.status(400).json({ message: 'A failed final inspection must be reworked and pass a new final inspection before release.' });
  await QualityInspection.updateMany({ inspectionGroup: req.params.groupId }, { $set: { resolutionStatus: 'RESOLVED', correctiveAction: correctiveAction.trim(), resolutionOutcome: outcome } });
  if (rows[0].stage === 'IN_PROCESS') {
    const pending = await QualityInspection.find({ schedule: schedule._id, stage: 'IN_PROCESS', result: 'FAIL', resolutionStatus: 'PENDING' });
    const heldByGroup = new Map(pending.map(row => [String(row.inspectionGroup), row.quantityInspected]));
    schedule.inProcessHoldQuantity = Array.from(heldByGroup.values()).reduce((sum, quantity) => sum + quantity, 0);
    if (!schedule.inProcessHoldQuantity) schedule.releaseStatus = schedule.status === 'COMPLETED' ? 'PENDING_FINAL' : 'NOT_READY';
  } else {
    schedule.inspectionStatus = 'PENDING';
    schedule.releaseStatus = schedule.inProcessHoldQuantity ? 'ON_HOLD' : 'PENDING_FINAL';
  }
  await schedule.save();
  await cache.invalidateAnalytics();
  await createNotification(req.app, { message: `Quality hold resolved for ${schedule.productType}; corrective action recorded (${outcome.toLowerCase()}).`, type: 'INFO' });
  res.json({ message: 'Corrective action recorded; batch status updated.' });
};
