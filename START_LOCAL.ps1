# Quick Start Script for Local Development
# Run this script to set up and start the application locally

Write-Host "🚀 Setting up Crypto Tax Calculator for local development..." -ForegroundColor Cyan
Write-Host ""

# Check if .env exists
if (-not (Test-Path .env)) {
    Write-Host "📝 Creating .env file from env.example..." -ForegroundColor Yellow
    Copy-Item env.example .env
    Write-Host "✅ .env file created!" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠️  IMPORTANT: Edit .env file and add your DATABASE_URL" -ForegroundColor Red
    Write-Host "   You can use a free cloud database from:" -ForegroundColor Yellow
    Write-Host "   - Supabase: https://supabase.com" -ForegroundColor Cyan
    Write-Host "   - Neon: https://neon.tech" -ForegroundColor Cyan
    Write-Host ""
    
    # Generate secrets
    Write-Host "🔐 Generating secrets..." -ForegroundColor Yellow
    $nextAuthSecret = node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
    $encryptionKey = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    
    Write-Host ""
    Write-Host "Generated NEXTAUTH_SECRET:" -ForegroundColor Green
    Write-Host $nextAuthSecret -ForegroundColor White
    Write-Host ""
    Write-Host "Generated ENCRYPTION_KEY:" -ForegroundColor Green
    Write-Host $encryptionKey -ForegroundColor White
    Write-Host ""
    Write-Host "⚠️  Add these to your .env file!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Press any key after you've updated .env file..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
} else {
    Write-Host "✅ .env file already exists" -ForegroundColor Green
}

Write-Host ""
Write-Host "📦 Checking dependencies..." -ForegroundColor Yellow
if (-not (Test-Path node_modules)) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
} else {
    Write-Host "✅ Dependencies already installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "🗄️  Setting up database..." -ForegroundColor Yellow
Write-Host "Generating Prisma Client..." -ForegroundColor Yellow
npx prisma generate

Write-Host ""
Write-Host "Running database migrations..." -ForegroundColor Yellow
npx prisma migrate dev --name init

Write-Host ""
Write-Host "🎉 Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Starting development server..." -ForegroundColor Cyan
Write-Host "The app will be available at: http://localhost:3000" -ForegroundColor Green
Write-Host ""

npm run dev
