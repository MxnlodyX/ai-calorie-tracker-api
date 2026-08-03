# AGENTS.md Template

Copy this file to the root of the new repository as `AGENTS.md`.

## Project Overview

This repository is the backend API for an AI calorie and nutrition tracker.

The backend uses:

- NestJS
- TypeScript
- Prisma ORM
- Supabase PostgreSQL
- Supabase Storage
- AI Vision API integration later

The frontend is a separate Next.js application.

Default local ports:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:4000
```

## Main Goal

Build a clean, maintainable backend API that supports:

- user authentication integration
- user nutrition target calculation
- manual nutrition entry
- nutrition history
- food image upload
- AI food image analysis later

Do not build AI analysis before the basic authenticated manual food flow works.

## Feature Priority

Implement features in this order:

1. authentication
2. user_nutrition_calculator
3. toggle_add_menu_list
4. manual_add_nutrition
5. user_history
6. ai_food_analysis

## Branch Plan

Use these feature branches:

```text
feature/authentication
feature/user-nutrition-calculator
feature/add-menu-toggle
feature/manual-nutrition-entry
feature/nutrition-history
feature/ai-food-analysis
```

## Architecture Rules

Follow NestJS conventions:

```text
Controller -> Service -> PrismaService -> Database
```

Controllers should handle request and response flow only.

Services should contain business logic.

Database access should go through Prisma.

Recommended modules:

```text
src/
├── auth/
├── users/
├── nutrition/
├── foods/
├── history/
├── upload/
├── analyze/
└── prisma/
```

## Authentication Rules

The backend owns the login flow using Google OAuth.

Backend authentication should create or link the local user, issue backend-managed session/JWT credentials, and expose the current identity through `/authentications/me`.

Do not add Supabase Auth unless explicitly requested.

Do not create a second independent user system outside the backend auth/user models.

During early development, a temporary `dev-user` id may be used, but it must be clearly marked as temporary.

## Validation Rules

Use DTOs and `class-validator`.

Enable global validation in `src/main.ts`:

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

Avoid `any` unless absolutely necessary.

## Environment Rules

Use environment variables for secrets and configuration.

Never commit `.env`.

Update `.env.example` whenever a required environment variable is added.

Expected environment variables:

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

## CORS Rules

Backend should enable CORS for the frontend origin:

```ts
app.enableCors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  credentials: true,
});
```

Do not use wildcard CORS with credentials.

## API Response Style

For successful single-object responses:

```json
{
  "message": "Food entry created successfully",
  "data": {}
}
```

For list responses:

```json
{
  "data": [],
  "meta": {
    "total": 0
  }
}
```

Use NestJS exceptions for errors.

## File Upload Rules

Food image uploads should:

- accept only `image/jpeg`, `image/png`, and `image/webp`
- reject files larger than 5 MB
- store files in Supabase Storage
- save only image paths or URLs in PostgreSQL
- never store raw image binary in PostgreSQL

Storage path format:

```text
food-images/{userId}/{timestamp}-{filename}
```

## AI Analysis Rules

Do not call the AI provider directly from the frontend.

AI API keys must stay in the backend.

Recommended flow:

```text
Frontend uploads image
Backend stores image
Backend sends image or signed URL to AI provider
Backend validates and normalizes result
Backend saves analysis result
Backend returns structured nutrition estimate
```

Never fully trust AI output. Validate and normalize before saving.

## Done Means

Before calling a feature done:

- the code builds
- relevant endpoints work
- DTO validation works
- Prisma schema or migrations are updated if needed
- `.env.example` is updated if needed
- `docs/API.md` is updated if endpoint behavior changed
- tests are added or the reason for no tests is documented

## Coding Style

Keep code:

- simple
- readable
- typed
- modular
- easy to debug

Avoid:

- over-engineering
- unrelated refactors
- unnecessary libraries
- hardcoded secrets
- database logic in controllers
