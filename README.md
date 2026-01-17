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

📖 **For detailed step-by-step instructions, see [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md)**

### Quick Start

1. **Push your code to GitHub**

2. **Connect to Vercel**:
   - Go to [Vercel](https://vercel.com) and sign in
   - Click "Add New" > "Project"
   - Import your GitHub repository

3. **Set up environment variables** (see `env.example` for all required variables):
   - `DATABASE_URL`: Your PostgreSQL connection string
   - `NEXTAUTH_URL`: Your app URL (e.g., `https://your-app.vercel.app`)
   - `NEXTAUTH_SECRET`: Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - `ENCRYPTION_KEY`: Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

4. **Deploy**: Click "Deploy" and Vercel will build your application

5. **Run migrations** after first deployment:
   ```bash
   npm i -g vercel
   vercel login
   vercel env pull .env.production.local
   npm run prisma:migrate:deploy
   ```

### Prisma Configuration

This project is configured for Vercel with:
- ✅ `prisma generate` in build command
- ✅ `postinstall` script for Prisma Client generation
- ✅ Proper `vercel.json` configuration
- ✅ Function timeouts configured for long-running operations

See [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md) for complete setup instructions.

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
