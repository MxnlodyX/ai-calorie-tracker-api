# Architecture

## System Shape

The intended architecture is:

```text
Next.js Frontend
        |
        v
NestJS Backend API
        |
        v
Prisma ORM
        |
        v
Supabase PostgreSQL
```

For images:

```text
NestJS Backend API
        |
        v
Supabase Storage
```

For AI analysis:

```text
NestJS Backend API
        |
        v
AI Vision Provider
        |
        v
Prisma ORM
        |
        v
Supabase PostgreSQL
```

## Backend Modules

Recommended NestJS modules:

```text
src/
├── app.module.ts
├── main.ts
├── auth/
├── users/
├── nutrition/
├── foods/
├── history/
├── upload/
├── analyze/
└── prisma/
```

## Module Responsibilities

### `auth`

Owns Google OAuth, local user/account linking, backend JWT issuance, HttpOnly cookies, and current-user validation.

Do not add Supabase Auth unless explicitly requested.

Authentication flow:

```text
AuthController
  -> GoogleOAuthGuard (create/validate OAuth state)
  -> GoogleStrategy (normalize verified Google profile)
  -> AuthService (link User + GoogleAccount and sign JWT)
  -> PrismaService (persist/query PostgreSQL)
  -> AuthController (set HttpOnly cookie and redirect)

Authenticated request
  -> JwtAuthGuard
  -> JwtStrategy (verify JWT and reload User)
  -> Controller receives request.user
```

### `users`

Responsible for user profile data needed by the backend.

Examples:

- user id
- email
- display name
- nutrition profile fields
- preferences

### `nutrition`

Responsible for nutrition target calculations.

Examples:

- BMR
- TDEE
- calorie goal
- protein target
- carb target
- fat target

### `foods`

Responsible for manual food entries.

Examples:

- create food entry
- list food entries
- update food entry
- delete food entry
- enforce user ownership

### `history`

Responsible for historical views and summaries.

Examples:

- entries by day
- entries by date range
- daily totals
- macro summaries

### `upload`

Responsible for food image upload.

Examples:

- validate MIME type
- validate file size
- store image in Supabase Storage
- save image metadata

### `analyze`

Responsible for AI food image analysis.

Examples:

- call AI provider
- normalize AI response
- save analysis result
- return estimated nutrition

## Request Flow

Use this structure:

```text
Controller -> Service -> PrismaService -> Database
```

Controller responsibilities:

- route definitions
- request body/query/param handling
- calling services
- returning responses

Service responsibilities:

- business logic
- validation beyond DTO rules
- user ownership checks
- calling Prisma
- calling external services

Prisma service responsibilities:

- database connection
- Prisma client lifecycle

API and authentication flow logs are documented in [`LOGGING.md`](./LOGGING.md).

## Data Ownership

Most records should include:

```text
userId
createdAt
updatedAt
```

Food entries, uploaded images, and AI analyses must belong to a user.

Never return or modify another user's data.

## Suggested Prisma Models

Initial models may look like this:

```prisma
model User {
  id        String   @id
  email     String?  @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  foodEntries FoodEntry[]
  foodImages  FoodImage[]
  analyses    AiAnalysis[]
}

model NutritionTarget {
  id            String   @id @default(cuid())
  userId        String   @unique
  sex           String?
  age           Int?
  heightCm      Float?
  weightKg      Float?
  activityLevel String?
  goal          String?
  bmr           Int?
  tdee          Int?
  calorieTarget Int?
  proteinG      Float?
  carbsG        Float?
  fatG          Float?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model FoodEntry {
  id        String   @id @default(cuid())
  userId    String
  foodName  String
  calories  Int
  proteinG  Float?
  carbsG    Float?
  fatG      Float?
  eatenAt   DateTime @default(now())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  images    FoodImage[]
  analyses  AiAnalysis[]
}

model FoodImage {
  id          String   @id @default(cuid())
  userId      String
  foodEntryId String?
  storagePath String
  publicUrl   String?
  mimeType    String
  sizeBytes   Int
  createdAt   DateTime @default(now())

  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  foodEntry   FoodEntry? @relation(fields: [foodEntryId], references: [id], onDelete: SetNull)
}

model AiAnalysis {
  id            String   @id @default(cuid())
  userId        String
  foodEntryId   String?
  foodImageId   String?
  provider      String
  model         String
  foodName      String?
  calories      Int?
  proteinG      Float?
  carbsG        Float?
  fatG          Float?
  confidence    Float?
  rawAiResponse Json?
  createdAt     DateTime @default(now())

  user          User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  foodEntry     FoodEntry? @relation(fields: [foodEntryId], references: [id], onDelete: SetNull)
}
```

Adjust names and relations as the real schema develops.

## Environment Variables

Expected variables:

```env
PORT=4000
FRONTEND_URL="http://localhost:3000"
DATABASE_URL=""
DIRECT_URL=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL="http://localhost:4000/authentications/google/callback"
JWT_SECRET=""
JWT_EXPIRES_IN="15m"
JWT_COOKIE_MAX_AGE_MS=900000
SUPABASE_URL=""
SUPABASE_SERVICE_ROLE_KEY=""
SUPABASE_STORAGE_BUCKET="food-images"
AI_PROVIDER_API_KEY=""
```

Rules:

- never commit `.env`
- commit `.env.example`
- keep AI and Supabase service keys backend-only

## Development Order

Recommended order:

```text
1. health check
2. authentication identity shape
3. nutrition calculator
4. manual food entries with mock data
5. Prisma setup
6. manual food entries with database
7. nutrition history
8. upload module
9. AI food analysis
```

The first real backend milestone should be:

```text
GET /health
GET /authentications/me
POST /foods
GET /foods
```

The second milestone should be:

```text
POST /nutrition/calculate
GET /history/daily-summary
```
