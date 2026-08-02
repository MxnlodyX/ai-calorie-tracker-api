# Environment Setup

Use a committed `.env.example` file and an uncommitted `.env` file.

## `.env.example`

Recommended starter template:

```env
PORT=4000
FRONTEND_URL="http://localhost:3000"

DATABASE_URL=""
DIRECT_URL=""

SUPABASE_URL=""
SUPABASE_SERVICE_ROLE_KEY=""
SUPABASE_STORAGE_BUCKET="food-images"

AI_PROVIDER_API_KEY=""
```

## Rules

- never commit `.env`
- never hardcode secrets in source code
- update `.env.example` when adding new config
- keep Supabase service role keys in the backend only
- keep AI provider keys in the backend only

## Local Ports

```text
Frontend: http://localhost:3000
Backend:  http://localhost:4000
```

## CORS

Enable CORS in `src/main.ts`:

```ts
app.enableCors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  credentials: true,
});
```

Do not use:

```ts
app.enableCors({
  origin: '*',
  credentials: true,
});
```
