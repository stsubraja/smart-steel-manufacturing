const Furnace = require('../models/Furnace');
const createNotification = require('../utils/createNotification');
const cache = require('../config/redis');
function state(f) {
  if (f.isRunning === false) return 'OFFLINE';
  if (f.temperature <= 0) return 'OFFLINE';
  if (f.temperature > f.maxTemperature) return 'CRITICAL';
  if (f.temperature > f.maxTemperature - 50 || f.temperature < f.minTemperature) return 'WARNING';
  return 'NORMAL';
}
exports.list = async (req, res) => res.json(await Furnace.find().sort({ name: 1 }));
exports.create = async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const minTemperature = req.body.minTemperature === undefined ? 1400 : Number(req.body.minTemperature);
  const maxTemperature = req.body.maxTemperature === undefined ? 1650 : Number(req.body.maxTemperature);
  const temperature = req.body.temperature === undefined ? minTemperature : Number(req.body.temperature);
  if (!name) return res.status(400).json({ message: 'Furnace name is required' });
  if (!Number.isFinite(minTemperature) || minTemperature < 1 || !Number.isFinite(maxTemperature) || maxTemperature <= minTemperature) {
    return res.status(400).json({ message: 'Temperature limits are invalid. Maximum must exceed minimum.' });
  }
  if (!Number.isFinite(temperature) || temperature < 1 || temperature > maxTemperature + 80) {
    return res.status(400).json({ message: 'Starting temperature is outside the allowed range.' });
  }
  if (await Furnace.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })) return res.status(409).json({ message: 'A furnace with this name already exists.' });
  try {
    const f = await Furnace.create({
      name,
      minTemperature,
      maxTemperature,
      temperature,
      status: state({ temperature, minTemperature, maxTemperature }),
      lastUpdated: new Date(),
      temperatureHistory: [{ temperature, recordedAt: new Date() }]
    });
    const io = req.app.get('io');
    if (io) io.emit('furnace:update', await Furnace.find().sort({ name: 1 }));
    res.status(201).json(f);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'A furnace with this name already exists.' });
    throw error;
  }
};
exports.update = async (req, res) => {
  const old = await Furnace.findById(req.params.id);
  if (!old) return res.status(404).json({ message: 'Furnace not found' });
  const set = {};
  const minTemperature = req.body.minTemperature === undefined ? old.minTemperature : Number(req.body.minTemperature);
  const maxTemperature = req.body.maxTemperature === undefined ? old.maxTemperature : Number(req.body.maxTemperature);
  if (!Number.isFinite(minTemperature) || !Number.isFinite(maxTemperature) || minTemperature < 1 || maxTemperature <= minTemperature) return res.status(400).json({ message: 'Temperature range is invalid. Maximum must be greater than minimum.' });
  if (req.body.minTemperature !== undefined) set.minTemperature = minTemperature;
  if (req.body.maxTemperature !== undefined) set.maxTemperature = maxTemperature;
  if (typeof req.body.isRunning === 'boolean') set.isRunning = req.body.isRunning;
  if (req.body.temperature !== undefined) {
    const temperature = Number(req.body.temperature);
    if (!Number.isFinite(temperature) || temperature < 0) return res.status(400).json({ message: 'Temperature must be a non-negative number.' });
    set.temperature = temperature;
  }
  set.lastUpdated = new Date();
  const update = { $set: set };
  if (set.temperature !== undefined) {
    update.$push = { temperatureHistory: { temperature: Number(set.temperature), recordedAt: new Date() } };
  }
  set.status = state({ ...old.toObject(), ...set });
  const f = await Furnace.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (old.isRunning !== f.isRunning) await createNotification(req.app, { message: `${f.name} ${f.isRunning ? 'resumed' : 'stopped'} by an administrator.`, type: 'INFO' });
  await cache.invalidateAnalytics();
  const io = req.app.get('io');
  if (io) io.emit('furnace:update', await Furnace.find().sort({ name: 1 }));
  res.json(f);
};
// Simulation moves gradually from the previous reading; it is not a physical sensor.
async function advanceFurnaces(app) {
  const furnaces = await Furnace.find();
  const updated = await Promise.all(furnaces.map(async (f) => {
    if (f.isRunning === false) return f;
    const previousStatus = f.status;
    const baseline = f.temperature > 0 ? f.temperature : Math.round((f.minTemperature + f.maxTemperature) / 2 - 25);
    const change = Math.round((Math.random() * 2 - 1) * 8); // -8°C to +8°C per tick
    const low = Math.max(0, f.minTemperature - 100);
    const high = f.maxTemperature + 80;
    f.temperature = Math.min(high, Math.max(low, baseline + change));
    f.status = state(f);
    f.lastUpdated = new Date();
    f.temperatureHistory.push({ temperature: f.temperature, recordedAt: f.lastUpdated });
    if (f.temperatureHistory.length > 100) f.temperatureHistory.splice(0, f.temperatureHistory.length - 100);
    await f.save();
    if (f.status !== previousStatus && ['WARNING', 'CRITICAL'].includes(f.status)) {
      await createNotification(app, { message: `${f.name} temperature status changed to ${f.status} (${f.temperature}°C).`, type: f.status === 'CRITICAL' ? 'ALERT' : 'WARNING' });
    }
    return f;
  }));
  if (app.get('io')) app.get('io').emit('furnace:update', updated);
  await cache.invalidateAnalytics();
  return updated;
}
exports.simulate = async (req, res) => res.json(await advanceFurnaces(req.app));
exports.advanceFurnaces = advanceFurnaces;
