const bcrypt = require('bcryptjs');
const connectDB = require('../config/database');
const User = require('../models/User');
const Furnace = require('../models/Furnace');
const RawMaterial = require('../models/RawMaterial');

async function seedInitialData({ UserModel, FurnaceModel, RawMaterialModel, hashPassword, env }) {
  const name = String(env.SEED_ADMIN_NAME || '').trim();
  const email = String(env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(env.SEED_ADMIN_PASSWORD || '');
  if (!name || !email || password.length < 12) {
    throw new Error('Set SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, and a SEED_ADMIN_PASSWORD of at least 12 characters before seeding.');
  }

  const hashedPassword = await hashPassword(password, 10);
  await UserModel.updateOne(
    { email },
    { $setOnInsert: { name, email, password: hashedPassword, role: 'ADMIN', status: 'ACTIVE' } },
    { upsert: true }
  );

  const furnaces = [
    { name: 'Furnace 1', temperature: 1500, minTemperature: 1400, maxTemperature: 1650 },
    { name: 'Furnace 2', temperature: 1540, minTemperature: 1400, maxTemperature: 1650 }
  ];
  for (const furnace of furnaces) await FurnaceModel.updateOne({ name: furnace.name }, { $setOnInsert: furnace }, { upsert: true });

  const materials = [
    { name: 'Iron Ore', quantity: 5000, unit: 'kg', minimumLevel: 1000, supplier: 'Primary Supplier' },
    { name: 'Scrap Steel', quantity: 2500, unit: 'kg', minimumLevel: 500, supplier: 'Recycling Supplier' },
    { name: 'Limestone', quantity: 700, unit: 'kg', minimumLevel: 800, supplier: 'Mineral Supplier' }
  ];
  for (const material of materials) await RawMaterialModel.updateOne({ name: material.name }, { $setOnInsert: material }, { upsert: true });
}

async function main() {
  require('dotenv').config();
  await connectDB();
  await seedInitialData({ UserModel: User, FurnaceModel: Furnace, RawMaterialModel: RawMaterial, hashPassword: bcrypt.hash, env: process.env });
  console.log('Idempotent seed complete. Existing users and operational records were preserved.');
  process.exit(0);
}

if (require.main === module) main().catch(error => {
  console.error('Safe seed failed:', error.message);
  process.exit(1);
});

module.exports = { seedInitialData };
