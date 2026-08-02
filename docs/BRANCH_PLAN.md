# Branch Plan

This plan groups work into meaningful user-facing feature branches.

## 1. `feature/authentication`

Goal:
Prepare the backend to identify the current user.

Includes:

- basic auth module structure
- current-user helper or request user shape
- temporary development user fallback if frontend auth is not connected yet
- user model planning
- no Supabase Auth unless explicitly requested

Recommended endpoints:

```text
GET /auth/me
```

Done when:

- backend can consistently resolve a current user
- protected endpoints have a clear future path
- auth strategy is documented

## 2. `feature/user-nutrition-calculator`

Goal:
Calculate a user's calorie and macro targets.

Includes:

- user profile nutrition fields
- BMR calculation
- TDEE calculation
- goal adjustment for lose, maintain, or gain
- macro target calculation

Recommended endpoints:

```text
POST /nutrition/calculate
GET  /nutrition/target
PUT  /nutrition/target
```

Done when:

- user can save nutrition profile inputs
- backend returns daily calorie and macro targets
- validation rejects invalid values

## 3. `feature/add-menu-toggle`

Goal:
Support the add-food menu options used by the frontend.

Note:
Most of the visible toggle UI belongs in the frontend repo. Backend work should only exist if the frontend needs stored preferences or available add-entry options.

Possible backend endpoints:

```text
GET /nutrition-entry-options
PUT /users/preferences/add-menu
```

Done when:

- backend exposes only the data the frontend needs
- no unnecessary UI logic is added to the backend

## 4. `feature/manual-nutrition-entry`

Goal:
Allow users to manually add food and nutrition data.

Includes:

- food entry model
- create food entry
- update food entry
- delete food entry
- validation DTOs
- per-user ownership

Recommended endpoints:

```text
POST   /foods
GET    /foods
GET    /foods/:id
PATCH  /foods/:id
DELETE /foods/:id
```

Done when:

- users can create manual food entries
- users can only access their own entries
- list response includes total count metadata

## 5. `feature/nutrition-history`

Goal:
Show food and nutrition history by date.

Includes:

- list entries by date range
- daily calorie totals
- daily macro totals
- simple filtering

Recommended endpoints:

```text
GET /history
GET /history/daily-summary
```

Example filters:

```text
?date=2026-08-02
?from=2026-08-01&to=2026-08-07
```

Done when:

- user can fetch entries for a day or date range
- backend returns daily totals
- time/date behavior is documented

## 6. `feature/ai-food-analysis`

Goal:
Analyze food images and estimate nutrition.

Includes:

- food image upload
- Supabase Storage integration
- AI provider service
- response normalization
- saved analysis record
- optional conversion from analysis result to food entry

Recommended endpoints:

```text
POST /upload/food-image
POST /analyze/food-image
POST /foods/from-analysis
```

Done when:

- images upload safely
- AI keys stay backend-only
- AI output is validated before saving
- user can confirm or edit AI result before it becomes a food entry
