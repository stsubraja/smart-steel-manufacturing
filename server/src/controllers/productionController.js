const ProductionSchedule = require('../models/ProductionSchedule');
const createNotification = require('../utils/createNotification');
const cache = require('../config/redis');
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
  const schedule = await ProductionSchedule.create({ ...req.body, productType: productType.trim(), productionDate: date, plannedQuantity: Number(plannedQuantity), createdBy: req.user._id });
  await cache.invalidateAnalytics();
  await createNotification(req.app, { message: `Production scheduled: ${schedule.productType} (${schedule.plannedQuantity} units).`, type: 'INFO' });
  res.status(201).json(schedule);
};
exports.update = async (req,res) => {
  const previous = await ProductionSchedule.findById(req.params.id);
  if (!previous) return res.status(404).json({message:'Schedule not found'});
  const updates = { ...req.body };
  if (updates.actualQuantity !== undefined) {
    updates.actualQuantity = Number(updates.actualQuantity);
    if (!Number.isFinite(updates.actualQuantity) || updates.actualQuantity < 0) return res.status(400).json({ message: 'Actual production must be a non-negative number.' });
  }
  if (updates.status === 'COMPLETED' && Number(updates.actualQuantity ?? previous.actualQuantity) <= 0) return res.status(400).json({ message: 'Enter actual production above zero before completing this schedule.' });
  if (updates.status === 'COMPLETED' && previous.status !== 'COMPLETED') updates.releaseStatus = previous.inProcessHoldQuantity > 0 ? 'ON_HOLD' : 'PENDING_FINAL';
  const x=await ProductionSchedule.findByIdAndUpdate(req.params.id,updates,{new:true,runValidators:true});
  await cache.invalidateAnalytics();
  if (x.status === 'COMPLETED' && previous.status !== 'COMPLETED') await createNotification(req.app, { message: `${x.productType} production completed (${x.actualQuantity} units). It is ready for quality inspection.`, type: 'SUCCESS' });
  res.json(x);
};
exports.remove = async (req,res) => { await ProductionSchedule.findByIdAndDelete(req.params.id); await cache.invalidateAnalytics(); res.json({message:'Schedule deleted'}); };
