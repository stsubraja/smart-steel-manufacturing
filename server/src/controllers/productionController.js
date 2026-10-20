const ProductionSchedule = require('../models/ProductionSchedule');
const QualityInspection = require('../models/QualityInspection');
const createNotification = require('../utils/createNotification');
const cache = require('../config/redis');
const { ensureAccountingInitialized } = require('../utils/qualityAccounting');
const editableFields = new Set(['actualQuantity', 'status', 'notes']);
function getEditableUpdates(body) {
  const forbidden = Object.keys(body).filter(key => !editableFields.has(key));
  if (forbidden.length) { const error=new Error(`These fields cannot be updated here: ${forbidden.join(', ')}.`); error.status=400; throw error; }
  return Object.fromEntries(Object.entries(body).filter(([key]) => editableFields.has(key)));
}
exports.list = async (req,res) => res.json(await ProductionSchedule.find().populate('createdBy','name email').sort({productionDate:1}));
exports.create = async (req,res) => {
  const { productType, productionDate, plannedQuantity } = req.body;
  if (!productType?.trim() || !productionDate || !Number.isFinite(Number(plannedQuantity)) || Number(plannedQuantity) <= 0) return res.status(400).json({ message: 'Enter a product, production date, and planned quantity greater than zero.' });
  const date = new Date(productionDate);
  if (Number.isNaN(date.getTime())) return res.status(400).json({ message: 'Enter a valid production date.' });
  const start = new Date(date); start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
  const duplicate = await ProductionSchedule.findOne({ productType: new RegExp(`^${productType.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), productionDate: { $gte: start, $lt: end }, status: { $ne: 'CANCELLED' } });
  if (duplicate) return res.status(409).json({ message: 'A schedule for this product already exists on that date.' });
  const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';
  const schedule = await ProductionSchedule.create({ productType: productType.trim(), productionDate: date, plannedQuantity: Number(plannedQuantity), notes, createdBy: req.user._id });
  await cache.invalidateAnalytics();
  await createNotification(req.app, { message: `Production scheduled: ${schedule.productType} (${schedule.plannedQuantity} units).`, type: 'INFO' });
  res.status(201).json(schedule);
};
exports.update = async (req,res) => {
  let previous = await ProductionSchedule.findById(req.params.id);
  if (!previous) return res.status(404).json({message:'Schedule not found'});
  previous = await ensureAccountingInitialized(previous, ProductionSchedule, QualityInspection);
  if (!previous) return res.status(404).json({message:'Schedule not found'});
  let updates;
  try { updates=getEditableUpdates(req.body); }
  catch(error) { return res.status(error.status||400).json({message:error.message}); }
  if (updates.actualQuantity !== undefined) {
    updates.actualQuantity = Number(updates.actualQuantity);
    if (!Number.isFinite(updates.actualQuantity) || updates.actualQuantity < 0) return res.status(400).json({ message: 'Actual production must be a non-negative number.' });
    if (previous.status === 'COMPLETED' || previous.status === 'CANCELLED') return res.status(409).json({ message: 'Actual production is locked after a schedule is completed or cancelled.' });
    const committedQuantity = Number(previous.inProcessHoldQuantity || 0) + Number(previous.inProcessInspectedQuantity || 0);
    if (updates.actualQuantity < committedQuantity) return res.status(409).json({ message: `Actual production cannot be reduced below ${committedQuantity} units already held or passed in inspection.` });
  }
  if (updates.status !== undefined) {
    if (!['PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'].includes(updates.status)) return res.status(400).json({ message: 'Choose a valid production status.' });
    const transitions = { PLANNED: ['PLANNED','IN_PROGRESS','CANCELLED'], IN_PROGRESS: ['IN_PROGRESS','COMPLETED','CANCELLED'], COMPLETED: ['COMPLETED'], CANCELLED: ['CANCELLED'] };
    if (!transitions[previous.status]?.includes(updates.status)) return res.status(409).json({ message: `A ${previous.status.toLowerCase()} schedule cannot be changed to ${updates.status.toLowerCase()}.` });
  }
  if (updates.status === 'COMPLETED' && Number(updates.actualQuantity ?? previous.actualQuantity) <= 0) return res.status(400).json({ message: 'Enter actual production above zero before completing this schedule.' });
  if (updates.status === 'COMPLETED' && previous.status !== 'COMPLETED') updates.releaseStatus = previous.inProcessHoldQuantity > 0 ? 'ON_HOLD' : 'PENDING_FINAL';
  const set={...updates};
  const x=await ProductionSchedule.findOneAndUpdate({_id:req.params.id,inProcessAccountingVersion:previous.inProcessAccountingVersion,status:previous.status,actualQuantity:previous.actualQuantity},{$set:set,$inc:{inProcessAccountingVersion:1}},{new:true,runValidators:true});
  if(!x)return res.status(409).json({message:'This production schedule changed while you were updating it. Refresh and try again.'});
  await cache.invalidateAnalytics();
  if (x.status === 'COMPLETED' && previous.status !== 'COMPLETED') await createNotification(req.app, { message: `${x.productType} production completed (${x.actualQuantity} units). It is ready for quality inspection.`, type: 'SUCCESS' });
  res.json(x);
};
exports.remove = async (req,res) => { await ProductionSchedule.findByIdAndDelete(req.params.id); await cache.invalidateAnalytics(); res.json({message:'Schedule deleted'}); };
exports.getEditableUpdates = getEditableUpdates;
