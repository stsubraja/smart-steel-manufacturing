const r=require('express').Router();
const c=require('../controllers/furnaceController');
const {auth,admin}=require('../middleware/auth');
r.use(auth);
r.get('/',c.list);
r.post('/',admin,c.create);
r.put('/:id',admin,c.update);
r.post('/simulate',admin,c.simulate);
module.exports=r;
