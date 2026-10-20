const r=require('express').Router();
const c=require('../controllers/productionController');
const {auth,admin}=require('../middleware/auth');
r.use(auth);
r.get('/',c.list);
r.post('/',admin,c.create);
r.put('/:id',admin,c.update);
r.delete('/:id',admin,c.remove);
module.exports=r;
