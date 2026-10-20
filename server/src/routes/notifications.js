const r=require('express').Router();
const c=require('../controllers/notificationController');
const {auth,admin}=require('../middleware/auth');
r.use(auth);
r.get('/',c.list);
r.post('/',admin,c.create);
r.patch('/:id/read',c.read);
module.exports=r;
