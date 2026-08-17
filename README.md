# Penmozhi API

The active backend is now Node.js + Express.js + MongoDB + Mongoose. The former Flask/MySQL implementation is retained under `legacy/flask-source/` for audit and rollback reference; it is not loaded by the active server.

## Run locally

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Set `MONGODB_URI` and a stable `JWT_SECRET_KEY` in `.env`. The API listens on `PORT` (default `5000`) and keeps the existing `/api/...` and `/admin/...` paths.

To transfer an existing MySQL database, configure the legacy source connection (`MYSQL_URL` or `DB_*`/`MYSQL*` variables) and run:

```powershell
npm run migrate:mysql
```

The transfer is idempotent by numeric `id`. Set `MIGRATION_REPLACE=true` only when the destination collections may be replaced intentionally.

## Active structure

```text
src/
  config/       environment and MongoDB connection
  controllers/  endpoint business logic
  middleware/   JWT/session/role checks
  models/       Mongoose schemas with numeric API-compatible IDs
  routes/       original URL and HTTP method mapping
  services/     cycle prediction and privacy helpers
  utils/        dates, passwords, JWTs, validation, responses
scripts/
  migrate-mysql-to-mongodb.js
  check-source.js
test/
```

The Mongoose schemas preserve the legacy column names and numeric relationships (`profile_id`, `health_profile_id`, etc.). Password verification accepts the existing scrypt/PBKDF2 formats and bcrypt, so imported users do not need to reset their passwords.

## Verification

```powershell
npm run check
npm test
```

`npm run check` syntax-checks every active JavaScript file and rejects accidental Flask/SQLAlchemy/MySQL runtime references. AI, email, Cloudinary OAuth, payment, and wearable integrations preserve their existing safe stub behavior unless their provider environment variables are configured.

