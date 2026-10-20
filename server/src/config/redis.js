const { createClient } = require('redis');

let client;
let connected = false;

async function connectRedis() {
  if (process.env.REDIS_ENABLED === 'false') return;
  client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  client.on('error', error => {
    if (connected) console.warn('Redis cache unavailable; continuing with MongoDB.');
    connected = false;
  });
  client.on('ready', () => { connected = true; });
  client.on('end', () => { connected = false; });
  try {
    await client.connect();
    connected = true;
    console.log('Redis cache connected');
  } catch {
    console.warn('Redis is unavailable; continuing without cache.');
    try { client.destroy(); } catch { /* Ignore cleanup failures during optional cache startup. */ }
    client = undefined;
  }
}

async function get(key) {
  if (!connected || !client) return null;
  try { return await client.get(key); } catch { return null; }
}

async function set(key, value, ttlSeconds = 15) {
  if (!connected || !client) return;
  try { await client.set(key, value, { EX: ttlSeconds }); } catch { /* cache errors do not fail API requests */ }
}

async function del(key) {
  if (!connected || !client) return;
  try { await client.del(key); } catch { /* cache errors do not fail API requests */ }
}

async function invalidateAnalytics() {
  await Promise.all(['analytics:dashboard', 'analytics:report:7', 'analytics:report:14', 'analytics:report:30'].map(del));
}

module.exports = { connectRedis, get, set, del, invalidateAnalytics };
