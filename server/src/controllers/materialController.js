const RawMaterial=require('../models/RawMaterial');
const MaterialUsage=require('../models/MaterialUsage');
exports.list=async(req,res)=>res.json(await RawMaterial.find().sort({name:1}));
exports.create=async(req,res)=>res.status(201).json(await RawMaterial.create(req.body));
exports.update=async(req,res)=>{const x=await RawMaterial.findByIdAndUpdate(req.params.id,req.body,{new:true,runValidators:true});if(!x)return res.status(404).json({message:'Material not found'});res.json(x)};
exports.use=async(req,res)=>{const {quantityUsed,schedule,notes}=req.body;const m=await RawMaterial.findById(req.params.id);if(!m)return res.status(404).json({message:'Material not found'});if(quantityUsed<=0||m.quantity<quantityUsed)return res.status(400).json({message:'Invalid quantity or insufficient stock'});m.quantity-=quantityUsed;await m.save();const usage=await MaterialUsage.create({material:m._id,schedule,quantityUsed,notes});res.status(201).json({material:m,usage});};
exports.usage=async(req,res)=>res.json(await MaterialUsage.find().populate('material','name unit').populate('schedule','productType productionDate').sort({usedAt:-1}));
