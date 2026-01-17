/**
 * Prisma Migration Script for Vercel
 * 
 * This script can be run as a Vercel Serverless Function to apply migrations.
 * 
 * Usage:
 * 1. Deploy this as an API route: src/app/api/migrate/route.ts
 * 2. Or run via Vercel CLI: npx prisma migrate deploy
 * 
 * Note: In production, prefer using Vercel CLI for migrations
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

async function runMigrations() {
  try {
    console.log('Starting database migrations...');
    
    // Run Prisma migrations
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: process.env,
    });
    
    console.log('Migrations completed successfully');
    return { success: true, message: 'Migrations applied successfully' };
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// If running as a script
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export { runMigrations };
