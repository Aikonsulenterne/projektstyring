import 'server-only';
import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';

/**
 * Auth.js with Microsoft Entra ID, single tenant. This is wired but NOT verified
 * against a real tenant: app registration, redirect URL and tenant id await IT
 * approval (docs/DEPLOYMENT_GATES.md). Configuration is read lazily so a missing
 * value fails closed at request time instead of being guessed.
 */
export const { handlers, auth, signIn } = NextAuth(() => {
  const env = process.env;
  if (!env.AUTH_URL && env.APP_BASE_URL) env.AUTH_URL = `${env.APP_BASE_URL.replace(/\/$/, '')}/api/auth`;
  return {
    secret: env.AUTH_SECRET,
    session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
    pages: { signIn: '/signin', error: '/signin' },
    providers: [
      MicrosoftEntraID({
        clientId: env.AUTH_MICROSOFT_ENTRA_ID_ID,
        clientSecret: env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
        issuer: env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
        // Identity only: no Graph scope, no profile photo download.
        authorization: { params: { scope: 'openid profile email' } },
        profile: (profile) => ({ id: profile.sub, name: profile.name, email: profile.email ?? profile.preferred_username }),
      }),
    ],
    callbacks: {
      // Tenant allowlist: only the approved Entra tenant can sign in at all.
      signIn: ({ profile }) => Boolean(env.ALLOWED_TENANT_ID) && profile?.tid === env.ALLOWED_TENANT_ID,
      jwt: ({ token, profile }) => {
        if (profile) {
          token.tid = profile.tid;
          token.oid = profile.oid;
        }
        return token;
      },
      session: ({ session, token }) => ({ ...session, tid: token.tid, oid: token.oid }),
    },
  };
});
