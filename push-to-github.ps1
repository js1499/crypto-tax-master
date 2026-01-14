# PowerShell script to push repository to GitHub
# Run this after creating your GitHub repository

Write-Host "=== GitHub Repository Push Script ===" -ForegroundColor Cyan
Write-Host ""

# Get repository details
$username = Read-Host "Enter your GitHub username"
$repoName = Read-Host "Enter your repository name (or press Enter for 'crypto-tax-calculator')"

if ([string]::IsNullOrWhiteSpace($repoName)) {
    $repoName = "crypto-tax-calculator"
}

$repoUrl = "https://github.com/$username/$repoName.git"

Write-Host ""
Write-Host "Repository URL: $repoUrl" -ForegroundColor Yellow
Write-Host ""

# Check if remote already exists
$remoteExists = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Remote 'origin' already exists. Removing it..." -ForegroundColor Yellow
    git remote remove origin
}

# Add remote
Write-Host "Adding remote repository..." -ForegroundColor Green
git remote add origin $repoUrl

# Rename branch to main if needed
Write-Host "Setting branch to 'main'..." -ForegroundColor Green
git branch -M main

# Push to GitHub
Write-Host ""
Write-Host "Pushing to GitHub..." -ForegroundColor Green
Write-Host "You may be prompted for your GitHub credentials." -ForegroundColor Yellow
Write-Host ""

git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Successfully pushed to GitHub!" -ForegroundColor Green
    Write-Host "View your repository at: $repoUrl" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "❌ Push failed. Please check:" -ForegroundColor Red
    Write-Host "1. Repository exists on GitHub" -ForegroundColor Yellow
    Write-Host "2. You have the correct permissions" -ForegroundColor Yellow
    Write-Host "3. Your credentials are correct" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "If you need to use a Personal Access Token:" -ForegroundColor Yellow
    Write-Host "1. Go to GitHub Settings > Developer settings > Personal access tokens" -ForegroundColor Yellow
    Write-Host "2. Generate a new token with 'repo' permissions" -ForegroundColor Yellow
    Write-Host "3. Use the token as your password when prompted" -ForegroundColor Yellow
}

