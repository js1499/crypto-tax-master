# Quick Database Connection Check Script
Write-Host "=== Database Connection Check ===" -ForegroundColor Cyan
Write-Host ""

# Check if .env exists
if (Test-Path .env) {
    Write-Host "✓ .env file found" -ForegroundColor Green
    
    # Check for DATABASE_URL
    $envContent = Get-Content .env
    $dbUrlLine = $envContent | Select-String "DATABASE_URL"
    
    if ($dbUrlLine) {
        Write-Host "✓ DATABASE_URL found in .env" -ForegroundColor Green
        
        # Extract the URL (without showing password)
        if ($dbUrlLine -match "DATABASE_URL=(.+)") {
            $url = $matches[1].Trim()
            if ($url -match "postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)") {
                $user = $matches[1]
                $host = $matches[3]
                $port = $matches[4]
                $database = $matches[5]
                
                Write-Host "  User: $user" -ForegroundColor Yellow
                Write-Host "  Host: $host" -ForegroundColor Yellow
                Write-Host "  Port: $port" -ForegroundColor Yellow
                Write-Host "  Database: $database" -ForegroundColor Yellow
                
                # Check if it's a local connection
                if ($host -eq "localhost" -or $host -eq "127.0.0.1") {
                    Write-Host ""
                    Write-Host "⚠ Local PostgreSQL detected" -ForegroundColor Yellow
                    Write-Host "  Make sure PostgreSQL is running on your machine" -ForegroundColor Yellow
                    Write-Host "  You can check with: Get-Service postgresql*" -ForegroundColor Yellow
                } else {
                    Write-Host ""
                    Write-Host "✓ Cloud database detected ($host)" -ForegroundColor Green
                    Write-Host "  If connection fails, check:" -ForegroundColor Yellow
                    Write-Host "  1. Database project is active (not paused)" -ForegroundColor Yellow
                    Write-Host "  2. Connection string uses correct port (5432 or 6543 for pooling)" -ForegroundColor Yellow
                    Write-Host "  3. Password is URL-encoded (special chars like `$ become %24)" -ForegroundColor Yellow
                }
            } else {
                Write-Host "⚠ DATABASE_URL format may be incorrect" -ForegroundColor Yellow
                Write-Host "  Expected format: postgresql://user:password@host:port/database" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "✗ DATABASE_URL NOT found in .env" -ForegroundColor Red
        Write-Host ""
        Write-Host "To fix:" -ForegroundColor Yellow
        Write-Host "1. Copy env.example to .env (if not done)" -ForegroundColor Yellow
        Write-Host "2. Set DATABASE_URL with your database connection string" -ForegroundColor Yellow
        Write-Host "3. See DATABASE_SETUP_QUICK.md for instructions" -ForegroundColor Yellow
    }
} else {
    Write-Host "✗ .env file NOT found" -ForegroundColor Red
    Write-Host ""
    Write-Host "To fix:" -ForegroundColor Yellow
    Write-Host "1. Copy env.example to .env" -ForegroundColor Yellow
    Write-Host "   Copy-Item env.example .env" -ForegroundColor Cyan
    Write-Host "2. Edit .env and set DATABASE_URL" -ForegroundColor Yellow
    Write-Host "3. See DATABASE_SETUP_QUICK.md for instructions" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Quick Fix Options ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Option 1: Use Supabase (Free)" -ForegroundColor Green
Write-Host "  1. Go to https://supabase.com and create account" -ForegroundColor White
Write-Host "  2. Create new project" -ForegroundColor White
Write-Host "  3. Go to Project Settings -> Database" -ForegroundColor White
Write-Host "  4. Copy connection string (use pooling port 6543)" -ForegroundColor White
Write-Host "  5. Paste into .env as DATABASE_URL=..." -ForegroundColor White
Write-Host ""
Write-Host "Option 2: Use Neon (Free, Easier)" -ForegroundColor Green
Write-Host "  1. Go to https://neon.tech and create account" -ForegroundColor White
Write-Host "  2. Create new project" -ForegroundColor White
Write-Host "  3. Copy connection string (shown immediately)" -ForegroundColor White
Write-Host "  4. Paste into .env as DATABASE_URL=..." -ForegroundColor White
Write-Host ""
Write-Host "After setting DATABASE_URL, run:" -ForegroundColor Yellow
Write-Host "  npx prisma migrate dev --name init" -ForegroundColor Cyan
Write-Host ""
