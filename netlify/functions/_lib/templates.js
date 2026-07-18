// Generates a new post page by cloning an existing, real post page from the
// site (so all shared CSS/header/footer/scripts stay byte-identical to the
// live site) and surgically swapping the content-specific regions. Also
// builds the small HTML "card" snippets used on the listing pages
// (publications.html / our-project.html) and the home page teasers.

const { escapeHtml, bodyTextToHtml } = require('./slugify');

// ---------- generic balanced <div> block helpers ----------

function extractBalanced(html, startIndex) {
  const tagRe = /<div\b[^>]*>|<\/div>/gi;
  tagRe.lastIndex = startIndex;
  let depth = 0, end = -1, m;
  while ((m = tagRe.exec(html))) {
    if (m[0].toLowerCase() === '</div>') {
      depth--;
      if (depth === 0) { end = tagRe.lastIndex; break; }
    } else {
      depth++;
    }
  }
  if (end === -1) return null;
  return { start: startIndex, end, html: html.slice(startIndex, end) };
}

function findBalanced(html, openTagLiteral, fromIndex = 0) {
  const idx = html.indexOf(openTagLiteral, fromIndex);
  if (idx === -1) return null;
  return extractBalanced(html, idx);
}

function findAllBalanced(html, openTagLiteral) {
  const blocks = [];
  let from = 0;
  while (true) {
    const block = findBalanced(html, openTagLiteral, from);
    if (!block) break;
    blocks.push(block);
    from = block.end;
  }
  return blocks;
}

function replaceRange(html, start, end, replacement) {
  return html.slice(0, start) + replacement + html.slice(end);
}

// ---------- category labels ----------

const PUB_TYPE_LABEL = { research: 'Research', deck: 'Policy Deck', article: 'Article' };
const PUB_TYPE_CARD_TAG = { research: 'Research', deck: 'Policy Brief', article: 'Essay' };
const PUB_TYPE_FEATURE_TAG = { research: 'Featured Research', deck: 'Featured Report', article: 'Featured Story' };

const PROJ_CAT_LABEL = {
  advisory: 'Advisory', research: 'Research', community: 'Community',
  learning: 'Learning', discussion: 'Discussion', media: 'Media',
};

// ---------- individual post page (clone + edit) ----------

