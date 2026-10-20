const mongoose = require('mongoose');
const QualityInspection = require('../models/QualityInspection');
const ProductionSchedule = require('../models/ProductionSchedule');
const createNotification = require('../utils/createNotification');
const cache = require('../config/redis');
const { summarizeGroups, finalInspectionEligible, lotCanFit, reserveInProcessInspection, ensureAccountingInitialized } = require('../utils/qualityAccounting');

exports.list = async (req, res) => res.json(await QualityInspection.find().populate('inspector', 'name').populate('schedule', 'productType productionDate status').sort({ inspectedAt: -1 }));

exports.queue = async (req, res) => {
  const schedules = await ProductionSchedule.find({ status: { $in: ['IN_PROGRESS', 'COMPLETED'] } }).sort({ productionDate: 1 });
  const inspectionRows = await QualityInspection.find({ schedule: { $in: schedules.map(schedule => schedule._id) }, stage: 'IN_PROCESS' }).select('schedule inspectionGroup stage batchReference lotQuantity quantityInspected result resolutionStatus accountingStatus');
  const inspectionsBySchedule = new Map();
  for (const row of inspectionRows) { const id=String(row.schedule); const rows=inspectionsBySchedule.get(id)||[]; rows.push(row); inspectionsBySchedule.set(id,rows); }
  const inProcess = schedules.filter(schedule => schedule.status === 'IN_PROGRESS' && schedule.actualQuantity > 0).map(schedule => {
    const inspected = schedule.inProcessAccountingInitialized ? Number(schedule.inProcessInspectedQuantity || 0) : summarizeGroups(inspectionsBySchedule.get(String(schedule._id)) || []).filter(group => group.result === 'PASS').reduce((sum, group) => sum + group.quantity, 0);
    return { ...schedule.toObject(), inProcessInspectedQuantity: inspected, inProcessAvailableQuantity: Math.max(0, schedule.actualQuantity - schedule.inProcessHoldQuantity - inspected) };
  }).filter(schedule => schedule.inProcessAvailableQuantity > 0);
  const final = schedules.filter(finalInspectionEligible);
  const pendingRows = await QualityInspection.find({ result: 'FAIL', resolutionStatus: 'PENDING', accountingStatus: { $ne:'VOIDED' } }).populate('schedule', 'productType productionDate status').sort({ inspectedAt: -1 });
  const groups = new Map();
  for (const row of pendingRows) {
    const key = String(row.inspectionGroup);
    if (!groups.has(key)) groups.set(key, { groupId: key, schedule: row.schedule, stage: row.stage || 'FINAL', batchReference: row.batchReference, quantityInspected: row.quantityInspected, disposition: row.disposition, parameters: [] });
    groups.get(key).parameters.push({ parameter: row.parameter, measuredValue: row.measuredValue, specification: row.specification });
  }
  res.json({ inProcess, final, holds: Array.from(groups.values()) });
};

