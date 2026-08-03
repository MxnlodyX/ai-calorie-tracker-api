# Project Review

Reviewed on 2026-08-04 after the remediation work from the previous audit.
The review covered API routes versus `docs/API.md`, authentication and authorization,
request validation, database writes and migrations, Supabase/OpenAI integrations,
tests, lint, build, and Prisma schema validation.

## Remaining material findings

|   # | Severity | Category                  | Finding                                                                                                                                                                                                                                                                  | Evidence / recommended action                                                                                                                                                                                                                                                              |
| --: | :------: | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   1 |  Medium  | Deployment                | The connected Supabase database has migration records `20260727190000_add_nextauth_google_tables` and `20260730180248_add_food_tracking_schema`, but those files are not in this repository. The new local migrations are therefore pending against a divergent history. | `prisma migrate status` reports no common migration. Either explicitly reset the disposable `public` schema and apply the local history, or recover the two original migration files before deployment. Do not run `migrate deploy` against the current database until this is reconciled. |
|   2 |  Medium  | Storage lifecycle         | Rejecting an AI analysis only changes its status. The associated `FoodImage` row and Supabase object remain indefinitely even though rejected analyses cannot be retried, causing avoidable storage cost and retention of user images.                                   | [`rejectAnalysis`](src/nutrition-analysis/nutrition-analysis.service.ts#L251) updates the analysis at line 258 without deleting the storage object. Add an explicit image-retention policy and best-effort Supabase cleanup after a rejection is committed.                                |
|   3 |  Medium  | Pagination / availability | The general food and food-list queries now cap `limit` at 100, but the calendar month/date endpoints still load every matching row into memory. A user with many entries in one period can produce a large response and database load.                                   | [`listCalendarEntries`](src/foods/foods.service.ts#L276) calls `findMany` without `take` or cursor pagination. Add bounded pagination to both calendar endpoints while retaining the separate total count.                                                                                 |

## Closed in this review

- Added the documented structured `GET /health` endpoint and removed the Nest starter root service.
- Removed unused Google OAuth token columns and the unused `FoodImage.publicUrl` column with a migration.
- Aligned the upload and manual-food response examples with the actual API fields.
- Added E2E checks for health and unauthenticated access to protected controllers.
- Added focused Google and JWT strategy tests.
- Fixed invalid calendar dates such as `2026-02-31` and the seven existing test lint errors.

## Verification baseline

- Full ESLint run passes.
- Unit tests and focused E2E tests pass.
- Prisma schema validation and application build pass.
- The connected Supabase migration history remains intentionally unchanged because
  resetting its `public` schema is destructive and still requires explicit approval.
