const { getSession } = require('./_lib/auth');
const { getFile, listFolder, putFile } = require('./_lib/github');
const { slugify } = require('./_lib/slugify');
const T = require('./_lib/templates');

const CATEGORY_CFG = {
  publication: {
    folder: 'Publikasi',
    filePrefix: 'publications',
    listingPage: 'publications.html',
    listingAnchor: '<div class="pub-grid" id="pub-grid">',
  },
  project: {
    folder: 'Project',
    filePrefix: 'our-project',
    listingPage: 'our-project.html',
    listingAnchor: '<div class="proj-grid" id="proj-grid">',
  },
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}

async function uniqueFileName(folder, baseName) {
  const existing = await listFolder(folder);
  let candidate = `${baseName}.html`;
  let n = 2;
  while (existing.includes(candidate)) {
    candidate = `${baseName}-${n}.html`;
    n++;
  }
  return candidate;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const session = getSession(event);
  if (!session) return json(401, { error: 'Sesi tidak valid. Silakan login lagi.' });

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'JSON tidak valid.' });
  }

  const category = data.category;
  const cfg = CATEGORY_CFG[category];
  if (!cfg) return json(400, { error: 'Kategori harus "publication" atau "project".' });

  const missing = ['title', 'body', 'coverImage'].filter(k => !data[k] || String(data[k]).trim() === '');
  if (missing.length) return json(400, { error: `Field wajib belum diisi: ${missing.join(', ')}` });
  if (!/^data:image\//.test(data.coverImage)) return json(400, { error: 'Cover image harus berupa file gambar.' });

  const year = String(data.year || new Date().getFullYear()).replace(/[^0-9]/g, '') || String(new Date().getFullYear());
  const slug = slugify(data.title);
  if (!slug) return json(400, { error: 'Judul tidak menghasilkan slug yang valid.' });
  const baseName = `${cfg.filePrefix}-${year}-${slug}-post`;

  try {
    const fileName = await uniqueFileName(cfg.folder, baseName);
    const filePath = `${cfg.folder}/${fileName}`;
    const href = filePath; // root-relative, matches the site's existing link convention

    const templatePathEnv = category === 'publication' ? process.env.TEMPLATE_PUBLICATION_PATH : process.env.TEMPLATE_PROJECT_PATH;
    const templatePath = templatePathEnv || (category === 'publication'
      ? 'Publikasi/publications-2026-transjabodetabek-post.html'
      : 'Project/our-project-2025-bappenas-post.html');

    const reference = await getFile(templatePath);
    if (!reference) return json(500, { error: `File referensi template tidak ditemukan di repo: ${templatePath}` });

    const stakeholders = Array.isArray(data.stakeholders)
      ? data.stakeholders.filter(Boolean)
      : String(data.stakeholders || '').split(',').map(s => s.trim()).filter(Boolean);

    const dateLabel = data.dateLabel || year;

    const postData = { ...data, stakeholders, year, dateLabel };

    // 1) Build the new individual post page
    const postHtml = T.buildPostPage(reference.content, category, postData);

    // 2) Build & insert the card into the listing page (publications.html / our-project.html)
    const listing = await getFile(cfg.listingPage);
    if (!listing) return json(500, { error: `Halaman listing tidak ditemukan: ${cfg.listingPage}` });
    const cardData = { ...postData, href };
    const cardHtml = category === 'publication' ? T.renderPubListCard(cardData) : T.renderProjListCard(cardData);
    const newListing = T.insertAfterAnchor(listing.content, cfg.listingAnchor, cardHtml);

    // 3) Rotate the relevant "latest" teaser on the home page
    const index = await getFile('index.html');
    if (!index) return json(500, { error: 'index.html tidak ditemukan.' });
    const newIndex = category === 'publication'
      ? T.rotateHomePublications(index.content, cardData)
      : T.rotateHomeProjects(index.content, cardData);

    // 4) Commit all three files. Check for a pre-existing post file first (in
    //    case this is a retry after a partial previous failure).
    const existingPost = await getFile(filePath);
    const commitMsg = `Add ${category === 'publication' ? 'publication' : 'project'}: ${data.title} (by ${session.email})`;

    await putFile(filePath, postHtml, commitMsg, existingPost ? existingPost.sha : undefined);
    await putFile(cfg.listingPage, newListing, `${commitMsg} (update ${cfg.listingPage})`, listing.sha);
    await putFile('index.html', newIndex, `${commitMsg} (update index.html)`, index.sha);

    return json(200, {
      ok: true,
      path: filePath,
      listingPage: cfg.listingPage,
      message: 'Post berhasil dibuat dan akan tayang setelah proses deploy otomatis selesai (biasanya 1-2 menit).',
    });
  } catch (err) {
    return json(500, { error: err.message || String(err) });
  }
};
