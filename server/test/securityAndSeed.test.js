const test = require('node:test');
const assert = require('node:assert/strict');
const { admin } = require('../src/middleware/auth');
const productionRoutes = require('../src/routes/production');
const qualityRoutes = require('../src/routes/quality');
const { getEditableUpdates } = require('../src/controllers/productionController');
const { seedInitialData } = require('../src/utils/seed');

test('write route admin guard rejects normal users and admits administrators', () => {
  let statusCode; let nextCalled=false;
  const response={status(code){statusCode=code;return this;},json(body){this.body=body;return this;}};
  admin({user:{role:'USER'}},response,()=>{nextCalled=true;});
  assert.equal(statusCode,403); assert.equal(nextCalled,false);
  admin({user:{role:'ADMIN'}},response,()=>{nextCalled=true;});
  assert.equal(nextCalled,true);
});

test('production and quality mutation routes are protected by the admin middleware', () => {
  const protectedRoutes=[
    [productionRoutes,'POST','/'],[productionRoutes,'PUT','/:id'],[productionRoutes,'DELETE','/:id'],
    [qualityRoutes,'POST','/:scheduleId/inspect'],[qualityRoutes,'PATCH','/groups/:groupId/resolve']
  ];
  for(const [router,method,path] of protectedRoutes){
    const route=router.stack.find(layer=>layer.route?.path===path&&layer.route.methods[method.toLowerCase()]);
    assert.ok(route,`${method} ${path} is registered`);
    assert.ok(route.route.stack.some(layer=>layer.handle===admin),`${method} ${path} uses admin middleware`);
  }
});

test('production update allowlist rejects release and inspection fields', () => {
  assert.deepEqual(getEditableUpdates({actualQuantity:90,status:'COMPLETED',notes:'done'}), {actualQuantity:90,status:'COMPLETED',notes:'done'});
  assert.throws(()=>getEditableUpdates({releaseStatus:'RELEASED'}), /releaseStatus/);
  assert.throws(()=>getEditableUpdates({inspectionStatus:'PASS'}), /inspectionStatus/);
});

test('safe seed is idempotent and preserves existing material and furnace operations', async () => {
  const records={User:new Map(),Furnace:new Map([['Furnace 1',{name:'Furnace 1',temperature:1234,isRunning:false}]]),RawMaterial:new Map([['Iron Ore',{name:'Iron Ore',quantity:321,supplier:'Current Supplier'}]])};
  let attemptedDeletes=0;
  function model(name){return {async updateOne(filter,update,options){assert.equal(options.upsert,true);const key=filter.email||filter.name;if(!records[name].has(key))records[name].set(key,{...update.$setOnInsert});},deleteMany(){attemptedDeletes++;throw new Error('seed must not delete operational data');}};}
  const dependencies={UserModel:model('User'),FurnaceModel:model('Furnace'),RawMaterialModel:model('RawMaterial'),hashPassword:async value=>`hash:${value}`,env:{SEED_ADMIN_NAME:'Steel Admin',SEED_ADMIN_EMAIL:'admin@example.invalid',SEED_ADMIN_PASSWORD:'test-only-password-value'}};
  await seedInitialData(dependencies);
  const firstSnapshot=JSON.stringify(Object.entries(records).map(([name,items])=>[name,[...items]]));
  await seedInitialData({...dependencies,env:{...dependencies.env,SEED_ADMIN_PASSWORD:'different-test-password-value'}});
  assert.equal(JSON.stringify(Object.entries(records).map(([name,items])=>[name,[...items]])),firstSnapshot);
  assert.equal(records.RawMaterial.get('Iron Ore').quantity,321);
  assert.equal(records.Furnace.get('Furnace 1').temperature,1234);
  assert.equal(records.Furnace.get('Furnace 1').isRunning,false);
  assert.equal(attemptedDeletes,0);
});

test('safe seed refuses missing administrator credentials', async () => {
  await assert.rejects(seedInitialData({UserModel:{},FurnaceModel:{},RawMaterialModel:{},hashPassword:async()=>'',env:{}}), /SEED_ADMIN_NAME/);
});
