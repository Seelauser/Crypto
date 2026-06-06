import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register', '/try', '/api/auth', '/api/billing/webhook', '/api/health'];
const PUBLIC_EXACT = ['/'];

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

  // Authenticated route (including onboarding): mark the response private/
  // no-store so the browser won't bfcache a rendered snapshot of the logged-in
  // UI. Without this, clearing cookies and pressing Back/Forward can restore
  // an authenticated-looking page from memory without a fresh server check —
  // cosmetic (any real navigation or API call still bounces to /login), but
  // confusing on a shared machine.
  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
};
