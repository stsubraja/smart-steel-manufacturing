const User=require('../models/User');
exports.list=async(req,res)=>res.json(await User.find().select('-password').sort({createdAt:-1}));
exports.update=async(req,res)=>{const x=await User.findByIdAndUpdate(req.params.id,{role:req.body.role,status:req.body.status},{new:true,runValidators:true}).select('-password');if(!x)return res.status(404).json({message:'User not found'});res.json(x)};