exports.inspect = async (req, res) => {
  let schedule = await ProductionSchedule.findById(req.params.scheduleId);
  if (!schedule) return res.status(404).json({ message: 'Production schedule not found.' });
  const stage = req.body.stage;
  if (!['IN_PROCESS', 'FINAL'].includes(stage)) return res.status(400).json({ message: 'Choose an in-process or final inspection stage.' });
  schedule = await ensureAccountingInitialized(schedule, ProductionSchedule, QualityInspection);
  if (!schedule) return res.status(404).json({ message: 'Production schedule not found.' });
  if (stage === 'IN_PROCESS' && schedule.status !== 'IN_PROGRESS') return res.status(400).json({ message: 'In-process inspection is available while production is in progress.' });
  if (stage === 'FINAL' && schedule.status !== 'COMPLETED') return res.status(400).json({ message: 'Final inspection is available after production is completed.' });
  if (stage === 'FINAL' && schedule.inProcessHoldQuantity > 0) return res.status(409).json({ message: 'Resolve all in-process batch holds before final inspection.' });
  if (stage === 'FINAL' && schedule.releaseStatus === 'RELEASED') return res.status(409).json({ message: 'This production batch is already released.' });
  if (stage === 'FINAL' && schedule.inspectionStatus === 'FAIL') return res.status(409).json({ message: 'Resolve the previous final inspection hold before inspecting again.' });

  const parameters = req.body.parameters;
  if (!Array.isArray(parameters) || parameters.length === 0) return res.status(400).json({ message: 'Add at least one inspection parameter.' });
  const quantity = Number(req.body.quantityInspected);
  const lotQuantity = Number(req.body.lotQuantity);
  const batchReference = typeof req.body.batchReference === 'string' ? req.body.batchReference.trim() : '';
  const normalizedReference = batchReference.toLocaleLowerCase();
  const lot = stage === 'IN_PROCESS' ? (schedule.inProcessInspectionLots || []).find(item => item.normalizedReference === normalizedReference) : null;
  const successfullyInspected = Number(schedule.inProcessInspectedQuantity || 0);
  const availableQuantity = Math.max(0, schedule.actualQuantity - (stage === 'FINAL' ? schedule.inProcessHoldQuantity : schedule.inProcessHoldQuantity + successfullyInspected));
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > availableQuantity) return res.status(400).json({ message: `Inspection quantity must be between 1 and ${availableQuantity} units.` });
  if (stage === 'IN_PROCESS' && !batchReference) return res.status(400).json({ message: 'Enter a batch or lot reference for in-process inspection.' });
  if (stage === 'IN_PROCESS' && (!Number.isFinite(lotQuantity) || lotQuantity <= 0)) return res.status(400).json({ message: 'Enter a lot quantity greater than zero.' });
  let passedForLot = Number(lot?.passedQuantity || 0);
  if (stage === 'IN_PROCESS') {
    if(Number(lot?.heldQuantity||0)>0)return res.status(409).json({message:'This batch already has an unresolved quality hold.'});
    const previousLotQuantity = lot?.lotQuantity;
    if (previousLotQuantity && previousLotQuantity !== lotQuantity) return res.status(409).json({ message: `Lot ${batchReference} is already recorded with a total quantity of ${previousLotQuantity}.` });
    const maximumLotQuantity = availableQuantity + passedForLot;
    if (!lotCanFit(availableQuantity, passedForLot, lotQuantity)) return res.status(400).json({ message: `Lot total cannot exceed the ${maximumLotQuantity} units currently available for this schedule${passedForLot ? ' plus units already passed from this lot' : ''}.` });
    if (quantity > lotQuantity - passedForLot) return res.status(409).json({ message: `Lot ${batchReference} has ${lotQuantity - passedForLot} units remaining for inspection.` });
  }
  if (stage === 'IN_PROCESS' && await QualityInspection.exists({ schedule: schedule._id, stage, batchReference: new RegExp(`^${batchReference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), resolutionStatus: 'PENDING' })) return res.status(409).json({ message: 'This batch already has an unresolved quality hold.' });
  if (stage === 'FINAL' && quantity !== availableQuantity) return res.status(400).json({ message: `Final inspection must cover all ${availableQuantity} releasable units.` });

  const names = new Set(); const measured = [];
  for (const item of parameters) {
    if (!item || typeof item !== 'object') return res.status(400).json({ message: 'Each inspection parameter must be an object with a name and numeric values.' });
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
    schedule: schedule._id, inspectionGroup, stage, batchReference, lotQuantity: stage === 'IN_PROCESS' ? lotQuantity : 0, quantityInspected: quantity,
    disposition, resolutionStatus: failed ? 'PENDING' : 'NOT_REQUIRED', inspector: req.user._id,
    parameter: item.parameter, measuredValue: String(item.value), specification: `${item.minimum}–${item.maximum}`,
    result: item.value >= item.minimum && item.value <= item.maximum ? 'PASS' : 'FAIL', remarks: item.remarks
  }));
  const result = failed ? 'FAIL' : 'PASS';
  let reservedSchedule = schedule;
  if (stage === 'IN_PROCESS') {
    reservedSchedule = await reserveInProcessInspection(ProductionSchedule, schedule, { quantity, failed, batchReference, lotQuantity });
    if (!reservedSchedule) return res.status(409).json({ message:'Production quantities changed while this inspection was being saved. Refresh the queue and try again.' });
  } else {
    if (!finalInspectionEligible(schedule)) return res.status(409).json({ message:'This schedule is no longer waiting for final inspection.' });
  }
  let inspections;
  try { inspections = await QualityInspection.insertMany(rows); }
  catch (error) {
    if (stage === 'IN_PROCESS') await rollbackInProcessReservation(reservedSchedule, quantity, failed, normalizedReference);
    await QualityInspection.updateMany({inspectionGroup},{$set:{accountingStatus:'VOIDED',accountingNote:'Not applied because the inspection record could not be saved completely.'}});
    throw error;
  }
  if (stage === 'FINAL') {
    const finalized = await ProductionSchedule.findOneAndUpdate(
      { _id:schedule._id, status:'COMPLETED', inProcessAccountingVersion:schedule.inProcessAccountingVersion, inspectionStatus:schedule.inspectionStatus, releaseStatus:{$ne:'RELEASED'}, inProcessHoldQuantity:0 },
      { $set:{ inspectionStatus:result, releaseStatus:failed ? 'ON_HOLD' : 'RELEASED' }, $inc:{ inProcessAccountingVersion:1 } },
      { new:true, runValidators:true }
    );
    if (!finalized) {
      await QualityInspection.updateMany({inspectionGroup},{$set:{accountingStatus:'VOIDED',accountingNote:'Not applied because the schedule changed concurrently.'}});
      return res.status(409).json({ message:'The schedule changed while final inspection was being saved. Refresh the queue and try again.' });
    }
    reservedSchedule = finalized;
  }
  schedule = reservedSchedule;
  await cache.invalidateAnalytics();
  const label = stage === 'IN_PROCESS' ? `in-process ${result.toLowerCase()} for batch ${batchReference} (${quantity} units)` : `final ${result.toLowerCase()} for ${quantity} units`;
  await createNotification(req.app, { message: `${schedule.productType}: ${label}${failed ? ` · ${disposition.toLowerCase()} required` : ''}.`, type: failed ? 'ALERT' : 'SUCCESS' });
  res.status(201).json({ schedule, inspections, result, disposition });
};

async function rollbackInProcessReservation(schedule, quantity, failed, normalizedReference) {
  for (let attempt=0; attempt<5; attempt++) {
    const current=await ProductionSchedule.findById(schedule._id);
    if(!current) return;
    const decrement=failed?'inProcessHoldQuantity':'inProcessInspectedQuantity';
    if(Number(current[decrement]||0)<quantity) return;
    const lots=(current.inProcessInspectionLots||[]).map(item=>({batchReference:item.batchReference,normalizedReference:item.normalizedReference,lotQuantity:item.lotQuantity,passedQuantity:item.passedQuantity,heldQuantity:Number(item.heldQuantity||0)}));
    const lot=lots.find(item=>item.normalizedReference===normalizedReference);
    if(lot){if(failed)lot.heldQuantity=Math.max(0,lot.heldQuantity-quantity);else lot.passedQuantity=Math.max(0,lot.passedQuantity-quantity);if(!lot.passedQuantity&&!lot.heldQuantity)lots.splice(lots.indexOf(lot),1);}
    const update={$inc:{[decrement]:-quantity,inProcessAccountingVersion:1},$set:{}};
    update.$set.inProcessInspectionLots=lots;
    if(failed)update.$set.releaseStatus=Number(current.inProcessHoldQuantity||0)-quantity>0?'ON_HOLD':current.status==='COMPLETED'?'PENDING_FINAL':'NOT_READY';
    const rolledBack=await ProductionSchedule.findOneAndUpdate({_id:current._id,inProcessAccountingVersion:current.inProcessAccountingVersion,[decrement]:current[decrement]},update,{new:true});
    if(rolledBack)return;
  }
}

exports.resolve = async (req, res) => {
  const { correctiveAction, outcome } = req.body;
  if (typeof correctiveAction !== 'string' || correctiveAction.trim().length < 5) return res.status(400).json({ message: 'Describe the corrective action (at least 5 characters).' });
  if (!['RELEASED', 'REWORKED'].includes(outcome)) return res.status(400).json({ message: 'Choose whether the held batch was released after review or reworked.' });
  const rows = await QualityInspection.find({ inspectionGroup: req.params.groupId, result: 'FAIL', resolutionStatus: 'PENDING', accountingStatus: { $ne:'VOIDED' } });
  if (!rows.length) return res.status(404).json({ message: 'Pending quality hold not found.' });
  let schedule = await ProductionSchedule.findById(rows[0].schedule);
  if (!schedule) return res.status(404).json({ message: 'Production schedule not found.' });
  schedule = await ensureAccountingInitialized(schedule, ProductionSchedule, QualityInspection);
  if (!schedule) return res.status(404).json({ message: 'Production schedule not found.' });
  if (rows[0].stage === 'FINAL' && outcome !== 'REWORKED') return res.status(400).json({ message: 'A failed final inspection must be reworked and pass a new final inspection before release.' });
  const resolution=await QualityInspection.updateMany({ inspectionGroup: req.params.groupId, resolutionStatus:'PENDING', accountingStatus: { $ne:'VOIDED' } }, { $set: { resolutionStatus: 'RESOLVED', correctiveAction: correctiveAction.trim(), resolutionOutcome: outcome } });
  if(!resolution.modifiedCount)return res.status(409).json({message:'This quality hold has already been resolved. Refresh the inspection queue.'});
  const undoResolution=async()=>QualityInspection.updateMany({inspectionGroup:req.params.groupId,resolutionStatus:'RESOLVED',correctiveAction:correctiveAction.trim()},{$set:{resolutionStatus:'PENDING',correctiveAction:''},$unset:{resolutionOutcome:1}});
  let updatedSchedule;
  if (rows[0].stage === 'IN_PROCESS') {
    for (let attempt=0; attempt<5; attempt++) {
      const quantity=Number(rows[0].quantityInspected||0);
      if(Number(schedule.inProcessHoldQuantity||0)<quantity){await undoResolution();return res.status(409).json({message:'Held quantity has changed. Refresh the inspection queue before resolving this hold.'});}
      const remaining=Number(schedule.inProcessHoldQuantity||0)-quantity;
      const normalizedReference=String(rows[0].batchReference||'').trim().toLocaleLowerCase();
      const lots=(schedule.inProcessInspectionLots||[]).map(item=>({batchReference:item.batchReference,normalizedReference:item.normalizedReference,lotQuantity:item.lotQuantity,passedQuantity:item.passedQuantity,heldQuantity:Number(item.heldQuantity||0)}));
      const lot=lots.find(item=>item.normalizedReference===normalizedReference);
      if(lot)lot.heldQuantity=Math.max(0,lot.heldQuantity-quantity);
      updatedSchedule=await ProductionSchedule.findOneAndUpdate(
        {_id:schedule._id,inProcessAccountingVersion:schedule.inProcessAccountingVersion,inProcessHoldQuantity:schedule.inProcessHoldQuantity},
        {$inc:{inProcessHoldQuantity:-quantity,inProcessAccountingVersion:1},$set:{inProcessInspectionLots:lots,releaseStatus:remaining?'ON_HOLD':schedule.status==='COMPLETED'?'PENDING_FINAL':'NOT_READY'}},
        {new:true,runValidators:true}
      );
      if(updatedSchedule)break;
      schedule=await ProductionSchedule.findById(schedule._id);
      if(!schedule){await undoResolution();return res.status(404).json({message:'Production schedule not found.'});}
    }
      if(!updatedSchedule){await undoResolution();return res.status(409).json({message:'Could not update held quantity because production changed. Retry the action.'});}
  } else {
    updatedSchedule=await ProductionSchedule.findOneAndUpdate(
      {_id:schedule._id,inProcessAccountingVersion:schedule.inProcessAccountingVersion,inspectionStatus:'FAIL',releaseStatus:{$ne:'RELEASED'}},
      {$set:{inspectionStatus:'PENDING',releaseStatus:schedule.inProcessHoldQuantity?'ON_HOLD':'PENDING_FINAL'},$inc:{inProcessAccountingVersion:1}},
      {new:true,runValidators:true}
    );
    if(!updatedSchedule){await undoResolution();return res.status(409).json({message:'Final inspection status changed. Refresh the queue before resolving this hold.'});}
  }
  schedule=updatedSchedule;
  await cache.invalidateAnalytics();
  await createNotification(req.app, { message: `Quality hold resolved for ${schedule.productType}; corrective action recorded (${outcome.toLowerCase()}).`, type: 'INFO' });
  res.json({ message: 'Corrective action recorded; batch status updated.' });
};
