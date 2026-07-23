import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Ignora percorsi API, file statici e immagini
  matcher: ['/', '/(it|en)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
