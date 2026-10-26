import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';
const httpsOnly = (process.env.APP_BASE_URL ?? '').startsWith('https://');

// No third-party origins: system fonts, local assets and same-origin API only.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  // Sign-in redirects to Microsoft; unverified until a real tenant is configured.
  "form-action 'self' https://login.microsoftonline.com",
  "frame-ancestors 'none'",
  ...(httpsOnly ? ['upgrade-insecure-requests'] : []),
].join('; ');

// GitHub Pages demo build (scripts/prepare-pages.mjs): static files only, served under
// /<repo>/, no response headers (Pages cannot set them), demo mode only.
const staticExport = process.env.STATIC_EXPORT === '1';

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(httpsOnly ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];

const nextConfig: NextConfig = staticExport
  ? {
      output: 'export',
      basePath: process.env.PAGES_BASE_PATH || undefined,
      trailingSlash: true,
      poweredByHeader: false,
      devIndicators: false,
      reactStrictMode: true,
    }
  : {
      // The container build sets NEXT_OUTPUT=standalone; local `next start` uses the default.
      output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
      poweredByHeader: false,
      devIndicators: false,
      reactStrictMode: true,
      async headers() {
        return [{ source: '/(.*)', headers: securityHeaders }];
      },
    };

export default nextConfig;
