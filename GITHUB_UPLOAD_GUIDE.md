# GitHub Upload Guide

Your repository is ready to be uploaded to GitHub! Follow these steps:

## Step 1: Create a GitHub Repository

1. Go to [GitHub.com](https://github.com) and sign in
2. Click the **"+"** icon in the top right corner
3. Select **"New repository"**
4. Fill in the repository details:
   - **Repository name**: `crypto-tax-calculator` (or your preferred name)
   - **Description**: "Cryptocurrency tax calculator with Solana and Ethereum support"
   - **Visibility**: Choose Public or Private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
5. Click **"Create repository"**

## Step 2: Connect Your Local Repository to GitHub

After creating the repository, GitHub will show you commands. Use these commands in your terminal:

### Option A: If you haven't created the GitHub repo yet
```bash
# Add the remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/crypto-tax-calculator.git

# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

### Option B: If you already created the GitHub repo
Copy the repository URL from GitHub and run:
```bash
git remote add origin YOUR_REPOSITORY_URL
git branch -M main
git push -u origin main
```

## Step 3: Verify Upload

1. Go to your GitHub repository page
2. You should see all your files
3. Check that sensitive files (like `.env`) are NOT visible

## Important Notes

### ✅ What's Already Protected:
- `.env*` files are in `.gitignore` (won't be uploaded)
- `node_modules/` is ignored
- Database files are ignored
- Build artifacts are ignored

### ⚠️ Before Pushing, Make Sure:
- No API keys are in your code
- No database passwords are committed
- No personal information is in the code

### 🔐 Environment Variables:
Create a `.env.example` file (optional but recommended) to show what environment variables are needed:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/crypto_tax

# API Keys
ETHERSCAN_API_KEY=your_etherscan_api_key
SOLSCAN_API_KEY=your_solscan_api_key

# OAuth (if using)
COINBASE_CLIENT_ID=your_client_id
COINBASE_CLIENT_SECRET=your_client_secret
```

## Troubleshooting

### If you get "remote origin already exists":
```bash
git remote remove origin
git remote add origin YOUR_REPOSITORY_URL
```

### If you get authentication errors:
- Use GitHub Personal Access Token instead of password
- Or use SSH: `git remote add origin git@github.com:USERNAME/REPO.git`

### If you need to update the remote URL:
```bash
git remote set-url origin NEW_REPOSITORY_URL
```

## Next Steps After Upload

1. **Add a README**: Update `README.md` with project description, setup instructions, and usage
2. **Add License**: Consider adding a LICENSE file
3. **Set up GitHub Actions**: For CI/CD (optional)
4. **Add Topics/Tags**: On GitHub, add topics like `cryptocurrency`, `tax-calculator`, `nextjs`, `typescript`

## Quick Command Reference

```bash
# Check status
git status

# Add changes
git add .

# Commit changes
git commit -m "Your commit message"

# Push to GitHub
git push

# Pull latest changes
git pull
```

