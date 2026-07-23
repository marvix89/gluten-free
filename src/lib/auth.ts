import NextAuth, { DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { ensureSchema } from '@/lib/db';
import { neon } from '@neondatabase/serverless';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      isAdmin?: boolean;
    } & DefaultSession['user'];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = String(credentials.email).toLowerCase().trim();
        const password = String(credentials.password);

        try {
          await ensureSchema();
          const sql = neon(process.env.DATABASE_URL!);

          const rows = await sql`
            SELECT id, email, password_hash, is_admin FROM users WHERE email = ${email}
          `;

          const user = rows[0];
          if (!user) return null;

          const isValid = await bcrypt.compare(password, user.password_hash as string);
          if (!isValid) return null;

          return {
            id: user.id as string,
            email: user.email as string,
            isAdmin: user.is_admin as boolean,
          };
        } catch (err) {
          console.error('Auth error:', err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
        token.isAdmin = (user as any).isAdmin;
      }
      return token;
    },
    session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
        session.user.isAdmin = token.isAdmin as boolean;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
});
