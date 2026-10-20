const ProductionSchedule=require('../models/ProductionSchedule');
const Furnace=require('../models/Furnace');
const RawMaterial=require('../models/RawMaterial');
const QualityInspection=require('../models/QualityInspection');
const cache=require('../config/redis');
exports.dashboard=async(req,res)=>{
 const cached=await cache.get('analytics:dashboard');
 if(cached) return res.json(JSON.parse(cached));
 const [schedules,furnaces,materials,quality]=await Promise.all([ProductionSchedule.find(),Furnace.find(),RawMaterial.find(),QualityInspection.find()]);
 const dashboard={totalSchedules:schedules.length,plannedProduction:schedules.reduce((a,x)=>a+x.plannedQuantity,0),actualProduction:schedules.reduce((a,x)=>a+x.actualQuantity,0),completed:schedules.filter(x=>x.status==='COMPLETED').length,inProgress:schedules.filter(x=>x.status==='IN_PROGRESS').length,lowStock:materials.filter(x=>x.quantity<=x.minimumLevel).length,furnaceAlerts:furnaces.filter(x=>x.status==='WARNING'||x.status==='CRITICAL').length,qualityPass:quality.filter(x=>x.result==='PASS').length,qualityFail:quality.filter(x=>x.result==='FAIL').length};
 await cache.set('analytics:dashboard',JSON.stringify(dashboard),15);
 res.json(dashboard);
};
