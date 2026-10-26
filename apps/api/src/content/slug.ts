export const RESERVED_SLUGS = new Set(['admin', 'app', 'reset-password', 'api', 'login', 'logout', 'blog', 'contact', 'about', 'assets', 'static', 'uploads', 'me', 'dashboard', 'health', 'sw.js', 'manifest.webmanifest']);
export function validateSlug(slug: string): string | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return 'نامک فقط شامل حروف کوچک لاتین، عدد و خط تیره باشد';
  if (RESERVED_SLUGS.has(slug)) return 'این نامک رزرو شده است';
  return null;
}
