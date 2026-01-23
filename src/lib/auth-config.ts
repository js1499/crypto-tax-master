import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "./prisma";
import { verifyPassword } from "./auth";

/**
 * NextAuth configuration
 */
export const authOptions: NextAuthOptions = {
  // Use PrismaAdapter for OAuth providers, but JWT for credentials
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        console.log("[Auth] Credentials authorize called");

        if (!credentials?.email || !credentials?.password) {
          console.log("[Auth] Missing email or password");
          return null;
        }

        const normalizedEmail = credentials.email.toLowerCase().trim();
        console.log(`[Auth] Looking up user: ${normalizedEmail}`);

        try {
          const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
          });

          if (!user) {
            console.log("[Auth] User not found in database");
            return null;
          }

          if (!user.passwordHash) {
            console.log("[Auth] User has no password (OAuth-only account)");
            return null;
          }

          const isValid = await verifyPassword(
            credentials.password,
            user.passwordHash
          );

          if (!isValid) {
            console.log("[Auth] Invalid password");
            return null;
          }

          console.log(`[Auth] Login successful for: ${user.email}`);
          return {
            id: user.id,
            email: user.email || "",
            name: user.name,
            image: user.image,
          };
        } catch (error) {
          console.error("[Auth] Error during authorization:", error);
          return null;
        }
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true, // Allow linking accounts with same email
          }),
        ]
      : []),
    // Note: Coinbase OAuth is handled separately via /api/auth/coinbase
    // We can add it here later if needed, but for now we'll keep the existing flow
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // PrismaAdapter automatically handles OAuth account creation and linking
      // The allowDangerousEmailAccountLinking option allows linking accounts with same email
      return true;
    },
    async session({ session, token }) {
      // With JWT strategy, user is not available, use token instead
      if (session.user) {
        session.user.id = token?.id as string || token?.sub as string || "";
      }
      return session;
    },
    async jwt({ token, user, account }) {
      // Initial sign in
      if (user) {
        token.id = user.id;
      }
      return token;
    },
  },
  pages: {
    signIn: "/login",
    signOut: "/login",
    error: "/login",
    newUser: "/register",
  },
  session: {
    strategy: "jwt", // JWT required for credentials provider
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
};
