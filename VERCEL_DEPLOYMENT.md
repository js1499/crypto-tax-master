# Vercel Deployment Preparation

This document outlines the changes made to prepare the Crypto Tax Calculator app for deployment on Vercel.

## Changes Made

1. **Updated next.config.js**:
   - Removed `output: "export"` and static export configuration
   - Removed `unoptimized: true` from images configuration
   - These changes are necessary because Vercel handles Next.js deployments differently than static exports

2. **Added vercel.json**:
   - Created configuration file for Vercel deployment
   - Specified framework, build commands, and output directory

3. **Updated package.json**:
   - Renamed project to "crypto-tax-calculator"
   - Removed Turbopack and Bun-specific configurations
   - Simplified development scripts to be compatible with Vercel environment
   - Updated linting and formatting commands

4. **Created .env.example**:
   - Added example environment variables for local development
   - Documented required database connection string

5. **Updated README.md**:
   - Added comprehensive deployment instructions
   - Included steps for setting up PostgreSQL database
   - Added instructions for handling Prisma migrations on Vercel

## Deployment Steps

1. **Push these changes to your GitHub repository**

2. **Connect your repository to Vercel**:
   - Go to [Vercel](https://vercel.com)
   - Create a new project and import from GitHub
   - Select your repository

3. **Configure environment variables**:
   - Add `DATABASE_URL` for your PostgreSQL database
   - You can use Vercel Postgres, Supabase, or any PostgreSQL provider

4. **Deploy**:
   - Vercel will automatically detect your Next.js project
   - It will build and deploy according to the settings

5. **Post-deployment**:
   - Run Prisma migrations if needed
   - Seed your database with initial data if required

## Database Considerations

The app uses Prisma ORM with PostgreSQL. When deploying to Vercel:

1. **Choose a database provider**:
   - Vercel Postgres (easiest integration)
   - Supabase
   - Railway
   - Any other PostgreSQL provider

2. **Connection string**:
   Make sure your connection string format matches:
   ```
   postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE?schema=public
   ```

3. **Migrations**:
   - Vercel runs `prisma generate` during build
   - You may need to manually run `prisma migrate deploy` after initial deployment

## Troubleshooting

If you encounter issues:

1. **Check build logs** in the Vercel dashboard
2. **Verify environment variables** are correctly set
3. **Ensure database accessibility** from Vercel's infrastructure
4. **Check Prisma connection** by testing with a simple API endpoint 