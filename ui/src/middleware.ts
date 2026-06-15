import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const OSS_TOKEN_COOKIE = 'dograh_auth_token';

// Paths that don't require authentication in OSS mode
const PUBLIC_PATHS = ['/auth/login', '/auth/signup'];

// Only a SUCCESSFUL, non-local read is cached. Failures are never cached,
// so a transient backend outage can't permanently pin the UI to local/OSS.
let cachedAuthProvider: string | null = null;

async function fetchAuthProvider(): Promise<string> {
  if (cachedAuthProvider) {
    return cachedAuthProvider;
  }

  try {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';

    // Abort the health probe if the backend is slow/unreachable, so middleware
    // doesn't hang on every request during a backend hiccup.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${backendUrl}/api/v1/health`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const provider = (data.auth_provider as string) || 'local';
      // Cache ONLY on a successful read.
      cachedAuthProvider = provider;
      return provider;
    }

    console.warn(
      `[middleware] /health returned ${res.status}; treating as local for this request only`,
    );
  } catch (err) {
    // Backend not reachable — do NOT cache. Next request will retry.
    console.warn(
      `[middleware] could not reach backend /health (${String(err)}); treating as local for this request only`,
    );
  }

  // Fall back without caching, so the next request re-probes the backend.
  return 'local';
}

export async function middleware(request: NextRequest) {
  const authProvider = await fetchAuthProvider();

  // Only OSS (local) mode is gated here. In Stack mode, let everything through;
  // Stack handles auth on the client/route side.
  if (authProvider !== 'local') {
    return NextResponse.next();
  }

  const token = request.cookies.get(OSS_TOKEN_COOKIE)?.value;
  const { pathname } = request.nextUrl;

  // Allow public paths without auth
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // If no token, redirect to login
  if (!token) {
    const loginUrl = new URL('/auth/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Configure which routes the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};
