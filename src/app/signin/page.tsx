import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { GateScreen } from '@/components/shell/GateScreen';
import { getAppConfig } from '@/server/config';

export const metadata = { title: 'Log ind · teamspace.' };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection();
  const config = getAppConfig();
  if (config.mode === 'demo') redirect('/today');
  if (config.missing.length > 0) {
    return (
      <GateScreen title="Login er ikke sat op endnu">
        <p>Microsoft-login afventer godkendt app-registrering. Der er ingen midlertidig adgang uden login.</p>
      </GateScreen>
    );
  }
  const { error } = await searchParams;

  async function signInWithMicrosoft() {
    'use server';
    const { signIn } = await import('@/server/auth');
    await signIn('microsoft-entra-id', { redirectTo: '/today' });
  }

  return (
    <GateScreen title="Log ind">
      <p className="mb-5">Brug din arbejdskonto. Kun personer, der er tilføjet arbejdsrummet, får adgang.</p>
      {error ? (
        <p role="alert" className="mb-4 rounded-control bg-danger px-3 py-2 text-on-danger">
          {error === 'AccessDenied' ? 'Kontoen hører ikke til den godkendte organisation.' : 'Login mislykkedes. Prøv igen.'}
        </p>
      ) : null}
      <form action={signInWithMicrosoft}>
        <button type="submit" className="min-h-11 rounded-control bg-primary px-5 font-medium text-on-primary">
          Log ind med Microsoft
        </button>
      </form>
    </GateScreen>
  );
}
