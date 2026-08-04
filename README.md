# AI Calorie Tracker API

A simple, extensible backend API for tracking meals and estimating calories using AI. Built with TypeScript and NestJS, this project provides REST endpoints for logging meals, querying nutrition estimates, and managing users. It’s intended as the API for an AI‑assisted calorie tracking application or as a starting point for learning how to combine NestJS with AI services.

## Features

- Create, read, update, and delete meal entries
- Estimate calories and nutrition using an AI model (pluggable provider)
- User management and basic authentication hooks
- TypeScript, unit & e2e test scripts, and Docker-friendly configuration

## Tech stack

- Node.js + TypeScript
- NestJS framework
- (Optional) Any AI provider (e.g., OpenAI) for nutrition estimation
- Database: developer choice (Postgres, SQLite, etc.) via TypeORM/Prisma (configure in .env)

## Getting started

Prerequisites:

- Node.js 18+ or later
- npm or pnpm
- A database (Postgres recommended for production)
- (Optional) AI provider API key (e.g. OPENAI_API_KEY) if you want calorie estimation

Install dependencies:

```bash
npm install
```

Copy the example environment file and update values:

```bash
cp .env.example .env
# Edit .env to set DATABASE_URL, PORT, and AI provider keys
```

Run locally (development):

```bash
# watch mode with hot reload
npm run start:dev

# or run once
npm run start
```

Run production build:

```bash
npm run build
npm run start:prod
```

Run tests:

```bash
npm run test        # unit tests
npm run test:e2e    # e2e tests
npm run test:cov    # coverage
```

Docker (example):

- Add a Dockerfile and update configuration as needed. This repository is Docker-friendly but does not ship a default image.

## Configuration and environment variables

Common variables used by the project (adjust names to match your codebase):

- PORT - port the API listens on (default: 3000)
- DATABASE_URL - database connection string
- AI_PROVIDER - identifier for the AI service to use (e.g. openai)
- OPENAI_API_KEY (or other provider-specific key) - API key for AI provider

Note: Check src/config or the environment loading code to confirm exact variable names and add any additional values required.

## API overview

The API is intended to expose REST endpoints. Example endpoints (verify exact routes in src/controllers):

- POST /auth/register — create a new user
- POST /auth/login — authenticate and return a token
- GET /meals — list meals for the authenticated user
- POST /meals — create a meal entry (body: { name, time, description, calories? })
- GET /meals/:id — fetch a single meal
- PUT /meals/:id — update a meal
- DELETE /meals/:id — delete a meal
- POST /estimate — send a meal description to the AI and receive calorie/nutrition estimates

Authenticate requests with the configured auth mechanism (JWT is common). See src/auth for implementation details.

Example: create a meal

```bash
curl -X POST http://localhost:3000/meals \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Oatmeal with fruit","description":"1 cup oatmeal, 1/2 cup blueberries, 1 tbsp honey"}'
```

Estimate calories using AI (example):

```bash
curl -X POST http://localhost:3000/estimate \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"text":"2 slices of pizza, 1 small salad"}'
```

## Extensibility

- Swap AI providers by adding a provider service implementing a shared interface
- Replace or configure the ORM (TypeORM/Prisma) to match your preferred database
- Add rate limiting, validation, background jobs, or analytics as needed

## Contributing

Contributions, issues, and feature requests are welcome. Please open an issue describing your change before submitting a PR if it’s non-trivial.

Suggested workflow:

1. Fork the repository
2. Create a feature branch: git checkout -b feat/your-feature
3. Run and update/add tests
4. Open a pull request with a clear description of changes

## License

Specify the project license here (for example, MIT). If you keep the original NestJS license references, ensure you have the right to do so.

## Contact

If you have questions or need help, open an issue in this repository or reach out to the maintainer.
