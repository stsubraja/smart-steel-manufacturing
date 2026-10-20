const r=require('express').Router();
const c=require('../controllers/qualityController');
const {auth,admin}=require('../middleware/auth');
r.use(auth);
r.get('/',c.list);
r.get('/queue',c.queue);
r.post('/:scheduleId/inspect',admin,c.inspect);
r.patch('/groups/:groupId/resolve',admin,c.resolve);
module.exports=r;
