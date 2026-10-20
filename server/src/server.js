require('dotenv').config();
const http=require('http');const express=require('express');const cors=require('cors');const {Server}=require('socket.io');const connectDB=require('./config/database');
const { connectRedis } = require('./config/redis');
const jwt=require('jsonwebtoken');const User=require('./models/User');
const app=express();const server=http.createServer(app);const io=new Server(server,{cors:{origin:process.env.CLIENT_URL||'http://localhost:5173',methods:['GET','POST','PUT','PATCH','DELETE']}});app.set('io',io);
app.use(cors({origin:process.env.CLIENT_URL||'http://localhost:5173'}));app.use(express.json());
app.get('/',(req,res)=>res.json({message:'Smart Steel Manufacturing API is running'}));
app.use('/api/auth',require('./routes/auth'));app.use('/api/production',require('./routes/production'));app.use('/api/furnaces',require('./routes/furnaces'));app.use('/api/materials',require('./routes/materials'));app.use('/api/quality',require('./routes/quality'));app.use('/api/analytics',require('./routes/analytics'));app.use('/api/users',require('./routes/users'));app.use('/api/notifications',require('./routes/notifications'));
app.use((err,req,res,next)=>{console.error(err);res.status(err.status||500).json({message:err.message||'Server error'});});
io.use(async(socket,next)=>{
  try {
    const payload=jwt.verify(socket.handshake.auth?.token||'',process.env.JWT_SECRET);
    const user=await User.findById(payload.id);
    if(!user||user.status==='DISABLED')return next(new Error('Authentication required'));
    socket.data.userId=String(user._id); next();
  } catch { next(new Error('Authentication required')); }
});
io.on('connection',socket=>{socket.emit('connected',{message:'Real-time monitoring connected'});});
const PORT=process.env.PORT||5000;
connectDB().then(()=>server.listen(PORT,()=>{
  console.log(`Server running on port ${PORT}`);
  connectRedis(); // Redis is an optional cache; MongoDB remains the source of truth.
  // Demo-only simulated telemetry. Set SIMULATOR_ENABLED=false to disable it.
  if (process.env.SIMULATOR_ENABLED !== 'false') {
    const { advanceFurnaces } = require('./controllers/furnaceController');
    setInterval(() => advanceFurnaces(app).catch(err => console.error('Furnace simulation error:', err.message)), Number(process.env.SIMULATOR_INTERVAL_MS) || 5000);
  }
})).catch(()=>process.exit(1));
