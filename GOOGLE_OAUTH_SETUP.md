# Google OAuth Setup Guide

This guide will help you set up Google OAuth sign-in for your crypto tax calculator application.

## Prerequisites

1. A Google Cloud Platform (GCP) account
2. Access to the Google Cloud Console

## Step-by-Step Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top
3. Click "New Project"
4. Enter a project name (e.g., "Crypto Tax Calculator")
5. Click "Create"

### 2. Enable Google+ API

1. In the Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Google+ API" or "Google Identity"
3. Click on it and click "Enable"

### 3. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. If prompted, configure the OAuth consent screen first:
   - Choose "External" (unless you have a Google Workspace)
   - Fill in the required information:
     - App name: "Crypto Tax Calculator"
     - User support email: Your email
     - Developer contact information: Your email
   - Click "Save and Continue"
   - Add scopes (optional): `email`, `profile`, `openid`
   - Click "Save and Continue"
   - Add test users (optional for development)
   - Click "Save and Continue"
   - Review and click "Back to Dashboard"

4. Create OAuth Client ID:
   - Application type: "Web application"
   - Name: "Crypto Tax Calculator Web Client"
   - Authorized JavaScript origins:
     - `http://localhost:3000` (for local development)
     - `https://yourdomain.com` (for production)
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google` (for local development)
     - `https://yourdomain.com/api/auth/callback/google` (for production)
   - Click "Create"

5. Copy the Client ID and Client Secret

### 4. Add Credentials to Environment Variables

Add the following to your `.env` file:

```env
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
```

### 5. Restart Your Development Server

After adding the environment variables, restart your Next.js development server:

```bash
npm run dev
```

## Testing

1. Navigate to `/login` in your application
2. Click the "Continue with Google" button
3. You should be redirected to Google's sign-in page
4. After signing in, you'll be redirected back to your application
5. You should now be logged in with your Google account

## Features

- **Automatic Account Creation**: New users signing in with Google will have an account created automatically
- **Account Linking**: If a user already has an account with the same email (created via email/password), the Google account will be linked automatically
- **Session Management**: Google OAuth sessions are managed by NextAuth, same as email/password sessions

## Troubleshooting

### "redirect_uri_mismatch" Error

- Make sure the redirect URI in your Google OAuth credentials matches exactly:
  - Development: `http://localhost:3000/api/auth/callback/google`
  - Production: `https://yourdomain.com/api/auth/callback/google`
- Check that there are no trailing slashes or extra characters

### "access_denied" Error

- Make sure you've completed the OAuth consent screen setup
- For development, add your email as a test user in the OAuth consent screen

### Environment Variables Not Loading

- Make sure your `.env` file is in the root directory
- Restart your development server after adding environment variables
- Check that variable names match exactly: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

## Production Deployment

When deploying to production:

1. Update the OAuth consent screen to "Published" status
2. Add your production domain to:
   - Authorized JavaScript origins
   - Authorized redirect URIs
3. Update `NEXTAUTH_URL` in your production environment variables to your production URL
4. Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in your production environment

## Security Notes

- Never commit your `.env` file or OAuth credentials to version control
- Use different OAuth credentials for development and production
- Regularly rotate your OAuth client secrets
- Monitor OAuth usage in Google Cloud Console for suspicious activity
