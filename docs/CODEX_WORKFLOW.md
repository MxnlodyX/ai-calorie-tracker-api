# Codex Workflow

Use this file to keep Codex work focused and efficient.

## Before Asking Codex To Code

Tell Codex:

- current branch
- feature goal
- exact endpoint or behavior
- whether to update docs
- whether to run tests
- whether to commit

Example:

```text
We are on feature/manual-nutrition-entry.
Implement POST /foods and GET /foods for the current authenticated user.
Follow AGENTS.md and update docs/API.md.
Run build and tests, but do not commit.
```

## Good Task Size

Good Codex tasks:

```text
Implement POST /foods with DTO validation and mock storage.
```

```text
Replace mock food storage with Prisma for GET /foods and POST /foods.
```

```text
Add date-range filtering to GET /foods.
```

Avoid vague tasks:

```text
Build the whole backend.
```

```text
Make the app complete.
```

## Recommended Per-Feature Flow

For each branch:

1. Ask Codex to inspect the current repo and explain the smallest implementation plan.
2. Ask Codex to implement one vertical slice.
3. Ask Codex to run build/tests.
4. Ask Codex to update docs.
5. Review the result manually.
6. Commit or ask Codex to commit.

## Prompt Templates

### New Endpoint

```text
We are on feature/<branch-name>.
Add <METHOD> <PATH>.
Use NestJS controller/service/DTO structure.
Use Prisma only if the schema already supports it.
Update docs/API.md.
Run the most relevant checks.
```

### Prisma Work

```text
We are on feature/<branch-name>.
Update the Prisma schema for <feature>.
Create or update the service methods that use it.
Do not change auth strategy.
Update docs/ARCHITECTURE.md if the data model changes.
Run prisma generate and build.
```

### Debugging

```text
This command fails:
<paste command and output>

Please inspect the repo, identify the cause, fix it, and run the relevant check again.
```

### Review

```text
Please review the current branch before I merge it.
Focus on bugs, security, data ownership, validation, and missing tests.
Do not edit files yet.
```

## Done Checklist

Before a Codex task is done:

- endpoint or feature works
- build passes
- relevant tests pass or missing tests are explained
- docs are updated if behavior changed
- `.env.example` is updated if config changed
- no secrets are added
- unrelated files are not changed
