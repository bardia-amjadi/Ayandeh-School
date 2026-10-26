export type PushCategory = 'announcements' | 'grades' | 'sessions' | 'tickets';

// Fixed, generic texts. No user content (grades, amounts, ticket text) is ever interpolated.
const TEXTS: Record<PushCategory, { title: string; body: string; url: string }> = {
  announcements: { title: 'مدرسه آینده', body: 'اطلاعیه جدیدی منتشر شد. برای مشاهده وارد برنامه شوید.', url: '/' },
  grades: { title: 'مدرسه آینده', body: 'اطلاعات جدیدی برای شما ثبت شد. برای مشاهده وارد شوید.', url: '/' },
  sessions: { title: 'مدرسه آینده', body: 'جلسه آنلاین جدیدی ثبت شد. برای مشاهده وارد برنامه شوید.', url: '/' },
  tickets: { title: 'مدرسه آینده', body: 'پاسخ جدیدی دریافت کرده‌اید. برای مشاهده وارد شوید.', url: '/' },
};
export const buildPayload = (c: PushCategory) => JSON.stringify({ ...TEXTS[c], tag: c });
