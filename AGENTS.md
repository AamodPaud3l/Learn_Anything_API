# AGENTS.md — Learn Anything API

This file defines rules for automated agents (Codex) modifying this repository.

## Project Overview

Express (CommonJS) API powering a GPT-based learning system.
Deployed to Render.
Database: Neon Postgres.
OpenAPI 3.1 spec used by GPT Actions.

## Coding Standards

- Use CommonJS (`require`, `module.exports`)
- Do NOT convert project to ESM
- Keep changes minimal and focused
- Avoid unnecessary refactoring
- Do not introduce heavy dependencies
- Prefer simple, readable code

## Security Rules

- Internal endpoints must require `requireAdminKey` middleware
- Do NOT expose `ADMIN_KEY` anywhere
- Do not remove rate limiting
- Do not make catalog write endpoints public
- Never log secrets

## OpenAPI Rules

- Keep OpenAPI version 3.1.0
- Every route must have an operationId
- Internal routes must use `security: AdminKey`
- Do NOT add manual X-ADMIN-KEY header parameters (use securitySchemes instead)
- Keep schema aligned with actual API responses

## Deployment

- App must boot with `npm start`
- Respect environment variables:
  - DATABASE_URL
  - ADMIN_KEY
- Assume deployment target is Render

## Database

- Postgres via Neon
- Use parameterized queries
- Do not introduce ORMs unless explicitly requested

## PR Expectations

When making changes:
- Update README if behavior changes
- Update OpenAPI if endpoints change
- Include curl examples for new endpoints
- Ensure server still runs locally

