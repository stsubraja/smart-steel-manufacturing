const bcrypt = require('bcryptjs');
const User = require('../models/User');
const token = require('../utils/token');

exports.register = async (req,res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ message:'Name, email and password (6+ chars) are required' });
  const normalizedEmail=String(email).trim().toLowerCase();
  if (await User.findOne({ email: normalizedEmail })) return res.status(409).json({ message:'This email is already registered. Sign in or use another email.' });
  let user;
  try { user = await User.create({ name, email: normalizedEmail, password: await bcrypt.hash(password,10) }); }
  catch(error){if(error.code===11000)return res.status(409).json({message:'This email is already registered. Sign in or use another email.'});throw error;}
  res.status(201).json({ message:'Registration submitted. You can sign in after an administrator approves your account.' });
};
exports.login = async (req,res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || '').trim().toLowerCase() }).select('+password');
  if (!user || !(await bcrypt.compare(password || '', user.password))) return res.status(401).json({ message:'Invalid email or password' });
  if (user.status === 'PENDING') return res.status(403).json({ message:'Your account is waiting for administrator approval.' });
  if (user.status !== 'ACTIVE') return res.status(403).json({ message:'Account disabled' });
  res.json({ token: token(user._id), user: { id:user._id,name:user.name,email:user.email,role:user.role } });
};
exports.me = async (req,res) => res.json({ user:{ id:req.user._id,name:req.user.name,email:req.user.email,role:req.user.role,status:req.user.status } });
