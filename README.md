# Smart Steel Manufacturing Management System

Full MERN college-project starter/implementation with React + TypeScript, Node.js + Express, MongoDB + Mongoose, JWT authentication, Socket.IO simulated furnace monitoring, dashboards, production scheduling, raw-material inventory, quality inspection, analytics, notifications, and admin user management.

## 1. Requirements
- Node.js 20+ (Node 24 is fine)
- MongoDB Atlas account/cluster
- Docker Desktop (for optional Redis cache)

## 2. Backend setup
```powershell
cd server
npm install
copy .env.example .env
```
Edit `.env` and add your Atlas URI and a strong JWT secret.

Before first-time seeding, set `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, and `SEED_ADMIN_PASSWORD` in `server/.env`. Use a unique administrator email and a strong password of at least 12 characters. `npm run seed` creates that administrator only when the email is absent and inserts the demo furnaces/materials only when their names are absent. It is safe to rerun: it never deletes or overwrites users, schedules, inspections, material quantities, or other existing operational records. It creates no default demo-user accounts.

Then:
```powershell
npm run seed
npm run dev
```
The administrator can approve new registrations from **User Management**. To create another initial administrator, provide a different email and run the safe seed again; an existing account is never silently promoted or reset.

### Atlas DNS note
The backend config attempts to use Google/Cloudflare DNS for MongoDB SRV resolution because some Windows/ISP DNS configurations return `querySrv ECONNREFUSED`. If your network blocks those DNS servers, use the Atlas-provided non-SRV connection string instead.

## 3. Frontend setup
Open a second terminal:
```powershell
cd client
npm install
copy .env.example .env
npm run dev
```
Open the Vite URL shown in the terminal, normally `http://localhost:5173`.

## 4. Optional Redis cache with Docker
Start Redis from the project root:
```powershell
docker compose up -d redis
```
The backend connects to `redis://localhost:6379`. `GET /api/analytics/report?days=N` caches each effective window (clamped to 7–30 days) for 15 seconds; the UI offers 7, 14, and 30 days. `GET /api/analytics/dashboard` reads MongoDB directly and is not cached. Production, quality, and material changes invalidate the report keys used by the UI; any other cached window expires within 15 seconds. MongoDB is the source of truth; if Redis is disabled, unavailable, or returns invalid cache data, the report is calculated from MongoDB. Set `REDIS_ENABLED=false` in `server/.env` to disable Redis. Compose binds Redis to `127.0.0.1` for local development rather than exposing its unauthenticated port on other machines. Stop the container with `docker compose down` (the named `redis-data` volume preserves its data).

## 5. Main API routes
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET/POST/PUT/DELETE /api/production`
- `GET/POST/PUT /api/furnaces`
- `POST /api/furnaces/simulate`
- `GET/POST/PUT /api/materials`
- `POST /api/materials/:id/use`
- `GET/POST /api/quality`
- `GET /api/analytics/dashboard`
- `GET/PUT /api/users` (admin)
- `GET/POST /api/notifications`

## 6. Important
Never commit `.env` or credentials to GitHub. This project simulates furnace sensor updates; it does not claim physical sensor integration.


## Furnace simulation (demo mode)

The furnace readings in this project are **software-simulated**, not physical sensor measurements. Once the server connects to MongoDB, the simulation updates every 5 seconds by default and broadcasts readings through Socket.IO. Temperature moves gradually by up to 8°C per tick; the last 100 readings are stored per furnace for the dashboard trend. Admins can also trigger a manual update. Configure `SIMULATOR_ENABLED=false` to disable automatic simulation or `SIMULATOR_INTERVAL_MS=5000` to change the interval. The simulation is for demonstration only and must not be used for real furnace control or safety decisions.

## Role permissions

Normal users can view manufacturing schedules, furnaces, inventory, quality history and analytics. Admins can create/update manufacturing records, manage stock, record quality inspections, trigger the simulator and manage users. Express middleware enforces write permissions on the server; hiding controls in React is only a usability layer.

## Setup note

Create `server/.env` from `server/.env.example` and fill in your own MongoDB Atlas URI and a strong JWT secret. Never commit `.env` or share it in submission archives. Install dependencies with `npm install` in both `server` and `client`; do not copy `node_modules` between machines.

## Theme
Use the Dark theme control at the bottom of the sidebar. The choice is saved in this browser and applies across the app.

## Simulation, alternatives, and limitations
The current furnace values are simulated in software, which is suitable for a college demonstration without physical equipment. The dashboard's Socket.IO stream is generated by the server simulator. Other no-IoT demo approaches include replaying a recorded CSV telemetry dataset, a deterministic scenario engine (normal, overheating, cooldown), or manually entering readings. For stronger demonstrations, a scenario engine or CSV replay can make runs reproducible. These methods still do not measure a real furnace; physical monitoring would require sensors, a gateway, and appropriate industrial integration.

This project has real limitations; no software can guarantee there are none. It is a prototype rather than a validated plant control system: simulated data can differ from plant behavior; MongoDB Atlas/network availability affects the app; Redis is an optional report cache and can briefly serve report figures up to 15 seconds old; security, audit, backup, and scale need deployment-specific review; and the current analytics are basic. It must not be used for furnace control, safety decisions, or production planning without industrial validation. These limitations are documented rather than hidden because removing a disclaimer would not remove the underlying risks.

Completed schedules require actual output above zero to mark completion and become available for final inspection. Quality checks are available during `IN_PROGRESS` and after `COMPLETED`; each reading is compared with its minimum and maximum specifications. Failed in-process lots retain their own batch reference and quantity, enter a hold/rework queue, and do not fail the overall production schedule. Admins record corrective action before resolving the hold. A completed schedule is released only after its full releasable quantity passes final inspection. Admins can stop/resume simulated furnaces and edit their temperature ranges; a stopped furnace is excluded from simulator updates. Notifications are generated for schedules, completions, quality outcomes, low stock, furnace state changes, and temperature alerts; each user can mark them read independently.

The Dashboard is an at-a-glance live operations view. Analytics is a separate historical report with 7/14/30-day planned-vs-actual trends, plan attainment, quality rates, and inventory exceptions.

The login/register screen follows the saved light/dark theme, with a steelmaking photo background. Real-time furnace and notification Socket.IO connections require an authenticated session.

Duplicate material names are checked case-insensitively, and duplicate product schedules for the same date are rejected with a user-facing message. Furnace names and account emails also have duplicate protection.

## Tests
Run the server's focused test suite with `cd server; npm test`. Run the client checks with `cd client; npm run build` and `npm run lint`.

## Environment and repository safety
Keep MongoDB URIs, JWT secrets, Redis credentials, and seed administrator credentials in ignored `.env` files. Commit only the `.env.example` templates, which contain placeholders rather than credentials. The seed uses environment-provided administrator credentials and does not print the password.

## Publishing
The local repository has no hosting remote configured. To publish it, create an empty repository with your Git host, add its URL as `origin`, and push the current branch. Never stage local `.env` files or key files; the ignore rules exclude them.
