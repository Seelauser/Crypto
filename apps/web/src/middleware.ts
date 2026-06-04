import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register', '/try', '/api/auth', '/api/billing/webhook', '/api/health'];
const PUBLIC_EXACT = ['/'];
const ONBOARDING_PATH = '/onboarding';

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Always allow public paths
  if (PUBLIC_EXACT.includes(pathname) || PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Unauthenticated: redirect to login
  if (!req.auth) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Allow onboarding
  if (pathname.startsWith(ONBOARDING_PATH)) {
    return NextResponse.next();
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
};