function buildPostPage(referenceHtml, category, data) {
  let html = referenceHtml;

  // 1) <title>
  html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(data.title)} — Planologic</title>`);

  // 2) post cover image + credit tip
  html = html.replace(
    /(<div class="post-cover">\s*<img src=")[^"]*(" alt=")[^"]*(">)/,
    (_m, a, b, c) => `${a}${data.coverImage}${b}${escapeHtml(data.coverAlt)}${c}`
  );
  html = html.replace(
    /(<div class="post-cover">[\s\S]*?<div class="credit"[^>]*>i<span class="tip">)[\s\S]*?(<\/span>)/,
    (_m, a, b) => `${a}${escapeHtml(data.photoCredit || 'Planologic documentation')}${b}`
  );

  // 3) post category label (constant "Publikasi" for publications, admin-chosen type label for projects)
  const postCatLabel = category === 'publication' ? 'Publikasi' : (PROJ_CAT_LABEL[data.projCat] || 'Project');
  html = html.replace(
    /(<div class="post-cat"><span class="dot"><\/span>)[^<]*(<\/div>)/,
    (_m, a, b) => `${a}${escapeHtml(postCatLabel)}${b}`
  );

  // 4) title (h1.post-title)
  html = html.replace(
    /(<h1 class="post-title">)[\s\S]*?(<\/h1>)/,
    (_m, a, b) => `${a}${escapeHtml(data.title)}${b}`
  );

  // 5) lede
  html = html.replace(
    /(<p class="post-lede">)[\s\S]*?(<\/p>)/,
    (_m, a, b) => `${a}${escapeHtml(data.lede || data.excerpt)}${b}`
  );

  // 6) article body (prose)
  const bodyHtml = bodyTextToHtml(data.body);
  html = html.replace(
    /<article class="prose">[\s\S]*?<\/article>/,
    () => `<article class="prose">\n        ${bodyHtml}\n      </article>`
  );

  // 7) sidebar info rows + access link (everything between the side-title
  //    close tag and the start of the "warm" (Prepared by) card)
  const rows = [];
  if (data.city) rows.push(`<div class="info-row"><div class="k">City</div><div class="v">${escapeHtml(data.city)}</div></div>`);
  if (data.year) rows.push(`<div class="info-row"><div class="k">Year</div><div class="v">${escapeHtml(data.year)}</div></div>`);
  const typeOfWork = category === 'publication' ? (PUB_TYPE_LABEL[data.pubType] || data.pubType) : (PROJ_CAT_LABEL[data.projCat] || data.projCat);
  if (typeOfWork) rows.push(`<div class="info-row"><div class="k">Type of work</div><div class="v">${escapeHtml(typeOfWork)}</div></div>`);
  if (data.topic) rows.push(`<div class="info-row"><div class="k">Topic</div><div class="v">${escapeHtml(data.topic)}</div></div>`);
  if (data.stakeholders && data.stakeholders.length) {
    const chips = data.stakeholders.map(s => `<span>${escapeHtml(s)}</span>`).join('');
    rows.push(`<div class="info-row">\n            <div class="k">Stakeholders</div>\n            <div class="chips">\n              ${chips}\n            </div>\n          </div>`);
  }
  const accessLabel = data.accessLabel || (category === 'publication' ? 'Akses Kajian' : 'Download report');
  const accessLink = data.accessUrl
    ? `<a class="btn-dl-side" href="${escapeHtml(data.accessUrl)}" target="_blank" rel="noopener">\n            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>\n            ${escapeHtml(accessLabel)}\n          </a>`
    : '';
  const sideTitle = category === 'publication' ? 'Publication details' : 'Project details';

  html = html.replace(
    /(<div class="side-title">)[^<]*(<\/div>)[\s\S]*(<div class="side-card warm">)/,
    (_m, a, b, warmDiv) => `${a}${escapeHtml(sideTitle)}${b}\n          ${rows.join('\n          ')}\n          ${accessLink}\n        </div>\n\n        ${warmDiv}`
  );

  // 8) authors ("Prepared by")
  const authors = (data.authors && data.authors.length ? data.authors : [{ name: 'Planologic Team', role: 'Contributor', linkedin: '', avatar: '' }]);
  const authorBlocks = authors.map((au, i) => {
    const avatarImg = au.avatar
      ? `<img src="${au.avatar}" alt="${escapeHtml(au.name)}">`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#e8eaee;color:#5b6472;font-family:var(--serif);font-weight:600;">${escapeHtml((au.name || '?').trim().charAt(0).toUpperCase())}</div>`;
    const li = au.linkedin
      ? `\n              <a class="li" href="${escapeHtml(au.linkedin)}" target="_blank" rel="noopener">\n                <svg viewBox="0 0 24 24"><path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8.5h4V23h-4V8.5zM8.5 8.5h3.83v1.98h.05c.53-1 1.84-2.06 3.79-2.06 4.05 0 4.8 2.67 4.8 6.14V23h-4v-6.62c0-1.58-.03-3.6-2.2-3.6-2.2 0-2.54 1.72-2.54 3.5V23h-4V8.5z"/></svg>\n                LinkedIn\n              </a>`
      : '';
    const marginStyle = i < authors.length - 1
      ? ' style="margin-bottom:18px; padding-bottom:18px; border-bottom:1px solid rgba(53,64,81,0.08);"'
      : '';
    return `<div class="author"${marginStyle}>\n            <div class="ava">${avatarImg}</div>\n            <div class="who">\n              <div class="name">${escapeHtml(au.name)}</div>\n              <div class="role">${escapeHtml(au.role || '')}</div>${li}\n            </div>\n          </div>`;
  }).join('\n          ');

  html = html.replace(
    /(<div class="side-title">Prepared by<\/div>)[\s\S]*?(<\/aside>)/,
    (_m, a, b) => `${a}\n          ${authorBlocks}\n        </div>\n      ${b}`
  );

  return html;
}

