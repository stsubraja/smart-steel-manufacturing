function summarizeGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    const id = String(row.inspectionGroup || row._id);
    if (!groups.has(id)) groups.set(id, { id, rows: [], schedule: row.schedule, stage: row.stage || 'FINAL', batchReference: row.batchReference || '', lotQuantity: Number(row.lotQuantity || 0), quantity: Number(row.quantityInspected || 0), resolutionStatus: row.resolutionStatus || 'NOT_REQUIRED' });
    groups.get(id).rows.push(row);
  }
  return Array.from(groups.values()).map(group => {
    const voided = group.rows.some(row => row.accountingStatus === 'VOIDED');
    const hasFailure = group.rows.some(row => row.result === 'FAIL');
    const allPassed = group.rows.length > 0 && group.rows.every(row => row.result === 'PASS');
    return { ...group, result: voided ? 'VOIDED' : hasFailure ? 'FAIL' : allPassed ? 'PASS' : 'PENDING', hasPendingResolution: !voided && group.rows.some(row => row.resolutionStatus === 'PENDING') };
  });
}

function buildLegacyAccounting(rows) {
  const groups = summarizeGroups(rows.filter(row => (row.stage || 'FINAL') === 'IN_PROCESS')).filter(group => group.result !== 'VOIDED');
  const passed = groups.filter(group => group.result === 'PASS');
  const held = groups.filter(group => group.result === 'FAIL' && group.hasPendingResolution);
  const lots = new Map();
  for (const group of groups) {
    const key = group.batchReference.trim().toLocaleLowerCase();
    if (!key) continue;
    const lot = lots.get(key) || { batchReference: group.batchReference.trim(), normalizedReference: key, lotQuantity: group.lotQuantity, passedQuantity: 0, heldQuantity: 0 };
    if (group.result === 'PASS') lot.passedQuantity += group.quantity;
    if (group.result === 'FAIL' && group.hasPendingResolution) lot.heldQuantity += group.quantity;
    if (!lot.lotQuantity && group.lotQuantity) lot.lotQuantity = group.lotQuantity;
    lots.set(key, lot);
  }
  return {
    inspectedQuantity: passed.reduce((sum, group) => sum + group.quantity, 0),
    holdQuantity: held.reduce((sum, group) => sum + group.quantity, 0),
    lots: Array.from(lots.values())
  };
}

function finalInspectionEligible(schedule) {
  return schedule.status === 'COMPLETED'
    && schedule.inspectionStatus !== 'PASS'
    && schedule.inspectionStatus !== 'FAIL'
    && schedule.releaseStatus !== 'RELEASED'
    && Number(schedule.inProcessHoldQuantity || 0) === 0;
}

function lotRemaining(lotQuantity, passedQuantity) {
  return Math.max(0, Number(lotQuantity) - Number(passedQuantity || 0));
}

function lotCanFit(availableQuantity, alreadyPassedFromLot, lotQuantity) {
  return Number(lotQuantity) <= Number(availableQuantity) + Number(alreadyPassedFromLot || 0);
}

async function reserveInProcessInspection(ProductionSchedule, schedule, { quantity, failed, batchReference, lotQuantity }) {
  const normalizedReference = String(batchReference || '').trim().toLocaleLowerCase();
  const lots = (schedule.inProcessInspectionLots || []).map(item => ({ batchReference:item.batchReference, normalizedReference:item.normalizedReference, lotQuantity:item.lotQuantity, passedQuantity:item.passedQuantity, heldQuantity:Number(item.heldQuantity||0) }));
  const lot = lots.find(item => item.normalizedReference === normalizedReference);
  if (lot) { lot.lotQuantity = lotQuantity; if(failed)lot.heldQuantity += quantity; else lot.passedQuantity += quantity; }
  else lots.push({ batchReference:String(batchReference).trim(), normalizedReference, lotQuantity, passedQuantity:failed?0:quantity, heldQuantity:failed?quantity:0 });
  const increment = { inProcessAccountingVersion:1, [failed ? 'inProcessHoldQuantity' : 'inProcessInspectedQuantity']:quantity };
  const set = failed ? { releaseStatus:'ON_HOLD', inProcessInspectionLots:lots } : { inProcessInspectionLots:lots };
  return ProductionSchedule.findOneAndUpdate(
    { _id:schedule._id, status:'IN_PROGRESS', inProcessAccountingVersion:schedule.inProcessAccountingVersion, actualQuantity:schedule.actualQuantity, inProcessHoldQuantity:schedule.inProcessHoldQuantity, inProcessInspectedQuantity:schedule.inProcessInspectedQuantity },
    { $inc:increment, $set:set }, { new:true, runValidators:true }
  );
}

async function ensureAccountingInitialized(schedule, ProductionSchedule, QualityInspection) {
  if (schedule.inProcessAccountingInitialized) return schedule;
  const rows = await QualityInspection.find({ schedule: schedule._id, stage: 'IN_PROCESS' }).select('inspectionGroup stage batchReference lotQuantity quantityInspected result resolutionStatus accountingStatus');
  const legacy = buildLegacyAccounting(rows);
  const initialized = await ProductionSchedule.findOneAndUpdate(
    { _id: schedule._id, inProcessAccountingInitialized: { $ne: true } },
    { $set: { inProcessInspectedQuantity: legacy.inspectedQuantity, inProcessHoldQuantity: legacy.holdQuantity, inProcessInspectionLots: legacy.lots, inProcessAccountingInitialized: true }, $inc: { inProcessAccountingVersion: 1 } },
    { new: true, runValidators: true }
  );
  return initialized || ProductionSchedule.findById(schedule._id);
}

module.exports = { summarizeGroups, buildLegacyAccounting, finalInspectionEligible, lotRemaining, lotCanFit, reserveInProcessInspection, ensureAccountingInitialized };
