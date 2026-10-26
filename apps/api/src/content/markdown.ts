import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

// Markdown -> HTML with a strict allow-list. Raw HTML in the source is escaped, not trusted.
const renderer = new marked.Renderer();
renderer.html = ({ text }) => sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} }); // drop raw HTML tags

export function renderMarkdown(md: string): string {
  const html = marked.parse(md.slice(0, 200_000), { async: false, gfm: true, breaks: false, renderer }) as string;
  return sanitizeHtml(html, {
    allowedTags: ['h1','h2','h3','h4','h5','h6','p','br','hr','ul','ol','li','blockquote','pre','code','em','strong','del','a','img','table','thead','tbody','tr','th','td'],
    allowedAttributes: { a: ['href', 'title', 'rel', 'target'], img: ['src', 'alt', 'title'], code: ['class'], th: ['align'], td: ['align'] },
    allowedClasses: { code: [/^language-[a-z0-9_-]+$/i] },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    transformTags: { a: (tag, attribs) => ({ tagName: 'a', attribs: { ...attribs, rel: 'noopener noreferrer nofollow', target: '_blank' } }) },
  });
}
