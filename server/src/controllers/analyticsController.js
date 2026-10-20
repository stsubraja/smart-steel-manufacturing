const ProductionSchedule = require('../models/ProductionSchedule');
const Furnace = require('../models/Furnace');
const RawMaterial = require('../models/RawMaterial');
const QualityInspection = require('../models/QualityInspection');
const Notification = require('../models/Notification');
const cache = require('../config/redis');

exports.dashboard = async (req, res) => {
  const now = new Date(); const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
  const [today, activeSchedules, furnaces, materials, heldSchedules, finalPending, notifications] = await Promise.all([
    ProductionSchedule.find({ productionDate: { $gte: start, $lt: end }, status: { $ne: 'CANCELLED' } }),
    ProductionSchedule.countDocuments({ status: 'IN_PROGRESS' }),
    Furnace.find().select('name status isRunning temperature minTemperature maxTemperature'),
    RawMaterial.find().select('name quantity minimumLevel unit'),
    ProductionSchedule.find({ releaseStatus: 'ON_HOLD' }).select('productType status inspectionStatus inProcessHoldQuantity'),
    ProductionSchedule.countDocuments({ status: 'COMPLETED', inProcessHoldQuantity: { $in: [0, null] }, inspectionStatus: { $in: ['PENDING', null] } }),
    Notification.find({$or:[{audience:'ALL_USERS'},{audience:'USERS',recipients:req.user._id},{audience:'ACTIVE_USERS',recipients:req.user._id}]}).sort({ createdAt: -1 }).limit(5)
  ]);
  res.json({
    plannedToday: today.reduce((sum, row) => sum + row.plannedQuantity, 0),
    actualToday: today.reduce((sum, row) => sum + row.actualQuantity, 0),
    activeSchedules,
    completedToday: today.filter(row => row.status === 'COMPLETED').length,
    furnaceCount: furnaces.length,
    furnacesRunning: furnaces.filter(row => row.isRunning !== false).length,
    furnaceAlerts: furnaces.filter(row => ['WARNING', 'CRITICAL'].includes(row.status)).length,
    furnacesStopped: furnaces.filter(row => row.isRunning === false).length,
    lowStock: materials.filter(row => row.quantity <= row.minimumLevel).length,
    heldSchedules,
    finalPending,
    furnaces,
    lowStockItems: materials.filter(row => row.quantity <= row.minimumLevel),
    recentNotifications: notifications
  });
};

exports.report = async (req, res) => {
  const days = Math.min(30, Math.max(7, Number(req.query.days) || 7));
  const cacheKey = `analytics:report:${days}`;
  const cached = await cache.get(cacheKey);
  if (cached) return res.json(JSON.parse(cached));
  const end = new Date(); end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - days + 1); start.setUTCHours(0, 0, 0, 0);
  const [schedules, inspections, materials] = await Promise.all([
    ProductionSchedule.find({ productionDate: { $gte: start, $lte: end }, status: { $ne: 'CANCELLED' } }).select('productType productionDate plannedQuantity actualQuantity status releaseStatus'),
    QualityInspection.find({ inspectedAt: { $gte: start, $lte: end } }).select('stage result resolutionStatus'),
    RawMaterial.find().select('name quantity minimumLevel unit')
  ]);
  const byDay = new Map();
  for (let offset = 0; offset < days; offset++) {
    const date = new Date(start); date.setUTCDate(date.getUTCDate() + offset);
    const key = date.toISOString().slice(0, 10);
    byDay.set(key, { date: key, planned: 0, actual: 0, schedules: 0 });
  }
  for (const row of schedules) {
    const key = new Date(row.productionDate).toISOString().slice(0, 10);
    const day = byDay.get(key); if (!day) continue;
    day.planned += row.plannedQuantity; day.actual += row.actualQuantity; day.schedules += 1;
  }
  const passed = inspections.filter(row => row.result === 'PASS').length;
  const failed = inspections.filter(row => row.result === 'FAIL').length;
  const report = {
    days, dailyProduction: Array.from(byDay.values()),
    plannedProduction: schedules.reduce((sum, row) => sum + row.plannedQuantity, 0),
    actualProduction: schedules.reduce((sum, row) => sum + row.actualQuantity, 0),
    scheduleCount: schedules.length,
    completed: schedules.filter(row => row.status === 'COMPLETED').length,
    inProgress: schedules.filter(row => row.status === 'IN_PROGRESS').length,
    attainment: schedules.reduce((sum, row) => sum + row.plannedQuantity, 0) ? Math.round(100 * schedules.reduce((sum, row) => sum + row.actualQuantity, 0) / schedules.reduce((sum, row) => sum + row.plannedQuantity, 0)) : 0,
    qualityPass: passed, qualityFail: failed,
    qualityPassRate: passed + failed ? Math.round(100 * passed / (passed + failed)) : 0,
    inProcessInspections: inspections.filter(row => row.stage === 'IN_PROCESS').length,
    finalInspections: inspections.filter(row => row.stage === 'FINAL' || !row.stage).length,
    qualityHolds: inspections.filter(row => row.result === 'FAIL' && row.resolutionStatus === 'PENDING').length,
    lowStockItems: materials.filter(row => row.quantity <= row.minimumLevel)
  };
  await cache.set(cacheKey, JSON.stringify(report), 15);
  res.json(report);
};
