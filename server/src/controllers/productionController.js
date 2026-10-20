const ProductionSchedule = require('../models/ProductionSchedule');
exports.list = async (req,res) => res.json(await ProductionSchedule.find().populate('createdBy','name email').sort({productionDate:1}));
exports.create = async (req,res) => res.status(201).json(await ProductionSchedule.create({...req.body, createdBy:req.user._id}));
exports.update = async (req,res) => { const x=await ProductionSchedule.findByIdAndUpdate(req.params.id,req.body,{new:true,runValidators:true}); if(!x)return res.status(404).json({message:'Schedule not found'}); res.json(x); };
exports.remove = async (req,res) => { await ProductionSchedule.findByIdAndDelete(req.params.id); res.json({message:'Schedule deleted'}); };
