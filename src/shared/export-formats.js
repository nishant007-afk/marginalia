'use strict';

/* UMD: usable from Electron (CommonJS) and from the browser (window.ExportFormats). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ExportFormats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CATEGORIES =
    typeof window !== 'undefined' && window.MARGINALIA_CATEGORIES
      ? window.MARGINALIA_CATEGORIES
      : require('./categories.json');

  function labelOf(cat) {
    return (CATEGORIES[cat] && CATEGORIES[cat].label) || cat || 'Note';
  }

  function fmt(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString();
    } catch (_) {
      return iso;
    }
  }

  function metaLines(n) {
    const parts = [];
    if (n.book) parts.push(`Book: ${n.book}`);
    if (n.author) parts.push(`Author: ${n.author}`);
    if (n.page) parts.push(`Page: ${n.page}`);
    if (n.date) parts.push(`Date: ${n.date}`);
    if (Array.isArray(n.tags) && n.tags.length) parts.push(`Tags: ${n.tags.join(', ')}`);
    return parts;
  }

  function buildText(notes) {
    return notes
      .map((n) => {
        const head = n.title ? `${n.title} · ${labelOf(n.category)}` : labelOf(n.category);
        const lines = [head, '='.repeat(head.length), '', n.content || '(empty)'];
        const meta = metaLines(n);
        if (meta.length) lines.push('', ...meta);
        lines.push('', `Created: ${fmt(n.createdAt)}  ·  Modified: ${fmt(n.updatedAt)}`, '');
        return lines.join('\n');
      })
      .join(`\n${'-'.repeat(44)}\n\n`);
  }

  function buildMarkdown(notes) {
    return (
      notes
        .map((n) => {
          const lines = [`# ${n.title || labelOf(n.category)}`, '', `*${labelOf(n.category)}*`, '', n.content || ''];
          const meta = metaLines(n);
          if (meta.length) lines.push('', ...meta.map((m) => `- ${m}`));
          lines.push('', `_Created: ${fmt(n.createdAt)} · Modified: ${fmt(n.updatedAt)}_`);
          return lines.join('\n');
        })
        .join('\n\n---\n\n') + '\n'
    );
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildPdfHtml(notes) {
    const sections = notes
      .map((n) => {
        const paras = String(n.content)
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => `<p>${esc(l)}</p>`)
          .join('');
        const meta = metaLines(n)
          .map((m) => `<li>${esc(m)}</li>`)
          .join('');
        return `<section>
        <h1>${esc(n.title || labelOf(n.category))}</h1>
        <p class="cat">${esc(labelOf(n.category))}${n.date ? ` · ${esc(n.date)}` : ''}</p>
        <div class="content">${paras || '<p class="empty">(empty)</p>'}</div>
        ${meta ? `<ul class="meta">${meta}</ul>` : ''}
        <p class="stamp">Created ${esc(fmt(n.createdAt))} · Modified ${esc(fmt(n.updatedAt))}</p>
      </section>`;
      })
      .join('');
    return `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'"><title>Marginalia</title><style>
  @page { margin: 18mm 16mm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1d1b16; line-height: 1.55; font-size: 12pt; }
  section { margin-bottom: 26px; page-break-inside: avoid; border-bottom: 1px solid #e2ddd2; padding-bottom: 18px; }
  h1 { font-size: 17pt; margin: 0 0 2px 0; }
  .cat { color: #8a7a58; font-style: italic; margin: 0 0 10px 0; font-size: 10.5pt; }
  .content p { margin: 6px 0; white-space: pre-wrap; }
  ul.meta { color: #55503f; font-size: 9.5pt; margin: 10px 0 0 0; padding-left: 16px; }
  .stamp { color: #a49c86; font-size: 8.5pt; margin-top: 12px; }
  .empty { color: #b8b0a0; font-style: italic; }
</style></head><body>${sections}</body></html>`;
  }

  return { labelOf, fmt, metaLines, buildText, buildMarkdown, buildPdfHtml, esc };
});
