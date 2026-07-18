// Small helpers: slug generation + text escaping used across functions.

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Very small "body text" -> HTML converter.
// Rules (documented for the admin in the UI):
//   - Blank line separates paragraphs
//   - A line starting with "## " becomes an <h2>
//   - A line starting with "> " becomes a <blockquote>
//   - "**bold**" -> <strong>, "*italic*" -> <em>
function bodyTextToHtml(raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  const lines = text.split('\n');
  const out = [];
  let para = [];
  const flush = () => {
    if (para.length) {
      out.push(`<p>${para.map(l => inline(l.trim())).join('<br>')}</p>`);
      para = [];
    }
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') { flush(); continue; }
    if (line.startsWith('## ')) { flush(); out.push(`<h2>${inline(line.slice(3).trim())}</h2>`); continue; }
    if (line.startsWith('> ')) { flush(); out.push(`<blockquote>${inline(line.slice(2).trim())}</blockquote>`); continue; }
    para.push(line);
  }
  flush();
  return out.join('\n\n        ');
}

function inline(s) {
  let out = escapeHtml(s);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
  return out;
}

module.exports = { slugify, escapeHtml, bodyTextToHtml, inline };