// ---------- listing page cards (publications.html / our-project.html) ----------

function renderPubListCard(data) {
  const typeLabel = PUB_TYPE_LABEL[data.pubType] || 'Article';
  const pdf = data.pdfUrl
    ? `\n            <a class="pub-dl" href="${escapeHtml(data.pdfUrl)}" download>\n              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>\n              Download PDF\n            </a>`
    : '';
  return `      <article class="pub-card" data-type="${data.pubType}">
        <div class="pub-cover"><span class="pub-type">${typeLabel}</span><img src="${data.coverImage}" alt="${escapeHtml(data.coverAlt)}"></div>
        <div class="pub-body">
          <div class="pub-date">${escapeHtml(data.dateLabel)}</div>
          <h3><a href="${data.href}">${escapeHtml(data.title)}</a></h3>
          <p>${escapeHtml(data.excerpt)}</p>
          <div class="pub-foot">
            <a class="pub-read" href="${data.href}">
              Read Article
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
            </a>${pdf}
          </div>
        </div>
      </article>\n`;
}

function renderProjListCard(data) {
  const catLabel = PROJ_CAT_LABEL[data.projCat] || 'Project';
  return `      <article class="proj-card" data-cat="${data.projCat}">
        <div class="proj-thumb"><span class="proj-cat">${catLabel}</span><img src="${data.coverImage}" alt="${escapeHtml(data.coverAlt)}"></div>
        <a class="proj-body" href="${data.href}">
          <div class="proj-loc"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>${escapeHtml(data.location)}</div>
          <h3>${escapeHtml(data.title)}</h3>
          <p>${escapeHtml(data.excerpt)}</p>
          <div class="proj-year"><span>${escapeHtml(data.dateLabel)}</span><span class="arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg></span></div>
        </a>
      </article>\n`;
}

function insertAfterAnchor(html, anchorLiteral, snippet) {
  const idx = html.indexOf(anchorLiteral);
  if (idx === -1) throw new Error(`Anchor not found in listing page: ${anchorLiteral}`);
  const insertAt = idx + anchorLiteral.length;
  return html.slice(0, insertAt) + '\n' + snippet + html.slice(insertAt);
}

// ---------- home page teasers ----------

function parseResearchFeature(blockHtml) {
  const img = /<div class="img-wrap"><img src="([^"]*)" alt="([^"]*)">/.exec(blockHtml);
  const href = /<a class="content" href="([^"]*)">/.exec(blockHtml);
  const tag = /<span class="tag-pill">([^<]*)<\/span>/.exec(blockHtml);
  const title = /<h3>([\s\S]*?)<\/h3>/.exec(blockHtml);
  const date = /<div class="research-meta"><span>([^<]*)<\/span>/.exec(blockHtml);
  const tip = /<div class="credit"[^>]*>i<span class="tip">([\s\S]*?)<\/span>/.exec(blockHtml);
  return {
    imgSrc: img ? img[1] : '',
    imgAlt: img ? img[2] : '',
    href: href ? href[1] : '#',
    tagPill: tag ? tag[1] : 'Research',
    title: title ? title[1] : '',
    dateLabel: date ? date[1] : '',
    creditTip: tip ? tip[1] : 'Planologic documentation',
  };
}

function renderResearchFeature(d) {
  return `      <div class="research-feature">
        <div class="img-wrap"><img src="${d.imgSrc}" alt="${escapeHtml(d.imgAlt)}"></div>
        <a class="content" href="${d.href}">
          <span class="tag-pill">${escapeHtml(d.tagPill)}</span>
          <h3>${escapeHtml(d.title)}</h3>
          <p>${escapeHtml(d.excerpt || '')}</p>
          <div class="research-meta"><span>${escapeHtml(d.dateLabel)}</span><span>·</span><span>Read more</span></div>
        </a>
        <div class="credit" tabindex="0">i<span class="tip">${d.creditTip}</span></div>
      </div>\n`;
}

