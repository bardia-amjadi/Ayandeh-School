export interface UploadSettings { maxMb: number; allowedExts: string[]; }
export const ALL_EXTS = ['pdf', 'png', 'jpg', 'gif', 'webp', 'zip', 'mp4', 'mp3'] as const;
export const HARD_MAX_MB = Number(process.env.MAX_UPLOAD_MB ?? 50); // ceiling set at deploy time; runtime setting can only lower it

/** Merges a stored (untrusted-shaped) value with defaults, clamped to the ceiling and known extensions. */
export function normalizeUploadSettings(v: unknown): UploadSettings {
  const o = (v && typeof v === 'object' ? v : {}) as { maxMb?: unknown; allowedExts?: unknown };
  const maxMb = typeof o.maxMb === 'number' && o.maxMb > 0 ? Math.min(o.maxMb, HARD_MAX_MB) : HARD_MAX_MB;
  const exts = Array.isArray(o.allowedExts) ? o.allowedExts.filter((e): e is string => typeof e === 'string' && (ALL_EXTS as readonly string[]).includes(e)) : [...ALL_EXTS];
  return { maxMb, allowedExts: exts.length ? exts : [...ALL_EXTS] };
}
