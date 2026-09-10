# CBT Exam Practice System

This project is the National Examination Computer-Based Test (CBT) Practice System for **SULTAN ABDULRAHAMAN SCHOOL of HEALTH TECHNOLOGY GWADABAWA**.

The system provides complete question authoring, multi-user creator isolation, practice exam simulation, instant automated grading, and comprehensive analytics powered by **Turso (libSQL/SQLite)** for persistent cloud data storage.

---

## Database Architecture: Turso (libSQL)

The application uses **Turso (libSQL/SQLite)** as its production database engine via the official `@libsql/client`.

- **Persistent Cloud Database**: In production (Render), the backend connects directly to the remote Turso database URL. Data is fully persisted across Render deployments, restarts, and sleep cycles.
- **Zero Frontend Credential Exposure**: Turso credentials (`TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`) are strictly consumed by the Node.js backend and are never sent or exposed to the client.
- **Local Development / Testing**: For local development or automated smoke tests without remote credentials, `@libsql/client` safely operates with local file-backed storage (`file:cbt_database.db`).

### Database Tables Included

- `users`: System users with roles (`super_admin`, `question_creator`, `student`), password hashing via bcrypt, and timestamps.
- `courses`: Courses and subjects with author attribution (`created_by`), unique course codes, and descriptions.
- `questions`: Question bank with multiple-choice options (A–D), correct answer key, and course associations.
- `students`: Student profile tracking associated with authenticated accounts or guest sessions.
- `exam_attempts`: Examination attempts recording question count, correct/wrong/unanswered counts, score, percentage, start time, and submission timestamps.
- `exam_answers`: Detailed individual question responses, selected option, and correctness for result reviews.

---

## Environment Configuration

### Required Environment Variables

Configure these in `.env` (local) or in your hosting provider's dashboard (e.g. Render):

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `TURSO_DATABASE_URL` | Remote Turso database URL | `libsql://cbt-db-yourusername.turso.io` |
| `TURSO_AUTH_TOKEN` | Remote Turso authentication token | `your_turso_jwt_token_here` |
| `PORT` | HTTP server port | `3000` |
| `JWT_SECRET` | Secret key for JWT signing | Strong random string (e.g. 64-char hex) |
| `ADMIN_USERNAME` | Super Admin initial username | `admin` |
| `ADMIN_PASSWORD` | Super Admin initial password | Strong secure password |
| `NODE_ENV` | Environment mode | `production` or `development` |

---

## Deploying to Render

To deploy this repository to **Render**:

1. **Create Web Service**:
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
2. **Add Environment Variables in Render Dashboard**:
   Under **Environment** in your Render service settings, add:
   - `TURSO_DATABASE_URL`: `libsql://<your-database-name>.turso.io`
   - `TURSO_AUTH_TOKEN`: `<your-turso-auth-token>`
   - `JWT_SECRET`: `<generate-a-secure-random-string>`
   - `ADMIN_USERNAME`: `admin`
   - `ADMIN_PASSWORD`: `<your-secure-admin-password>`
   - `NODE_ENV`: `production`

---

## How to Initialize the Database

Run:

```bash
npm run db:init
```

This non-destructively initializes all tables and indexes using `CREATE TABLE IF NOT EXISTS` from `database/schema.sql` and cleans up any 1-question test dummy courses.

---

## Running the Application Locally

```bash
# Start backend server
npm start

# Or with automatic reload during development
npm run dev
```

Open `http://localhost:3000` in your browser.

- Health endpoint: `GET /api/health`
- Readiness check: `GET /api/ready`

---

## Running Automated Tests

Run the complete test suite:

```bash
npm run test:smoke
```

The automated test suite verifies:
1. Static asset delivery (HTML pages, CSS, JS, favicons, rounded institutional logo)
2. Security headers (Content-Security-Policy, anti-sniff, clickjacking protection, request tracing)
3. Turso database connectivity and table readiness
4. Admin seeding and authenticated administration checks
5. User registration with bcrypt password hashing
6. Question creator authentication and access control
7. Single-subject Excel (.xlsx) bulk question import
8. Exam taking, answer persistence, and automated scoring in Turso
9. Multi-tenant isolation (new accounts have 0 courses, 0 attempts, and blank recent activity)
10. Single-question test subjects cleanup routine
