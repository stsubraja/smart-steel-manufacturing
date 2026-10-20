const r=require('express').Router();
const c=require('../controllers/qualityController');
const {auth,admin}=require('../middleware/auth');
r.use(auth);
r.get('/',c.list);
r.post('/',admin,c.create);
module.exports=r;
