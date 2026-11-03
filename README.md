# Smart Steel Manufacturing

A full-stack manufacturing management demo for production planning, furnace monitoring, inventory, and quality workflows.

**Stack:** React 19 + TypeScript + Vite · Node.js + Express 5 · MongoDB + Mongoose · Redis (optional report cache) · Socket.IO

## At a glance

- Track production schedules, planned and actual output, and completion status.
- Monitor furnace temperature and operating state on a live dashboard.
- Manage raw materials, stock levels, and material usage.
- Record quality inspections, put failed lots on hold, and track corrective action and release.
- Review dashboard metrics and historical analytics, including production trends and inventory exceptions.
- Receive live notifications for production, quality, stock, and furnace events.
- Control access with administrator-approved accounts and server-enforced permissions.

## Run locally

### Requirements

- Node.js 24 (recommended; Vite 8 requires Node.js 20.19+ or 22.12+)
- A MongoDB database, such as MongoDB Atlas
- Redis is optional; without it, the application falls back to MongoDB and in-process behavior

### 1. Configure and start the API

In a terminal from the project root:

```powershell
cd server
npm install
Copy-Item .env.example .env
```

Edit `server/.env` and set `MONGODB_URI`, a strong unique `JWT_SECRET`, and the initial administrator values:

```dotenv
SEED_ADMIN_NAME=Your Name
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=use-a-unique-password-of-12-or-more-characters
```

Create the initial administrator and demo furnace/material records, then start the API:

```powershell
npm run seed
npm run dev
```

The seed is safe to rerun: it adds the configured administrator only if that email is new and adds demo furnaces and materials only if their names are absent. It does not reset or overwrite existing users, schedules, inspections, stock quantities, or other operational records. Choose a new database if you want a fresh demo dataset.

### 2. Start the frontend

Open a second terminal from the project root:

```powershell
cd client
npm install
Copy-Item .env.example .env
npm run dev
```

Open the Vite URL shown in the terminal, normally [http://localhost:5173](http://localhost:5173).

The frontend defaults to the local API at `http://localhost:5000`. Override `VITE_API_URL` and `VITE_SOCKET_URL` in `client/.env` when using another API host.

## Optional Redis cache

The included Compose file starts Redis for local development:

```powershell
docker compose up -d redis
```

Redis is used to cache analytics reports; MongoDB remains the source of truth. If Redis is unavailable or disabled, reports are calculated from MongoDB. Set `REDIS_ENABLED=false` in `server/.env` to disable it. Redis binds to localhost and is not exposed to other machines by the Compose configuration.

Stop Redis with `docker compose down`. Its named `redis-data` volume retains the cache data.

## Accounts and permissions

There are no default demo login credentials. Create the first administrator with the seed variables above. New registrations remain pending until an administrator approves them in **User Management**.

| Role | Access |
| --- | --- |
| User | View production schedules, furnaces, inventory, quality history, analytics, and notifications. |
| Administrator | Manage production, inventory, quality, furnace controls, users, and notifications. |

Write permissions are enforced by the API, not only by the interface.

## Furnace simulation

Furnace readings are simulated in software; this project does not connect to physical sensors. After MongoDB connects, the simulator updates every five seconds by default and broadcasts readings over Socket.IO. Temperature changes gradually, and the dashboard retains the latest 100 readings per furnace. Administrators can also trigger a manual update, stop or resume a furnace, and configure its temperature range.

Set `SIMULATOR_ENABLED=false` to turn off automatic simulation. Set `SIMULATOR_INTERVAL_MS` to change its interval. Simulated readings are for demonstration only and must not be used for real furnace control or safety decisions.

## API overview

All application endpoints are under `/api`.

| Area | Routes |
| --- | --- |
| Authentication | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Production | `GET/POST/PUT/DELETE /production` |
| Furnaces | `GET/POST/PUT /furnaces`, `POST /furnaces/simulate` |
| Materials | `GET/POST/PUT /materials`, `POST /materials/:id/use` |
| Quality | `GET/POST /quality` |
| Analytics | `GET /analytics/dashboard`, `GET /analytics/report?days=N` (7–30 days; the UI offers 7, 14, and 30) |
| Users | `GET/PUT /users` (administrator) |
| Notifications | `GET/POST /notifications` |

The API health check is available at `/` on the backend host. Authenticated furnace and notification updates use Socket.IO.

## Configuration

Backend variables are documented in `server/.env.example`; frontend variables are in `client/.env.example`.

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string. |
| `JWT_SECRET` | Secret used to sign authentication tokens. Use a strong, private value. |
| `CLIENT_URL` | Frontend origin allowed by the API and Socket.IO. |
| `REDIS_ENABLED`, `REDIS_URL` | Enable and configure the optional Redis cache. |
| `SIMULATOR_ENABLED`, `SIMULATOR_INTERVAL_MS` | Control simulated furnace updates. |
| `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Credentials for creating the initial administrator. Use a password of at least 12 characters. |
| `VITE_API_URL`, `VITE_SOCKET_URL` | API and Socket.IO URLs compiled into the frontend. |

The database configuration uses public DNS resolvers for MongoDB SRV lookup to accommodate some Windows and ISP DNS setups. If your network blocks those resolvers, use the non-SRV connection string provided by your MongoDB host.

## Deploy to Render

The repository includes [`render.yaml`](render.yaml), which defines a Node API service and a static Vite site. The Blueprint uses the Singapore region, a free API instance, a generated JWT secret, and disables the optional Redis cache.

1. Push the repository, including `render.yaml`, to GitHub.
2. In Render, create a new **Blueprint** from that repository.
3. Enter `MONGODB_URI` as a secret when prompted. The API's CORS origin and the frontend's API and Socket.IO URLs are set to the service hostnames in the Blueprint.
4. Deploy both services. The Blueprint expects `https://smart-steel-web.onrender.com` for the frontend and `https://smart-steel-api.onrender.com` for the API. If Render assigns different hostnames, update `CLIENT_URL`, `VITE_API_URL`, and `VITE_SOCKET_URL` to match, then redeploy.

The database must allow connections from Render. Do not commit `.env` files or place credentials in `render.yaml`. Free web services may sleep while idle, so their first request after inactivity can take longer.

## Development checks

```powershell
cd server
npm test
```

```powershell
cd client
npm run build
npm run lint
```

## Scope and safety

This project is a prototype for learning and demonstration. Furnace telemetry is simulated, analytics are basic, and deployment-specific security, audit, backup, and scaling requirements have not been validated for industrial use. Do not use it for physical furnace control, safety decisions, or production planning without appropriate industrial validation.

Keep MongoDB URIs, JWT secrets, and administrator credentials in ignored `.env` files or your hosting provider's secret manager. Commit only the placeholder `.env.example` files.
