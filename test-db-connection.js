// Quick database connection test
// Run with: node test-db-connection.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function testConnection() {
  const prisma = new PrismaClient();
  
  console.log('Testing database connection...');
  console.log('');
  
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set in .env file');
    console.log('');
    console.log('Please set DATABASE_URL in your .env file');
    process.exit(1);
  }
  
  // Show connection info (without password)
  const url = process.env.DATABASE_URL;
  const maskedUrl = url.replace(/:[^:@]+@/, ':****@');
  console.log('Connection string:', maskedUrl);
  console.log('');
  
  try {
    // Test connection
    await prisma.$connect();
    console.log('✅ Successfully connected to database!');
    
    // Test a simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database query test passed');
    
    // Check if tables exist
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    
    console.log('');
    console.log('📊 Found tables:', tables.length);
    if (tables.length > 0) {
      console.log('   Tables:', tables.map(t => t.table_name).join(', '));
    } else {
      console.log('   ⚠️  No tables found. You may need to run migrations:');
      console.log('   npx prisma migrate dev --name init');
    }
    
    await prisma.$disconnect();
    console.log('');
    console.log('✅ All tests passed! Database connection is working.');
    
  } catch (error) {
    console.error('');
    console.error('❌ Database connection failed!');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    
    if (error.message.includes("Can't reach database") || error.message.includes("P1001")) {
      console.log('💡 This usually means:');
      console.log('   1. Wrong connection string format');
      console.log('   2. Using direct connection instead of pooled (or vice versa)');
      console.log('   3. Password has special characters that need URL encoding');
      console.log('   4. Network/firewall blocking the connection');
      console.log('');
      console.log('📖 Check SUPABASE_TROUBLESHOOTING.md for solutions');
    } else if (error.message.includes("authentication failed") || error.message.includes("password")) {
      console.log('💡 Authentication failed. Check:');
      console.log('   1. Password is correct');
      console.log('   2. Special characters in password are URL-encoded');
      console.log('      ($ becomes %24, @ becomes %40, etc.)');
    } else if (error.message.includes("does not exist")) {
      console.log('💡 Database does not exist. Check:');
      console.log('   1. Database name in connection string is correct');
      console.log('   2. You\'re using the right Supabase project');
    }
    
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

testConnection();
