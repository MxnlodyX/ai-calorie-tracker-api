# API Contract

Base URL for local development:

```text
http://localhost:4000
```

Frontend origin:

```text
http://localhost:3000
```

## Response Format

Single-object success response:

```json
{
  "message": "Success message",
  "data": {}
}
```

List response:

```json
{
  "data": [],
  "meta": {
    "total": 0
  }
}
```

Errors should use NestJS default exception responses unless a custom error format is intentionally added.

## Health

### `GET /health`

Returns backend status.

Example response:

```json
{
  "message": "Backend is running",
  "data": {
    "status": "ok"
  }
}
```

## Authentication

### `GET /authentications/google`

Starts Google OAuth. The backend creates an HttpOnly OAuth state cookie and redirects the browser to Google.

### `GET /authentications/google/callback`

Google redirects to this route. The backend validates OAuth state, creates or links the local user, sets the backend-issued `access_token` HttpOnly cookie, and redirects to `FRONTEND_URL`.

### `GET /authentications/me`

Validates the backend-issued cookie and returns the current database user. Returns `401 Unauthorized` when the cookie is missing, expired, invalid, or belongs to a deleted user.

Example response:

```json
{
  "id": "clx123",
  "email": "person@example.com",
  "name": "Example Person",
  "image": "https://example.com/avatar.jpg",
  "heightCm": 175,
  "weightKg": 70,
  "dietMode": "maintain",
  "kcalGoal": 2100,
  "proteinGoal": 126,
  "fatGoal": 56,
  "carbGoal": 273
}
```

### `POST /authentications/logout`

Clears the backend access-token cookie and returns `204 No Content`.

Frontend requests that need authentication must include credentials:

```ts
fetch('http://localhost:4000/authentications/me', {
  credentials: 'include',
});
```

## User Profile

### `GET /users/profile`

Returns the current authenticated user's profile and saved nutrition goals.

### `PUT /users/profile`

Creates or updates the current authenticated user's profile fields. If `weightKg` and
`dietMode` are provided and nutrition goals are not supplied manually, the backend
calculates `kcalGoal`, `proteinGoal`, `fatGoal`, and `carbGoal`.

Supported `dietMode` values:

```text
lose
maintain
gain
```

Example request:

```json
{
  "name": "Example Person",
  "heightCm": 175,
  "weightKg": 70,
  "dietMode": "maintain"
}
```

Example response:

```json
{
  "message": "User profile updated successfully",
  "data": {
    "id": "clx123",
    "email": "person@example.com",
    "name": "Example Person",
    "image": "https://example.com/avatar.jpg",
    "heightCm": 175,
    "weightKg": 70,
    "dietMode": "maintain",
    "kcalGoal": 2100,
    "proteinGoal": 126,
    "fatGoal": 56,
    "carbGoal": 273
  }
}
```

## Nutrition Calculator

### `POST /nutrition/calculate`

Calculates calorie and macro targets from profile data.

Example request:

```json
{
  "sex": "male",
  "age": 25,
  "heightCm": 175,
  "weightKg": 70,
  "activityLevel": "moderate",
  "goal": "maintain"
}
```

Example response:

```json
{
  "message": "Nutrition target calculated successfully",
  "data": {
    "bmr": 1648,
    "tdee": 2554,
    "calorieTarget": 2554,
    "proteinG": 140,
    "carbsG": 319,
    "fatG": 71
  }
}
```

### `GET /nutrition/target`

Returns the current user's saved nutrition target.

### `PUT /nutrition/target`

Saves or updates the current user's nutrition target/profile.

## Add Menu Options

### `GET /nutrition-entry-options`

Returns supported ways to add nutrition entries.

Example response:

```json
{
  "data": [
    {
      "id": "manual",
      "label": "Manual entry",
      "enabled": true
    },
    {
      "id": "ai-image",
      "label": "AI image analysis",
      "enabled": false
    }
  ]
}
```

Note:
The toggle UI itself belongs in the frontend. Backend should only store preferences or expose option availability if needed.

## Manual Food Entries

### `POST /foods`

Creates a manual food entry for the current user.

Example request:

```json
{
  "foodName": "Chicken rice",
  "calories": 620,
  "proteinG": 35,
  "carbsG": 70,
  "fatG": 20,
  "eatenAt": "2026-08-02T12:30:00.000Z"
}
```

Example response:

```json
{
  "message": "Food entry created successfully",
  "data": {
    "id": "food_123",
    "userId": "dev-user",
    "foodName": "Chicken rice",
    "calories": 620,
    "proteinG": 35,
    "carbsG": 70,
    "fatG": 20,
    "eatenAt": "2026-08-02T12:30:00.000Z"
  }
}
```

### `GET /foods`

Returns food entries for the current user.

Supported query params:

```text
date
from
to
limit
offset
```

Example:

```text
GET /foods?date=2026-08-02
```

### `GET /foods/:id`

Returns one food entry owned by the current user.

### `PATCH /foods/:id`

Updates one food entry owned by the current user.

### `DELETE /foods/:id`

Deletes one food entry owned by the current user.

## Food List

Reusable nutrition records owned by the current user. These are stored in `FoodList`
and can be used by the frontend as saved foods/templates when adding meals.

### `POST /food-lists`

Creates a saved food nutrition item.

Example request:

```json
{
  "name": "Boiled egg",
  "kcal": 78,
  "proteinG": 6.3,
  "carbG": 0.6,
  "fatG": 5.3,
  "description": "One large egg"
}
```

### `GET /food-lists`

Returns saved food nutrition items for the current user.

Supported query params:

```text
limit
offset
```

### `GET /food-lists/:id`

Returns one saved food item owned by the current user.

### `PATCH /food-lists/:id`

Updates one saved food item owned by the current user.

### `DELETE /food-lists/:id`

Deletes one saved food item owned by the current user.

## Nutrition History

### `GET /history`

Returns food entries grouped or filtered by date.

Example:

```text
GET /history?from=2026-08-01&to=2026-08-07
```

### `GET /history/daily-summary`

Returns total calories and macros for a day or date range.

Example response:

```json
{
  "data": {
    "date": "2026-08-02",
    "calories": 1840,
    "proteinG": 120,
    "carbsG": 210,
    "fatG": 55
  }
}
```

## Upload

### `POST /upload/food-image`

Uploads a food image to Supabase Storage.

Rules:

- allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
- max size: 5 MB
- save image metadata in database
- do not store raw image binary in PostgreSQL

Example response:

```json
{
  "message": "Food image uploaded successfully",
  "data": {
    "id": "img_123",
    "storagePath": "food-images/dev-user/1722600000000-meal.jpg",
    "publicUrl": "https://example.supabase.co/storage/v1/object/public/food-images/dev-user/1722600000000-meal.jpg"
  }
}
```

## AI Food Analysis

### `POST /analyze/food-image`

Analyzes an uploaded food image.

Example request:

```json
{
  "foodImageId": "img_123"
}
```

Example response:

```json
{
  "message": "Food image analyzed successfully",
  "data": {
    "foodName": "Chicken rice",
    "calories": 620,
    "proteinG": 35,
    "carbsG": 70,
    "fatG": 20,
    "confidence": 0.78,
    "analysisId": "analysis_123"
  }
}
```

Important:
AI output must be treated as an estimate. The frontend should allow the user to confirm or edit the result.

### `POST /foods/from-analysis`

Creates a food entry from a confirmed AI analysis result.

Example request:

```json
{
  "analysisId": "analysis_123",
  "foodName": "Chicken rice",
  "calories": 620,
  "proteinG": 35,
  "carbsG": 70,
  "fatG": 20
}
```
