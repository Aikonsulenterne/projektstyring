// URL helpers. The GitHub Pages demo is a static export, where a project page cannot
// be a dynamic path segment; it uses /projects/view?id=… instead (scripts/prepare-pages.mjs).

const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === '1';

export function projectHref(id: string): string {
  return STATIC_DEMO ? `/projects/view?id=${encodeURIComponent(id)}` : `/projects/${id}`;
}

export function isProjectRoute(pathname: string, search: URLSearchParams, id: string): boolean {
  if (STATIC_DEMO) return pathname.replace(/\/$/, '') === '/projects/view' && search.get('id') === id;
  return pathname === `/projects/${id}`;
}
