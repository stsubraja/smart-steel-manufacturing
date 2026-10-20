const ProductionSchedule = require('../models/ProductionSchedule');
const Furnace = require('../models/Furnace');
const RawMaterial = require('../models/RawMaterial');
const QualityInspection = require('../models/QualityInspection');
const Notification = require('../models/Notification');
const cache = require('../config/redis');
const { summarizeGroups } = require('../utils/qualityAccounting');
const { visibleNotificationQuery } = require('../utils/notificationAudience');

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
    Notification.find(visibleNotificationQuery(req.user)).sort({ createdAt: -1 }).limit(5)
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
  if (cached) {
    try { return res.json(JSON.parse(cached)); }
    catch { await cache.del(cacheKey); }
  }
  const end = new Date(); end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - days + 1); start.setUTCHours(0, 0, 0, 0);
  const [schedules, inspections, materials] = await Promise.all([
    ProductionSchedule.find({ productionDate: { $gte: start, $lte: end }, status: { $ne: 'CANCELLED' } }).select('productType productionDate plannedQuantity actualQuantity status releaseStatus'),
    QualityInspection.find({ inspectedAt: { $gte: start, $lte: end } }).select('inspectionGroup stage result resolutionStatus quantityInspected accountingStatus'),
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
  const inspectionGroups=summarizeGroups(inspections);
  const passed = inspectionGroups.filter(group => group.result === 'PASS').length;
  const failed = inspectionGroups.filter(group => group.result === 'FAIL').length;
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
    inProcessInspections: inspectionGroups.filter(group => group.stage === 'IN_PROCESS').length,
    finalInspections: inspectionGroups.filter(group => group.stage === 'FINAL').length,
    qualityHolds: inspectionGroups.filter(group => group.result === 'FAIL' && group.hasPendingResolution).length,
    lowStockItems: materials.filter(row => row.quantity <= row.minimumLevel)
  };
  await cache.set(cacheKey, JSON.stringify(report), 15);
  res.json(report);
};
