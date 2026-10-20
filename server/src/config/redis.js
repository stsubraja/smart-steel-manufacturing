const { createClient } = require('redis');

let client;
let connected = false;

async function connectRedis() {
  if (process.env.REDIS_ENABLED === 'false') return;
  client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  client.on('error', error => {
    if (connected) console.warn('Redis cache unavailable:', error.message);
    connected = false;
  });
  try {
    await client.connect();
    connected = true;
    console.log('Redis cache connected');
  } catch (error) {
    console.warn(`Redis is unavailable; continuing without cache (${error.message})`);
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

module.exports = { connectRedis, get, set };
