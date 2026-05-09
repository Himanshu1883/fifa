#!/usr/bin/env sh
# Reminders only — no secrets. Full checklist: DEPLOY.md
echo "DEPLOY.md: Railway → PostgreSQL + public DATABASE_URL; Vercel → import GitHub repo, set DATABASE_URL + AUTH_SECRET, deploy; then npx prisma migrate deploy with DATABASE_URL set (local or CI). Do not commit tokens."
