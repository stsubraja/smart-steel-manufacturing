const Notification=require('../models/Notification');
exports.list=async(req,res)=>res.json(await Notification.find().sort({createdAt:-1}).limit(50));
exports.create=async(req,res)=>res.status(201).json(await Notification.create(req.body));
exports.read=async(req,res)=>{const n=await Notification.findById(req.params.id);if(!n)return res.status(404).json({message:'Notification not found'});if(!n.readBy.some(x=>x.equals(req.user._id)))n.readBy.push(req.user._id);await n.save();res.json(n)};
