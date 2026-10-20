const r=require('express').Router();
const c=require('../controllers/qualityController');
const {auth,admin}=require('../middleware/auth');
r.use(auth);
r.get('/',c.list);
r.get('/pending',c.pending);
r.post('/:scheduleId/inspect',admin,c.inspect);
module.exports=r;
