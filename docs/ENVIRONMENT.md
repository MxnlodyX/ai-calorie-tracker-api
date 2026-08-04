# Environment Setup

Use a committed `.env.example` file and an uncommitted `.env` file.

## `.env.example`

Recommended starter template:

```env
PORT=4000
FRONTEND_URL="http://localhost:3000"
FRONTEND_ORIGIN="http://localhost:3000"

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

`FRONTEND_URL` is the post-login redirect destination. `FRONTEND_ORIGIN` is
the exact origin allowed to make credentialed browser requests to the API. Do
not include a path or use `*` for `FRONTEND_ORIGIN`.

Enable CORS in `src/main.ts` with the configured origin:

```ts
app.enableCors({
  origin: configService.getOrThrow<string>('frontendOrigin'),
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

The backend access cookie is `HttpOnly`. In production it uses `Secure` and
`SameSite=None` so a frontend hosted on another site can send it. In local
development it uses `Secure=false` and `SameSite=Lax`. Frontend requests to
authenticated endpoints must also set `credentials: 'include'`.
