import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

// Jalali (Persian calendar) via the browser's Intl; digits are Persian.
const dtf = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' });
const df = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeZone: 'Asia/Tehran' });
export const fmtDateTime = (v: string | Date) => dtf.format(new Date(v));
export const fmtDate = (v: string | Date) => df.format(new Date(v));
export const fmtNum = (v: string | number) => new Intl.NumberFormat('fa-IR').format(Number(v));
export const fmtMoney = (v: string | number) => `${fmtNum(v)} ریال`;
export const fmtMinutes = (m: number) => `${fmtNum(String(Math.floor(m / 60)).padStart(2, '0'))}:${fmtNum(String(m % 60).padStart(2, '0'))}`;
export const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(!!path);
  const reload = useCallback(() => {
    if (!path) return; setLoading(true); setError('');
    api<T>(path).then(setData).catch(e => setError((e as Error).message)).finally(() => setLoading(false));
  }, [path]);
  useEffect(reload, [reload]);
  return { data, error, loading, reload };
}
export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
