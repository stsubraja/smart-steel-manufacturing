const Notification=require('../models/Notification');
const User=require('../models/User');
const mongoose=require('mongoose');
const visibleTo=userId=>({$or:[{audience:'ALL_USERS'},{audience:'USERS',recipients:userId},{audience:'ACTIVE_USERS',recipients:userId}]});
exports.list=async(req,res)=>res.json(await Notification.find(visibleTo(req.user._id)).sort({createdAt:-1}).limit(100));
exports.create=async(req,res)=>{
  const message=String(req.body.message||'').trim(),type=req.body.type||'INFO',audience=req.body.audience||'ALL_USERS';
  if(!message)return res.status(400).json({message:'Enter a notification message.'});
  if(!['INFO','WARNING','SUCCESS','ALERT'].includes(type))return res.status(400).json({message:'Choose a valid notification type.'});
  if(!['ALL_USERS','USERS'].includes(audience))return res.status(400).json({message:'Choose a valid audience.'});
  let recipients=[];
  if(audience==='USERS'){
    recipients=[...new Set((Array.isArray(req.body.recipients)?req.body.recipients:[]).map(String))];
    if(!recipients.length||recipients.some(id=>!mongoose.isValidObjectId(id)))return res.status(400).json({message:'Choose at least one valid user.'});
    const active=await User.countDocuments({_id:{$in:recipients},status:'ACTIVE'});
    if(active!==recipients.length)return res.status(400).json({message:'Notifications can only be assigned to active users.'});
  }
  const notification=await Notification.create({message,type,audience,recipients});
  const io=req.app.get('io');
  if(audience==='ALL_USERS')io?.emit('notification:new',notification);
  else recipients.forEach(id=>io?.to(`user:${id}`).emit('notification:new',notification));
  res.status(201).json(notification);
};
exports.read=async(req,res)=>{const n=await Notification.findOne({_id:req.params.id,...visibleTo(req.user._id)});if(!n)return res.status(404).json({message:'Notification not found'});if(!n.readBy.some(x=>x.equals(req.user._id)))n.readBy.push(req.user._id);await n.save();res.json(n)};
exports.readAll=async(req,res)=>{await Notification.updateMany({...visibleTo(req.user._id),readBy:{$ne:req.user._id}},{$addToSet:{readBy:req.user._id}});res.json({message:'All notifications marked as read.'})};
