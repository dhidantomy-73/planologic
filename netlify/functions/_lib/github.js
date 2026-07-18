// Thin wrapper around the GitHub Contents API used to read/write files in
// the site's repo so that a push to the configured branch triggers a
// Netlify (or Vercel/Cloudflare Pages) rebuild & redeploy.
//
// Required env vars:
//   GITHUB_TOKEN  - a fine-grained or classic PAT with "Contents: read & write"
//                   access to the repo (classic PAT needs the "repo" scope).
//   GITHUB_REPO   - "owner/repo-name"
//   GITHUB_BRANCH - branch to commit to (defaults to "main")

const API = 'https://api.github.com';

function cfg() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token) throw new Error('GITHUB_TOKEN environment variable is not set');
  if (!repo) throw new Error('GITHUB_REPO environment variable is not set (expected "owner/repo")');
  return { token, repo, branch };
}

async function ghFetch(path, options = {}) {
  const { token } = cfg();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'planologic-admin-panel',
      ...(options.headers || {}),
    },
  });
  return res;
}

// Fetch a file's current content + sha (needed to update it). Returns
// { content: string, sha: string } or null if the file does not exist yet.
async function getFile(filePath) {
  const { repo, branch } = cfg();
  const res = await ghFetch(`/repos/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub getFile(${filePath}) failed: ${res.status} ${body}`);
  }
  const json = await res.json();
  const content = Buffer.from(json.content, json.encoding || 'base64').toString('utf8');
  return { content, sha: json.sha };
}

// List files in a folder (used to check slug uniqueness). Returns an array
// of filenames, or [] if the folder does not exist.
async function listFolder(folderPath) {
  const { repo, branch } = cfg();
  const res = await ghFetch(`/repos/${repo}/contents/${encodeURIComponent(folderPath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`);
  if (res.status === 404) return [];
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub listFolder(${folderPath}) failed: ${res.status} ${body}`);
  }
  const json = await res.json();
  if (!Array.isArray(json)) return [];
  return json.map(f => f.name);
}

// Create or update a file. `sha` must be passed (from getFile) when updating
// an existing file; omit it when creating a new one.
async function putFile(filePath, content, message, sha) {
  const { repo, branch } = cfg();
  const body = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch,
  };
  if (sha) body.sha = sha;
  const res = await ghFetch(`/repos/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`GitHub putFile(${filePath}) failed: ${res.status} ${errBody}`);
  }
  return res.json();
}

module.exports = { getFile, listFolder, putFile, cfg };
