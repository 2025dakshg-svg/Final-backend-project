# SupportDesk

A helpdesk ticketing system backend for incident management and SLA tracking. Users raise tickets, agents assign and resolve them, admins oversee operations and view analytics reports. Real-time ticket updates run over Socket.io and agents receive FCM push notifications when tickets are assigned.

Built with Node.js, Express, MongoDB (Mongoose), JWT auth with optional Firebase sign-in, Socket.io, and firebase-admin.

## Tech Stack

- Node.js + Express (REST API)
- MongoDB + Mongoose
- JSON Web Tokens, plus optional Firebase Auth (firebase-admin)
- Socket.io for live ticket events
- Firebase Cloud Messaging for push notifications

## Setup

Prerequisites: Node 18+, MongoDB running locally (or a MONGO_URI for MongoDB Atlas).

```bash
cd backend
npm install
cp .env.example .env
npm run seed
npm start
```

`npm run seed` creates default SLA rules (High 4h, Medium 24h, Low 72h) and initial test accounts.

Default seed account placeholders:

| Role  | Email Placeholder   | Password Placeholder |
|-------|---------------------|----------------------|
| user  | `<user_email>`      | `<user_password>`    |
| agent | `<agent_email>`     | `<agent_password>`   |
| admin | `<admin_email>`     | `<admin_password>`   |

> Note: Initial accounts can be configured in `backend/src/seed.js` or registered through `/api/auth/register`. SLA policies are automatically seeded on first server boot even if `npm run seed` is not run manually.

## Environment Variables

Configure these inside `backend/.env`:

| Variable                    | Purpose                                                  |
|-----------------------------|----------------------------------------------------------|
| PORT                        | Server port, default 8000                                |
| MONGO_URI                   | MongoDB connection URI                                   |
| JWT_SECRET                  | Secret key used to sign JWTs                             |
| JWT_EXPIRES_IN              | Token validity duration (e.g. 7d)                        |
| FIREBASE_SERVICE_ACCOUNT    | Path to Firebase service account JSON file               |
| FIREBASE_PROJECT_ID         | Alternative to file: Firebase Project ID                 |
| FIREBASE_CLIENT_EMAIL       | Alternative to file: Firebase Client Email               |
| FIREBASE_PRIVATE_KEY        | Alternative to file: Firebase Private Key                |

Firebase integration is optional. If unconfigured, the system runs with local JWT authentication and logs that push notifications are disabled.

## Frontend

The browser client is located in `frontend/` and served at `http://localhost:8000/`. It is a lightweight single-page application covering authentication, ticket queues with multi-parameter filtering, ticket detail with activity stream comments, SLA timers, and an admin reporting view.

## API Endpoints

Base URL: `http://localhost:8000`

### Authentication
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/firebase` (login with Firebase ID token)

### Users
- `GET /api/users?role=agent` (Agent or Admin)

### Tickets
- `GET /api/tickets` (filters: `status`, `priority`)
- `GET /api/tickets/:id`
- `POST /api/tickets`
- `PUT /api/tickets/:id`
- `DELETE /api/tickets/:id`
- `PUT /api/tickets/:id/status`
- `PUT /api/tickets/:id/assign`
- `POST /api/tickets/:id/attachments`
- `GET /api/tickets/:id/attachments`

### Comments
- `POST /api/comments`
- `GET /api/comments`
- `GET /api/comments/ticket/:id`

### SLA Policies
- `GET /api/sla`
- `PUT /api/sla/:id` (Admin)

### Admin & Analytics
- `GET /api/admin/tickets` (Admin)
- `GET /api/admin/reports` (Admin)
- `GET /api/admin/db-stats` (Admin)

### Automations
- `GET /api/automations`
- `POST /api/automations` (Admin)
- `POST /api/automations/run` (Admin)

### Notifications
- `POST /api/notifications/send`

Interactive Swagger documentation is available at `http://localhost:8000/api-docs`. A Postman collection is located at `backend/postman_collection.json`.

All protected requests require an `Authorization: Bearer <token>` header.

## Business Rules

- Regular users can only create, view, and comment on their own tickets.
- Agents can view tickets assigned to them or unassigned open tickets, modify status, and reassign tickets.
- Admins possess global read/write access across tickets, SLA configurations, automations, and operational reports.
- Each ticket is assigned a resolution deadline based on the priority SLA. A background worker evaluates tickets every 60 seconds and marks overdue tickets as breached.

## Real-Time Events (Socket.io)

The backend server emits the following events:
- `ticket:created`
- `ticket:updated`
- `ticket:deleted`
- `ticket:assigned`
- `ticket:status`
- `comment:new`

A socket test interface is available at `http://localhost:8000/public/`. Connecting sockets can authenticate with a JWT to automatically join user-specific rooms and receive filtered updates.

## Firebase Configuration (Optional)

1. Generate a Service Account key from the Firebase Console.
2. Place the file inside `backend/` and set `FIREBASE_SERVICE_ACCOUNT=./firebase-service-account.json`, or provide the individual environment variables (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`).
3. Boot the backend server. The logs will display `Firebase connected`.

## Deployment (Render)

1. Push this repository to GitHub.
2. In Render, select **New > Blueprint** and select the repository.
3. The root `render.yaml` automatically designates `backend` as the `rootDir`, installs backend dependencies, and executes `npm start`.
4. Configure `MONGO_URI` and `JWT_SECRET` in the Render environment variables prompt.

## Project Structure

```
project-root/
├── backend/
│   ├── server.js               # Server entry point (HTTP & Socket.io)
│   ├── package.json            # Backend dependencies and scripts
│   ├── package-lock.json
│   ├── .env                    # Environment configuration (ignored by git)
│   ├── .env.example            # Environment variable template
│   ├── postman_collection.json # API collection for testing
│   └── src/
│       ├── config/             # DB and Firebase connection logic
│       ├── controllers/        # Request handling and business logic
│       ├── middleware/         # Auth, validation, RBAC, error handlers
│       ├── models/             # Mongoose schemas (User, Ticket, Comment, SLA, Automation)
│       ├── routes/             # Express API router definitions
│       ├── sockets/            # Socket.io connection and room handling
│       ├── utils/              # Token helpers, SLA checker, Swagger spec
│       ├── app.js              # Express app configuration & static asset routing
│       └── seed.js             # SLA rules and test accounts seeder
├── frontend/                   # Vanilla JS Single Page Application (served at /)
├── client/                     # React / Vite frontend application
├── public/                     # Static assets & socket test client
├── render.yaml                 # Render blueprint configuration (rootDir: backend)
├── README.md                   # Project documentation
└── .gitignore                  # Git ignore rules
```