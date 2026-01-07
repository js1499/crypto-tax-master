# Crypto Tax Calculator

A comprehensive cryptocurrency tax calculator application built with Next.js and Tailwind CSS. This application helps users track their cryptocurrency transactions, calculate tax liabilities, and visualize their portfolio performance.

## Features

- Transaction tracking and management
- Portfolio visualization and analytics
- Tax calculations for crypto transactions
- CSV import/export functionality
- Multi-wallet support

## Tech Stack

- **Framework**: Next.js 15
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn UI
- **Database**: PostgreSQL with Prisma ORM
- **Charting**: Recharts
- **Deployment**: Vercel

## Deploying to Vercel

### Prerequisites

1. A [Vercel](https://vercel.com) account
2. A PostgreSQL database (you can use Vercel Postgres, Supabase, Railway, etc.)

### Steps to Deploy

1. **Push your code to GitHub**: Make sure your project is on GitHub.

2. **Connect to Vercel**:
   - Go to [Vercel](https://vercel.com) and sign in
   - Click "Add New" > "Project"
   - Import your GitHub repository
   - Configure your project settings

3. **Set up environment variables**:
   In the Vercel project settings, add the following environment variables:
   
   - `DATABASE_URL`: Your PostgreSQL connection string
   - `COINBASE_CLIENT_ID`: Your Coinbase OAuth client ID
   - `COINBASE_CLIENT_SECRET`: Your Coinbase OAuth client secret
   - `COINBASE_REDIRECT_URI`: Your application's redirect URI (e.g., `https://your-app.vercel.app/api/auth/coinbase/callback`)
   
   If using Vercel Postgres:
   1. Go to Storage tab in your Vercel dashboard
   2. Create a new Postgres database
   3. Connect it to your project and the environment variables will be automatically set up

4. **Deploy**:
   - Click "Deploy" and Vercel will build and deploy your application
   - The build process will automatically run `prisma generate` as configured in the package.json
   - On the first deployment, Prisma will automatically create your database schema

### Prisma on Vercel

This project is configured to work correctly with Prisma on Vercel by:

1. Including `prisma generate` in the build command:
   ```json
   "scripts": {
     "build": "prisma generate && next build"
   }
   ```

2. Adding a `postinstall` script to ensure Prisma Client is generated after dependencies are installed:
   ```json
   "scripts": {
     "postinstall": "prisma generate"
   }
   ```

3. Configuring `vercel.json` with the correct build command:
   ```json
   {
     "buildCommand": "prisma generate && next build"
   }
   ```

These configurations prevent the "Prisma has detected that this project was built on Vercel" error which happens because Vercel caches dependencies, causing Prisma's auto-generation not to be triggered.

### Post-Deployment

After your project is deployed, you may want to:

1. **Run Prisma Migrations**: If you need to run migrations manually, you can use Vercel's CLI:
   ```bash
   npm i -g vercel
   vercel login
   vercel env pull .env.production.local
   npx prisma migrate deploy
   ```

2. **Seed Your Database**: If needed, you can seed your database with initial data:
   ```bash
   npx prisma db seed
   ```

## Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/crypto-tax-calculator.git
   cd crypto-tax-calculator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Update the `DATABASE_URL` with your PostgreSQL connection string

4. Run Prisma migrations:
   ```bash
   npx prisma migrate dev
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## License

MIT
