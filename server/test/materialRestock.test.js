const test = require('node:test');
const assert = require('node:assert/strict');
const RawMaterial = require('../src/models/RawMaterial');
const cache = require('../src/config/redis');
const { create, restock } = require('../src/controllers/materialController');

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('restock atomically adds a positive quantity to existing stock', async () => {
  const originalUpdate = RawMaterial.findByIdAndUpdate;
  const originalInvalidate = cache.invalidateAnalytics;
  let updateArgs;
  const updatedMaterial = { _id: 'material-id', quantity: 42, unit: 'kg' };
  RawMaterial.findByIdAndUpdate = async (...args) => { updateArgs = args; return updatedMaterial; };
  cache.invalidateAnalytics = async () => {};
  try {
    const res = response();
    await restock({ params: { id: 'material-id' }, body: { quantityAdded: 12 } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, updatedMaterial);
    assert.equal(updateArgs[0], 'material-id');
    assert.deepEqual(updateArgs[1], { $inc: { quantity: 12 } });
    assert.deepEqual(updateArgs[2], { new: true, runValidators: true });
  } finally {
    RawMaterial.findByIdAndUpdate = originalUpdate;
    cache.invalidateAnalytics = originalInvalidate;
  }
});

test('restock rejects zero and invalid quantities without changing inventory', async () => {
  const originalUpdate = RawMaterial.findByIdAndUpdate;
  let databaseCalled = false;
  RawMaterial.findByIdAndUpdate = async () => { databaseCalled = true; };
  try {
    for (const quantityAdded of [0, -3, 'invalid']) {
      const res = response();
      await restock({ params: { id: 'material-id' }, body: { quantityAdded } }, res);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /greater than zero/);
    }
    assert.equal(databaseCalled, false);
  } finally {
    RawMaterial.findByIdAndUpdate = originalUpdate;
  }
});

test('duplicate material entry explains how to add quantity to the existing record', async () => {
  const originalFindOne = RawMaterial.findOne;
  RawMaterial.findOne = async () => ({ _id: 'existing-material' });
  try {
    const res = response();
    await create({ body: { name: 'Iron Ore' } }, res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /Use Restock to add quantity/);
  } finally {
    RawMaterial.findOne = originalFindOne;
  }
});
