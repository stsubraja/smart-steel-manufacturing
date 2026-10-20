const QualityInspection=require('../models/QualityInspection');
exports.list=async(req,res)=>res.json(await QualityInspection.find().populate('inspector','name').populate('schedule','productType productionDate').sort({inspectedAt:-1}));
exports.create=async(req,res)=>res.status(201).json(await QualityInspection.create({...req.body,inspector:req.user._id}));
