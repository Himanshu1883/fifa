This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Environment variables

- **`DATABASE_URL`** — PostgreSQL connection string (required). See [DEPLOY.md](./DEPLOY.md#local-development).
- **`AUTH_SECRET`** — Random string, **32+ characters**, used to sign session cookies. Generate with `openssl rand -base64 32`; add it to `.env` / `.env.local` or to Vercel **Environment Variables**, then **restart dev** or **redeploy**. Full steps: [DEPLOY.md — AUTH_SECRET](./DEPLOY.md#auth-secret--session-signing) (or open `/docs/auth-secret` while the app is running).

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

See [DEPLOY.md](./DEPLOY.md) for hosting the app on Vercel with PostgreSQL on Railway (env vars, migrations, SSL).

The generic [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) applies to other hosts.
