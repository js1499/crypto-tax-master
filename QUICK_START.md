# Quick Start: Upload to GitHub

## Option 1: Use the Script (Easiest)

1. **Create the GitHub repository first:**
   - Go to https://github.com/new
   - Repository name: `crypto-tax-calculator` (or your choice)
   - **Don't** initialize with README, .gitignore, or license
   - Click "Create repository"

2. **Run the PowerShell script:**
   ```powershell
   .\push-to-github.ps1
   ```
   - Enter your GitHub username
   - Enter repository name (or press Enter for default)
   - When prompted for password, use a **Personal Access Token** (not your GitHub password)

## Option 2: Manual Commands

1. **Create the GitHub repository:**
   - Go to https://github.com/new
   - Create repository (don't initialize with anything)

2. **Run these commands:**
   ```powershell
   git remote add origin https://github.com/YOUR_USERNAME/crypto-tax-calculator.git
   git branch -M main
   git push -u origin main
   ```

## Getting a Personal Access Token

If you're asked for a password, you need a Personal Access Token:

1. Go to: https://github.com/settings/tokens
2. Click "Generate new token" > "Generate new token (classic)"
3. Name it: "Crypto Tax Calculator"
4. Select scope: **repo** (all repo permissions)
5. Click "Generate token"
6. **Copy the token** (you won't see it again!)
7. Use this token as your password when pushing

## Troubleshooting

**"Repository not found"**
- Make sure you created the repository on GitHub first
- Check the repository name matches exactly

**"Authentication failed"**
- Use Personal Access Token instead of password
- Make sure token has "repo" permissions

**"Remote origin already exists"**
```powershell
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
```

