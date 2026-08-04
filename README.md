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
- Database: developer choice (e.g. Supabase) via Prisma (configure in .env)

## Getting started

Prerequisites:

- Node.js 18+ or later
- npm or pnpm
- A database (Postgres recommended for production)
- (Optional) AI provider API key (e.g. OPENAI_API_KEY) if you want calorie estimation

Install dependencies:

```bash
npm install
