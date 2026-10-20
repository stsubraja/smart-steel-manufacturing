const RawMaterial=require('../models/RawMaterial');
const MaterialUsage=require('../models/MaterialUsage');
const createNotification=require('../utils/createNotification');
const cache=require('../config/redis');
exports.list=async(req,res)=>res.json(await RawMaterial.find().sort({name:1}));
exports.create=async(req,res)=>{
 const name=typeof req.body.name==='string'?req.body.name.trim():'';
 if(!name)return res.status(400).json({message:'Material name is required.'});
 if(await RawMaterial.findOne({name:new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'i')}))return res.status(409).json({message:'This raw material already exists.'});
 try { const material=await RawMaterial.create({...req.body,name}); await cache.invalidateAnalytics(); res.status(201).json(material); }
 catch(error){if(error.code===11000)return res.status(409).json({message:'This raw material already exists.'});throw error;}
};
exports.update=async(req,res)=>{const x=await RawMaterial.findByIdAndUpdate(req.params.id,req.body,{new:true,runValidators:true});if(!x)return res.status(404).json({message:'Material not found'});await cache.invalidateAnalytics();res.json(x)};
exports.remove=async(req,res)=>{const x=await RawMaterial.findByIdAndDelete(req.params.id);if(!x)return res.status(404).json({message:'Material not found'});await cache.invalidateAnalytics();res.json({message:'Material deleted.'})};
exports.use=async(req,res)=>{const {quantityUsed,schedule,notes}=req.body;const m=await RawMaterial.findById(req.params.id);if(!m)return res.status(404).json({message:'Material not found'});if(!Number.isFinite(Number(quantityUsed))||Number(quantityUsed)<=0||m.quantity<Number(quantityUsed))return res.status(400).json({message:'Enter a valid quantity; available stock is '+m.quantity+' '+m.unit+'.'});m.quantity-=Number(quantityUsed);await m.save();await cache.invalidateAnalytics();const usage=await MaterialUsage.create({material:m._id,schedule,quantityUsed:Number(quantityUsed),notes});if(m.quantity<=m.minimumLevel)await createNotification(req.app,{message:`Low stock: ${m.name} has ${m.quantity} ${m.unit} remaining.`,type:'WARNING'});res.status(201).json({material:m,usage});};
exports.usage=async(req,res)=>res.json(await MaterialUsage.find().populate('material','name unit').populate('schedule','productType productionDate').sort({usedAt:-1}));
