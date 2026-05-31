import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { z } from 'zod';

// ─── Session type augmentation ────────────────────────────────────────────────

declare module 'next-auth' {
  interface Session {
    user: {
      id:                string;
      tier:              'free' | 'premium';
      tokenBalanceCents: number;
    } & DefaultSession['user'];
  }

  interface User {
    tier:              'free' | 'premium';
    tokenBalanceCents: number;
  }
}

type AuthJwt = {
  id:                string;
  tier:              'free' | 'premium';
  tokenBalanceCents: number;
};

// ─── Validation ───────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// ─── Auth config ──────────────────────────────────────────────────────────────

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db) as ReturnType<typeof PrismaAdapter>,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error:  '/login',
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({
          where:   { email: parsed.data.email },
          include: { tokenLedger: true },
        });
        if (!user) return null;
        if (user.status === 'pending_verification') return null;

        const passwordMatch = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!passwordMatch) return null;

        return {
          id:                user.id,
          email:             user.email,
          name:              user.username,
          tier:              user.tier as 'free' | 'premium',
          tokenBalanceCents: user.tokenLedger?.balanceCents ?? 0,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id                = user.id!;
        token.tier              = user.tier;
        token.tokenBalanceCents = user.tokenBalanceCents;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as unknown as AuthJwt;
      session.user.id                = t.id;
      session.user.tier              = t.tier;
      session.user.tokenBalanceCents = t.tokenBalanceCents;
      return session;
    },
  },
});