function renderResearchCard(d) {
  return `        <div class="research-card">
          <div class="rc-thumb"><img src="${d.imgSrc}" alt="${escapeHtml(d.imgAlt)}"><div class="credit" tabindex="0">i<span class="tip">${d.creditTip}</span></div></div>
          <a class="rc-text" href="${d.href}"><span class="tag-pill">${escapeHtml(d.tagPill)}</span><h4>${escapeHtml(d.title)}</h4><div class="meta">${escapeHtml(d.dateLabel)} · Read more</div></a>
        </div>\n`;
}

function renderActivityCard(d) {
  return `      <div class="activity-card">
        <div class="activity-img"><img src="${d.coverImage}" alt="${escapeHtml(d.coverAlt)}"><div class="credit" tabindex="0">i<span class="tip">${escapeHtml(d.photoCredit || 'Planologic documentation')}</span></div></div>
        <a class="activity-body" href="${d.href}"><div class="activity-loc">${escapeHtml(d.location)}</div><h4>${escapeHtml(d.title)}</h4><p>${escapeHtml(d.excerpt)}</p></a>
      </div>\n`;
}

// Rebuilds the "Latest Research" teaser on the home page: the new post
// becomes the big feature, the old feature is demoted into the first small
// card, the two remaining old cards shift down one slot, and the previous
// 3rd card is dropped (it's still on publications.html, just not featured
// on the home page anymore).
function rotateHomePublications(indexHtml, data) {
  const gridBlock = findBalanced(indexHtml, '<div class="research-grid">');
  if (!gridBlock) throw new Error('Could not find .research-grid on the home page');
  const inner = gridBlock.html;

  const featureBlock = findBalanced(inner, '<div class="research-feature">');
  if (!featureBlock) throw new Error('Could not find .research-feature inside .research-grid');
  const oldFeatureData = parseResearchFeature(featureBlock.html);

  const oldCards = findAllBalanced(inner, '<div class="research-card">');
  const keepCards = oldCards.slice(0, 2).map(b => b.html); // keep first 2, drop the 3rd

  const newFeature = renderResearchFeature({
    imgSrc: data.coverImage,
    imgAlt: data.coverAlt,
    href: data.href,
    tagPill: PUB_TYPE_FEATURE_TAG[data.pubType] || 'Featured Research',
    title: data.title,
    excerpt: data.excerpt,
    dateLabel: data.dateLabel,
    creditTip: escapeHtml(data.photoCredit || 'Planologic documentation'),
  });

  const demotedOldFeatureAsCard = renderResearchCard({
    ...oldFeatureData,
    tagPill: PUB_TYPE_CARD_TAG[data.pubType] ? oldFeatureData.tagPill.replace(/^Featured\s+/, '') : oldFeatureData.tagPill,
  });

  const newInner = `<div class="research-grid">\n${newFeature}      <div class="research-side">\n${demotedOldFeatureAsCard}${keepCards.join('')}      </div>\n    </div>`;

  return replaceRange(indexHtml, gridBlock.start, gridBlock.end, newInner);
}

// Rebuilds the "Latest Activities" teaser: prepend the new project as an
// activity-card and keep the first 3 of the previous 4 (drop the 4th).
function rotateHomeProjects(indexHtml, data) {
  const gridBlock = findBalanced(indexHtml, '<div class="activity-grid">');
  if (!gridBlock) throw new Error('Could not find .activity-grid on the home page');
  const inner = gridBlock.html;

  const oldCards = findAllBalanced(inner, '<div class="activity-card">');
  const keepCards = oldCards.slice(0, 3).map(b => b.html);

  const newCard = renderActivityCard(data);

  const newInner = `<div class="activity-grid">\n${newCard}${keepCards.join('')}    </div>`;

  return replaceRange(indexHtml, gridBlock.start, gridBlock.end, newInner);
}

module.exports = {
  buildPostPage,
  renderPubListCard,
  renderProjListCard,
  insertAfterAnchor,
  rotateHomePublications,
  rotateHomeProjects,
  PUB_TYPE_LABEL,
  PROJ_CAT_LABEL,
};
