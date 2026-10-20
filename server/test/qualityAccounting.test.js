const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeGroups, buildLegacyAccounting, finalInspectionEligible, lotCanFit, lotRemaining, reserveInProcessInspection } = require('../src/utils/qualityAccounting');

test('a mixed pass/fail parameter group is failed and held once, never counted as passed', () => {
  const rows = [
    { inspectionGroup:'g1', stage:'IN_PROCESS', batchReference:'LOT-A', lotQuantity:50, quantityInspected:50, result:'PASS', resolutionStatus:'PENDING' },
    { inspectionGroup:'g1', stage:'IN_PROCESS', batchReference:'LOT-A', lotQuantity:50, quantityInspected:50, result:'FAIL', resolutionStatus:'PENDING' }
  ];
  assert.equal(summarizeGroups(rows)[0].result, 'FAIL');
  assert.deepEqual(buildLegacyAccounting(rows), { inspectedQuantity:0, holdQuantity:50, lots:[{ batchReference:'LOT-A', normalizedReference:'lot-a', lotQuantity:50, passedQuantity:0, heldQuantity:50 }] });
});

test('concurrent rejected inspection attempts stay in history without affecting quality totals', () => {
  const rows=[
    {inspectionGroup:'voided',stage:'IN_PROCESS',batchReference:'LOT-X',quantityInspected:100,result:'PASS',accountingStatus:'VOIDED'},
    {inspectionGroup:'voided',stage:'IN_PROCESS',batchReference:'LOT-X',quantityInspected:100,result:'FAIL',accountingStatus:'ACCEPTED'}
  ];
  assert.equal(summarizeGroups(rows)[0].result,'VOIDED');
  assert.deepEqual(buildLegacyAccounting(rows),{inspectedQuantity:0,holdQuantity:0,lots:[]});
});

test('reworked failed quantity is released for another inspection and not double-counted', () => {
  const rows = [
    { inspectionGroup:'failed', stage:'IN_PROCESS', batchReference:'LOT-A', quantityInspected:40, result:'FAIL', resolutionStatus:'RESOLVED', resolutionOutcome:'REWORKED' },
    { inspectionGroup:'failed', stage:'IN_PROCESS', batchReference:'LOT-A', quantityInspected:40, result:'PASS', resolutionStatus:'RESOLVED', resolutionOutcome:'REWORKED' },
    { inspectionGroup:'retry', stage:'IN_PROCESS', batchReference:'LOT-A', lotQuantity:40, quantityInspected:40, result:'PASS', resolutionStatus:'NOT_REQUIRED' }
  ];
  assert.deepEqual(buildLegacyAccounting(rows), { inspectedQuantity:40, holdQuantity:0, lots:[{ batchReference:'LOT-A', normalizedReference:'lot-a', lotQuantity:40, passedQuantity:40, heldQuantity:0 }] });
});

test('failed final groups become eligible after corrective action and remain unreleased until a passing retry', () => {
  const failedGroup = summarizeGroups([
    { inspectionGroup:'final-1', stage:'FINAL', result:'PASS', resolutionStatus:'PENDING' },
    { inspectionGroup:'final-1', stage:'FINAL', result:'FAIL', resolutionStatus:'PENDING' }
  ])[0];
  assert.equal(failedGroup.result, 'FAIL');
  const held = { status:'COMPLETED', inspectionStatus:'FAIL', releaseStatus:'ON_HOLD', inProcessHoldQuantity:0 };
  assert.equal(finalInspectionEligible(held), false);
  const corrected = { ...held, inspectionStatus:'PENDING', releaseStatus:'PENDING_FINAL' };
  assert.equal(finalInspectionEligible(corrected), true);
  assert.equal(finalInspectionEligible({ ...corrected, inspectionStatus:'PASS', releaseStatus:'RELEASED' }), false);
});

test('lot totals cannot exceed uninspected schedule quantity, while previous passes are accounted for', () => {
  assert.equal(lotCanFit(300, 0, 301), false);
  assert.equal(lotCanFit(300, 200, 500), true);
  assert.equal(lotRemaining(500, 200), 300);
});

test('concurrent in-process reservations use a single-document compare-and-set', async () => {
  const state = { _id:'schedule', status:'IN_PROGRESS', actualQuantity:100, inProcessHoldQuantity:0, inProcessInspectedQuantity:0, inProcessAccountingVersion:7, inProcessInspectionLots:[] };
  const Model = { async findOneAndUpdate(filter, update) {
    if (filter.inProcessAccountingVersion !== state.inProcessAccountingVersion || filter.actualQuantity !== state.actualQuantity || filter.inProcessHoldQuantity !== state.inProcessHoldQuantity || filter.inProcessInspectedQuantity !== state.inProcessInspectedQuantity) return null;
    for (const [key, amount] of Object.entries(update.$inc)) state[key] += amount;
    Object.assign(state, update.$set);
    return { ...state, inProcessInspectionLots:state.inProcessInspectionLots.map(lot=>({...lot})) };
  } };
  const snapshot = { ...state, inProcessInspectionLots:[] };
  const outcomes = await Promise.all([
    reserveInProcessInspection(Model, snapshot, { quantity:60, failed:false, batchReference:'LOT-A', lotQuantity:100 }),
    reserveInProcessInspection(Model, snapshot, { quantity:60, failed:false, batchReference:'LOT-A', lotQuantity:100 })
  ]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.equal(state.inProcessInspectedQuantity, 60);
  assert.ok(state.inProcessInspectedQuantity <= state.actualQuantity);
});

test('a failed mixed group reserves held quantity by lot without incrementing passed quantity', async () => {
  const state={_id:'schedule',status:'IN_PROGRESS',actualQuantity:100,inProcessHoldQuantity:0,inProcessInspectedQuantity:0,inProcessAccountingVersion:2,inProcessInspectionLots:[]};
  const Model={async findOneAndUpdate(filter,update){if(filter.inProcessAccountingVersion!==state.inProcessAccountingVersion)return null;for(const [key,value]of Object.entries(update.$inc))state[key]+=value;Object.assign(state,update.$set);return {...state};}};
  await reserveInProcessInspection(Model,{...state,inProcessInspectionLots:[]},{quantity:25,failed:true,batchReference:'LOT-H',lotQuantity:50});
  assert.equal(state.inProcessHoldQuantity,25);
  assert.equal(state.inProcessInspectedQuantity,0);
  assert.equal(state.inProcessInspectionLots[0].heldQuantity,25);
  assert.equal(state.inProcessInspectionLots[0].passedQuantity,0);
});
