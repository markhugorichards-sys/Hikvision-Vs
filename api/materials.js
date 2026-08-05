const { get, put, del } = require('@vercel/blob');
const { isAuthed } = require('../lib/auth');

/* ---------------------------------------------------------------------------
 * Materials library — datasheets / brochures / flyers the team uploads and
 * tags to a category / vertical / product, so the right collateral can be
 * pulled into a customer pack.
 *
 * Same setup as /api/data: auth via ../lib/auth, storage via the project's
 * Vercel Blob store (access:'private', so files stay behind the login).
 *
 *   GET    /api/materials          -> { materials: [ …metadata ] }   (the index)
 *   GET    /api/materials?id=ID     -> streams the file for download
 *   POST   /api/materials          -> { filename, mime, dataBase64, type,
 *                                        category, section, sector, persona, productKey }  (upload)
 *   PUT    /api/materials          -> { id, type, category, section, sector, persona,
 *                                        productKey }  (edit tags — file itself untouched)
 *   DELETE /api/materials?id=ID     -> removes the file + its index entry
 *
 * A single JSON index (materials-index.json) holds the metadata; each file is
 * a separate private blob under hikvs/materials/<id>.
 * ------------------------------------------------------------------------- */

const INDEX_PATH = 'hikvs/materials-index.json';
const filePath = (id) => `hikvs/materials/${id}`;
const MAX_BYTES = 4 * 1024 * 1024; // ~4MB after base64 decode (front end caps uploads at 3MB)

function queryId(req) {
  if (req.query && req.query.id) return String(req.query.id);
  try {
    const u = new URL(req.url, 'http://x');
    return u.searchParams.get('id') || '';
  } catch { return ''; }
}

async function readIndex() {
  try {
    const result = await get(INDEX_PATH, { access: 'private' });
    if (!result) return [];
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.materials) ? parsed.materials : [];
  } catch {
    // no index yet (first use) or unreadable — start empty
    return [];
  }
}

async function writeIndex(materials) {
  await put(INDEX_PATH, JSON.stringify({ materials }), {
    access: 'private',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
  });
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// only the fields the front end needs — keep internal storage paths out of the list
function publicEntry(m) {
  return {
    id: m.id, filename: m.filename, mime: m.mime, type: m.type,
    category: m.category, section: m.section, sector: m.sector, persona: m.persona, productKey: m.productKey,
    size: m.size, uploadedAt: m.uploadedAt,
  };
}

module.exports = async (req, res) => {
  if (!isAuthed(req)) {
    res.status(401).json({ error: 'Not logged in' });
    return;
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const msg = 'No Blob store connected to this project — go to the Vercel dashboard → Storage tab → create/connect a Blob store, then redeploy.';
    console.error(msg);
    res.status(500).json({ error: msg });
    return;
  }

  try {
    // ---- GET: list, or download one file by id ----
    if (req.method === 'GET') {
      const id = queryId(req);
      const materials = await readIndex();

      if (!id) {
        res.status(200).json({ materials: materials.map(publicEntry) });
        return;
      }

      const entry = materials.find((m) => m.id === id);
      if (!entry) { res.status(404).json({ error: 'Material not found' }); return; }

      const result = await get(entry.path || filePath(id), { access: 'private' });
      if (!result) { res.status(404).json({ error: 'File missing from storage' }); return; }

      const buf = Buffer.from(await new Response(result.stream).arrayBuffer());
      res.setHeader('Content-Type', entry.mime || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(entry.filename || 'file')}"`);
      res.setHeader('Content-Length', String(buf.length));
      res.status(200);
      res.end(buf);
      return;
    }

    // ---- POST: upload a new file ----
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const { filename, mime, dataBase64, type, category, section, sector, persona, productKey } = body || {};

      if (!filename || !dataBase64) {
        res.status(400).json({ error: 'Missing filename or file data' });
        return;
      }

      let buffer;
      try { buffer = Buffer.from(dataBase64, 'base64'); }
      catch { res.status(400).json({ error: 'File data could not be decoded' }); return; }

      if (!buffer.length) { res.status(400).json({ error: 'File is empty' }); return; }
      if (buffer.length > MAX_BYTES) {
        res.status(413).json({ error: 'File too large — keep it under ~3MB.' });
        return;
      }

      const id = genId();
      const path = filePath(id);
      const blob = await put(path, buffer, {
        access: 'private',
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: mime || 'application/octet-stream',
      });

      const materials = await readIndex();
      materials.push({
        id,
        filename,
        mime: mime || 'application/octet-stream',
        type: type || '',
        category: category || '',
        sector: sector || '',
        section: section || '',
        persona: persona || '',
        productKey: productKey || '',
        size: buffer.length,
        path,
        url: blob.url,
        uploadedAt: new Date().toISOString(),
      });
      await writeIndex(materials);

      res.status(200).json({ ok: true, id });
      return;
    }

    // ---- PUT: edit an existing material's tags (type/category/section/sector/persona/productKey) ----
    // The file blob itself is never touched here — only the index entry's metadata changes.
    if (req.method === 'PUT') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const { id, type, category, section, sector, persona, productKey } = body || {};
      if (!id) { res.status(400).json({ error: 'Missing id' }); return; }

      const materials = await readIndex();
      const entry = materials.find((m) => m.id === id);
      if (!entry) { res.status(404).json({ error: 'Material not found' }); return; }

      entry.type = type || '';
      entry.category = category || '';
      entry.sector = sector || '';
      entry.section = section || '';
      entry.persona = persona || '';
      entry.productKey = productKey || '';

      await writeIndex(materials);
      res.status(200).json({ ok: true, material: publicEntry(entry) });
      return;
    }

    // ---- DELETE: remove a file by id ----
    if (req.method === 'DELETE') {
      const id = queryId(req);
      if (!id) { res.status(400).json({ error: 'Missing id' }); return; }

      let materials = await readIndex();
      const entry = materials.find((m) => m.id === id);
      if (entry) {
        try { await del(entry.url || entry.path || filePath(id)); }
        catch (e) { console.error('Blob delete failed (continuing to prune index):', e && e.message); }
        materials = materials.filter((m) => m.id !== id);
        await writeIndex(materials);
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(`${req.method} /api/materials failed:`, err && err.message, err && err.stack);
    res.status(500).json({ error: 'Materials request failed: ' + (err && err.message) });
  }
};
