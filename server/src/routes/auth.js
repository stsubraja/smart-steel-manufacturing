const r=require('express').Router();const c=require('../controllers/authController');const {auth}=require('../middleware/auth');
r.post('/register',c.register);r.post('/login',c.login);r.get('/me',auth,c.me);module.exports=r;
