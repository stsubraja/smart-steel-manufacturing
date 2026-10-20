const r=require('express').Router();const c=require('../controllers/analyticsController');const {auth}=require('../middleware/auth');r.use(auth);r.get('/dashboard',c.dashboard);module.exports=r;
