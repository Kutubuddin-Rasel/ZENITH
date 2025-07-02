# Zenith Frontend

Enterprise-grade, Jira-style project management app built with Next.js, TypeScript, Tailwind CSS.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set environment variables in `.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3000
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## Folder Structure

```
/src
  /app           # Next.js App Router pages
  /components    # Reusable UI components
  /lib           # API fetchers, utilities
  /hooks         # Custom React hooks
  /context       # React context providers
  /types         # TypeScript types
  /styles        # Tailwind and global styles
  /public        # Static assets
```

## Scripts
- `npm run dev` — Start dev server
- `npm run build` — Build for production
- `npm run lint` — Lint code
- `npm run typecheck` — Type check

## Environment Variables
- `NEXT_PUBLIC_API_URL` — Backend API base URL

---

For more details, see the code comments and docs.

## Getting Started

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

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
