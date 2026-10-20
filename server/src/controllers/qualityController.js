const QualityInspection=require('../models/QualityInspection');
const ProductionSchedule=require('../models/ProductionSchedule');
const createNotification=require('../utils/createNotification');
const cache=require('../config/redis');
exports.list=async(req,res)=>res.json(await QualityInspection.find().populate('inspector','name').populate('schedule','productType productionDate').sort({inspectedAt:-1}));
exports.pending=async(req,res)=>{
 const inspected=await QualityInspection.distinct('schedule',{result:{$in:['PASS','FAIL']}});
 const products=await ProductionSchedule.find({status:'COMPLETED',_id:{$nin:inspected},$or:[{inspectionStatus:'PENDING'},{inspectionStatus:null}]}).sort({productionDate:1});
 res.json(products);
};
exports.inspect=async(req,res)=>{
 const schedule=await ProductionSchedule.findById(req.params.scheduleId);
 if(!schedule)return res.status(404).json({message:'Completed production not found.'});
 if(schedule.status!=='COMPLETED')return res.status(400).json({message:'Only completed production can be inspected.'});
 if(schedule.inspectionStatus!=='PENDING')return res.status(409).json({message:'This product has already been inspected.'});
 const parameters=req.body.parameters;
 if(!Array.isArray(parameters)||parameters.length===0)return res.status(400).json({message:'Add at least one inspection parameter.'});
 const rows=[];
 const names=new Set();
 for(const p of parameters){
   const parameter=typeof p.parameter==='string'?p.parameter.trim():'';
   if(names.has(parameter.toLowerCase()))return res.status(409).json({message:`The parameter "${parameter}" is listed more than once.`});
   names.add(parameter.toLowerCase());
   if(p.measuredValue===''||p.minimum===''||p.maximum==='')return res.status(400).json({message:'Measured value and both specification limits are required for every parameter.'});
   const value=Number(p.measuredValue),min=Number(p.minimum),max=Number(p.maximum);
   if(!parameter||!Number.isFinite(value)||!Number.isFinite(min)||!Number.isFinite(max)||min>max)return res.status(400).json({message:'Each parameter needs a name, numeric measured value, and valid minimum and maximum limits.'});
   const result=value>=min&&value<=max?'PASS':'FAIL';
   rows.push({schedule:schedule._id,inspector:req.user._id,parameter,measuredValue:String(value),specification:`${min}–${max}`,result,remarks:typeof p.remarks==='string'?p.remarks.trim():''});
 }
 const result=rows.some(row=>row.result==='FAIL')?'FAIL':'PASS';
 const inspections=await QualityInspection.insertMany(rows);
 schedule.inspectionStatus=result;
 await schedule.save();
 await cache.del('analytics:dashboard');
 await createNotification(req.app,{message:`Quality inspection ${result.toLowerCase()} for ${schedule.productType} (${inspections.length} parameters).`,type:result==='PASS'?'SUCCESS':'ALERT'});
 res.status(201).json({schedule,inspections,result});
};
