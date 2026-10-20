const User=require('../models/User');
exports.list=async(req,res)=>res.json(await User.find().select('-password').sort({createdAt:-1}));
exports.update=async(req,res)=>{
  const changes={};
  if(req.body.role!==undefined){if(!['ADMIN','USER'].includes(req.body.role))return res.status(400).json({message:'Choose a valid role.'});changes.role=req.body.role;}
  if(req.body.status!==undefined){if(!['PENDING','ACTIVE','DISABLED'].includes(req.body.status))return res.status(400).json({message:'Choose a valid account status.'});changes.status=req.body.status;}
  if(!Object.keys(changes).length)return res.status(400).json({message:'No user changes were provided.'});
  const x=await User.findByIdAndUpdate(req.params.id,changes,{new:true,runValidators:true}).select('-password');
  if(!x)return res.status(404).json({message:'User not found'});
  res.json(x);
};
