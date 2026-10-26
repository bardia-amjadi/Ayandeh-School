import { ReactNode } from 'react';

export function State({ loading, error, empty, children }: { loading: boolean; error: string; empty?: boolean; children: ReactNode }) {
  if (loading) return <p className="muted" aria-live="polite">در حال بارگذاری…</p>;
  if (error) return <p role="alert" className="error">{error}</p>;
  if (empty) return <p className="muted">موردی برای نمایش وجود ندارد.</p>;
  return <>{children}</>;
}
export const Html = ({ html }: { html?: string }) => <div className="prose" dangerouslySetInnerHTML={{ __html: html ?? '' }} />; // HTML is sanitized server-side
export const Table = ({ head, children }: { head: string[]; children: ReactNode }) => (
  <div className="table-wrap"><table><thead><tr>{head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
);
export const Field = ({ label, children }: { label: string; children: ReactNode }) => <label>{label}{children}</label>;
