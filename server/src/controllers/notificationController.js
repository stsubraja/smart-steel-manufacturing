const Notification=require('../models/Notification');
const User=require('../models/User');
const mongoose=require('mongoose');
const { visibleNotificationQuery, announcementRecipientQuery } = require('../utils/notificationAudience');
const visibleTo=user=>visibleNotificationQuery(user);
const announcementRecipients=async notification=>{
  if(['USERS_ONLY','ALL_USERS'].includes(notification.audience))return (await User.find({status:'ACTIVE',role:'USER'}).select('_id')).map(user=>user._id);
  return notification.recipients;
};
exports.list=async(req,res)=>res.json(await Notification.find(visibleTo(req.user)).sort({createdAt:-1}).limit(100));
const editableAnnouncementFilter = id => ({_id:id,audience:{$in:['USERS_ONLY','ALL_USERS','USERS']}});
exports.listAnnouncements=async(req,res)=>res.json(await Notification.find({audience:{$in:['USERS_ONLY','ALL_USERS','USERS']}}).sort({createdAt:-1}).limit(100));
exports.create=async(req,res)=>{
  const message=String(req.body.message||'').trim(),type=req.body.type||'INFO',audience=req.body.audience||'ALL_USERS';
  if(!message)return res.status(400).json({message:'Enter a notification message.'});
  if(!['INFO','WARNING','SUCCESS','ALERT'].includes(type))return res.status(400).json({message:'Choose a valid notification type.'});
  if(!['ALL_USERS','USERS'].includes(audience))return res.status(400).json({message:'Choose a valid audience.'});
  let recipients=[], storedAudience=audience;
  if(audience==='USERS'){
    recipients=[...new Set((Array.isArray(req.body.recipients)?req.body.recipients:[]).map(String))];
    if(!recipients.length||recipients.some(id=>!mongoose.isValidObjectId(id)))return res.status(400).json({message:'Choose at least one valid user.'});
    const active=await User.countDocuments({_id:{$in:recipients},status:'ACTIVE',role:'USER'});
    if(active!==recipients.length)return res.status(400).json({message:'Notifications can only be assigned to active users.'});
  } else {
    storedAudience='USERS_ONLY';
    recipients=(await User.find(announcementRecipientQuery(req.user._id)).select('_id')).map(user=>user._id);
  }
  const notification=await Notification.create({message,type,audience:storedAudience,recipients,createdBy:req.user._id});
  const io=req.app.get('io');
  recipients.forEach(id=>io?.to(`user:${id}`).emit('notification:new',notification));
  res.status(201).json(notification);
};
exports.updateAnnouncement=async(req,res)=>{
  const message=String(req.body.message||'').trim(),type=req.body.type;
  if(!message)return res.status(400).json({message:'Enter a notification message.'});
  if(message.length>500)return res.status(400).json({message:'Notification messages must be 500 characters or fewer.'});
  if(!['INFO','WARNING','SUCCESS','ALERT'].includes(type))return res.status(400).json({message:'Choose a valid notification type.'});
  const notification=await Notification.findOneAndUpdate(editableAnnouncementFilter(req.params.id),{$set:{message,type}},{new:true,runValidators:true});
  if(!notification)return res.status(404).json({message:'Announcement not found.'});
  const io=req.app.get('io');
  (await announcementRecipients(notification)).forEach(id=>io?.to(`user:${id}`).emit('notification:updated',notification));
  res.json(notification);
};
exports.deleteAnnouncement=async(req,res)=>{
  const notification=await Notification.findOneAndDelete(editableAnnouncementFilter(req.params.id));
  if(!notification)return res.status(404).json({message:'Announcement not found.'});
  const io=req.app.get('io');
  (await announcementRecipients(notification)).forEach(id=>io?.to(`user:${id}`).emit('notification:deleted',{_id:String(notification._id)}));
  res.json({message:'Announcement deleted.'});
};
exports.read=async(req,res)=>{const n=await Notification.findOne({_id:req.params.id,...visibleTo(req.user)});if(!n)return res.status(404).json({message:'Notification not found'});if(!n.readBy.some(x=>x.equals(req.user._id)))n.readBy.push(req.user._id);await n.save();res.json(n)};
exports.readAll=async(req,res)=>{await Notification.updateMany({...visibleTo(req.user),readBy:{$ne:req.user._id}},{$addToSet:{readBy:req.user._id}});res.json({message:'All notifications marked as read.'})};
