import { Link, useParams } from 'react-router-dom';
import { fmtDate, useFetch } from '../lib';
import { Html, State } from '../ui';

type PostSummary = { id: string; title: string; slug: string; publishedAt: string | null; category?: { title: string } | null };
type Setting = { html?: string; phone?: string; email?: string; address?: string };

export function Home() {
  const about = useFetch<Setting>('/public/settings/about'); const posts = useFetch<PostSummary[]>('/public/posts');
  return <article><h1>مدرسه آینده</h1>
    <State loading={about.loading} error="">{about.data?.html && <Html html={about.data.html} />}</State>
    <h2>آخرین اخبار</h2>
    <State loading={posts.loading} error={posts.error} empty={!posts.data?.length}><ul className="list">{posts.data?.slice(0, 5).map(p => <li key={p.id}><Link to={`/blog/${p.slug}`}>{p.title}</Link> <span className="muted">{p.publishedAt && fmtDate(p.publishedAt)}</span></li>)}</ul></State></article>;
}
export function About() { const s = useFetch<Setting>('/public/settings/about'); return <article><h1>درباره ما</h1><State loading={s.loading} error={s.error} empty={!s.data?.html}><Html html={s.data?.html} /></State></article>; }
export function Contact() {
  const s = useFetch<Setting>('/public/settings/contact');
  return <article><h1>تماس با ما</h1><State loading={s.loading} error={s.error} empty={!s.data}>
    <Html html={s.data?.html} />
    <dl className="kv">{s.data?.phone && <><dt>تلفن</dt><dd dir="ltr">{s.data.phone}</dd></>}{s.data?.email && <><dt>ایمیل</dt><dd dir="ltr">{s.data.email}</dd></>}{s.data?.address && <><dt>نشانی</dt><dd>{s.data.address}</dd></>}</dl></State></article>;
}
export function Blog() {
  const posts = useFetch<PostSummary[]>('/public/posts');
  return <article><h1>اخبار و مقالات</h1><State loading={posts.loading} error={posts.error} empty={!posts.data?.length}><ul className="list">{posts.data?.map(p => <li key={p.id}><Link to={`/blog/${p.slug}`}>{p.title}</Link> <span className="muted">{p.category?.title} {p.publishedAt && fmtDate(p.publishedAt)}</span></li>)}</ul></State></article>;
}
export function BlogPost() {
  const { slug } = useParams(); const p = useFetch<{ title: string; html: string; publishedAt: string | null; featuredUrl?: string | null }>(`/public/posts/${encodeURIComponent(slug ?? '')}`);
  return <article><State loading={p.loading} error={p.error ? 'مطلب یافت نشد' : ''}>{p.data && <><h1>{p.data.title}</h1>{p.data.featuredUrl && <img className="featured" alt="" src={p.data.featuredUrl} />}<p className="muted">{p.data.publishedAt && fmtDate(p.data.publishedAt)}</p><Html html={p.data.html} /></>}</State></article>;
}
// Catch-all: /rules etc. render published custom pages (slug is validated server-side against reserved routes).
export function CustomPage() {
  const { slug } = useParams(); const p = useFetch<{ title: string; html: string }>(`/public/pages/${encodeURIComponent(slug ?? '')}`);
  return <article><State loading={p.loading} error={p.error ? 'صفحه‌ای با این نشانی یافت نشد' : ''}>{p.data && <><h1>{p.data.title}</h1><Html html={p.data.html} /></>}</State></article>;
}
