# SupportDesk

A helpdesk ticketing system backend for my final year project. Users raise tickets, agents assign and resolve them, admins see everything and get reports. Real-time ticket updates run over socket.io and agents get an FCM push when a ticket is assigned to them.

Built with Node.js, Express, MongoDB (Mongoose), JWT auth with optional Firebase sign-in, socket.io and firebase-admin for push notifications.

## Tech stack

- Node.js + Express (REST API)
- MongoDB + Mongoose
- JSON Web Tokens, plus optional Firebase Auth (firebase-admin)
- Socket.io for live ticket events
- Firebase Cloud Messaging for push notifications

## Setup

Prerequisites: Node 18+, MongoDB running locally (or a MONGO_URI for Atlas).

```
npm install
cp .env.example .env
npm run seed
npm start
```

`npm run seed` creates the three SLA rules (high 4h, medium 24h, low 72h) and three login accounts for testing. If MongoDB is already running on your machine, the default connection string works as is.

Seeded accounts:

| role  | email                      | password |
|-------|----------------------------|----------|
| user  | user@supportdesk.com       | user123  |
| agent | agent@supportdesk.com      | agent123 |
| admin | admin@supportdesk.com      | admin123 |

The SLA rules are also seeded automatically on first server start, so the app runs without `npm run seed` too.

## Environment variables

| variable                    | purpose                                                  |
|-----------------------------|----------------------------------------------------------|
| PORT                        | server port, default 8000                                |
| MONGO_URI                   | mongo connection string                                  |
| JWT_SECRET                  | secret used to sign jwts                                  |
| JWT_EXPIRES_IN              | token expiry, default 7d                                  |
| FIREBASE_SERVICE_ACCOUNT    | path to the firebase service account json                |
| FIREBASE_PROJECT_ID         | alternative to the file, plus the two below              |
| FIREBASE_CLIENT_EMAIL       |                                                          |
| FIREBASE_PRIVATE_KEY        |                                                          |

Firebase is optional. If neither the file nor the individual vars are present, the app logs a warning and runs without push notifications or firebase login.

## Frontend

There is a small browser app included in the frontend/ folder, served at http://localhost:8000/. It is plain HTML + vanilla JS with no build step. It covers login/register, the ticket list with filters, creating tickets, the ticket detail page with comments and status/assign controls, a live socket feed and an admin reports page. Open the root url in a browser, log in with a seeded account and open two tabs to watch events update live.

## API list

Base URL: http://localhost:8000

Auth
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/firebase  (login with a firebase id token)

Users
- GET /api/users?role=agent  (agent or admin)

Tickets
- GET /api/tickets             (filters: status, priority)
- GET /api/tickets/:id
- POST /api/tickets
- PUT /api/tickets/:id
- DELETE /api/tickets/:id
- PUT /api/tickets/:id/status
- PUT /api/tickets/:id/assign

Comments
- POST /api/comments
- GET /api/comments
- GET /api/comments/ticket/:id

SLA
- GET /api/sla
- PUT /api/sla/:id          (admin)

Admin
- GET /api/admin/tickets    (admin)
- GET /api/admin/reports    (admin)

Notifications
- POST /api/notifications/send

Swagger UI is available at http://localhost:8000/api-docs and the Postman collection is in postman_collection.json (import it, the login requests save the tokens automatically).

Every protected request needs `Authorization: Bearer <token>`.

## Rules

- A normal user only sees and edits their own tickets.
- An agent sees tickets assigned to them plus open unassigned ones. Only agents and admins can assign tickets or change status.
- Admins see all tickets and the reports page.
- A ticket gets a due date from the SLA of its priority. A job runs every minute and marks overdue tickets as breached.

## Socket.io events

The server emits these events:
- ticket:created
- ticket:updated
- ticket:deleted
- ticket:assigned
- ticket:status
- comment:new

To test sockets, start the app, open http://localhost:8000/public/ in two browser tabs and create or update a ticket from the API (or from Postman). Both tabs show the live events. If you paste a jwt into the page, the socket joins your user room so you only get events for tickets you can actually see.

You can also test with the socket.io-client package:

```js
const io = require('socket.io-client');
const socket = io('http://localhost:8000');
socket.on('ticket:created', (data) => console.log(data));
```

## Firebase setup (optional)

1. Create a project in the Firebase console and download the service account json.
2. Either put the file somewhere and set `FIREBASE_SERVICE_ACCOUNT=./firebase-service-account.json`, or paste the project id, client email and private key as individual env vars. The private key has literal \n characters that the app converts back to newlines.
3. Restart the app. You should see "Firebase connected".
4. Agent push tokens come from the mobile/web app calling the Android GoogleSignIn or Firebase Auth SDK and sending the registration token to /api/auth/register or /api/auth/firebase as fcmToken.

## Deploying to Render

Push this repo to GitHub, then in Render create a new Web Service. Give it a MongoDB Atlas connection string, a JWT_SECRET, and optionally the firebase env vars. A render.yaml is included for blueprints: in Render choose "Blueprint" when creating from repo and it will read the envVar keys marked sync:false, which you fill in once.

## Project structure

```
src/
  config/       db and firebase setup
  models/       user, ticket, comment, sla
  controllers/  request handlers
  routes/       route definitions
  middleware/   auth, role check, validation, error handlers
  sockets/      socket.io setup
  utils/        jwt, sla helpers, swagger doc
  app.js        express app
  seed.js       demo data
server.js       entry point
frontend/       browser app (served at /)
public/         socket test page
```