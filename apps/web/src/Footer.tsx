// Centralised CloudPixel attribution (text + URL configurable in one place).
export const ATTRIBUTION = { text: 'قدرت‌یافته با CloudPixel', href: 'https://cloudpix.ir' };
export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-main">مدرسه آینده</div>
      <div className="attribution"><a href={ATTRIBUTION.href} target="_blank" rel="noopener noreferrer">{ATTRIBUTION.text}</a></div>
    </footer>
  );
}
