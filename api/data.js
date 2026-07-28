const { get, put } = require('@vercel/blob');
const { isAuthed } = require('../lib/auth');

const BLOB_PATH = 'hikvs/shared-data.json';

/* ---------------------------------------------------------------------------
 * Concurrency is handled with a plain integer revision stored *inside* the
 * JSON payload (_rev) — NOT Vercel Blob's native etag / ifMatch.
 *
 * Why: Blob's read etag (result.blob.etag) and its write-time ifMatch check
 * don't reliably agree (etag formatting/quoting differs, and private reads can
 * lag a write), so once data existed, every conditional save failed its
 * precondition and returned 409. The client would refetch the same
 * non-matching etag and loop until it gave up — the "someone else saved" /
 * "couldn't confirm the save" errors, with no one else actually saving.
 *
 * A revision we compute and compare ourselves is deterministic: GET, the
 * 409 response, and a successful PUT all speak the exact same value. The
 * client already treats the etag as an opaque string, so it needs no change —
 * the value is now just "0", "1", "2", …
 * ------------------------------------------------------------------------- */

async function readCurrent() {
  const result = await get(BLOB_PATH, { access: 'private' });
  if (!result) return { data: null, rev: 0 };
  const text = await new Response(result.stream).text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  const rev = data && typeof data._rev === 'number' ? data._rev : 0;
  return { data, rev };
}

module.exports = async (req, res) => {
  if (!isAuthed(req)) {
    res.status(401).json({ error: 'Not logged in' });
    return;
  }

  // Most common silent-failure cause: no Blob store connected yet, so no
  // read-write token. Say what to do instead of a generic 500 from the SDK.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const msg = 'No Blob store connected to this project — go to the Vercel dashboard → Storage tab → create/connect a Blob store, then redeploy.';
    console.error(msg);
    res.status(500).json({ error: msg });
    return;
  }

  if (req.method === 'GET') {
    try {
      const { data, rev } = await readCurrent();
      // etag is the revision as a string (null only when the store is empty).
      res.status(200).json({ data, etag: data ? String(rev) : null });
    } catch (err) {
      console.error('GET /api/data failed:', err && err.message, err && err.stack);
      res.status(500).json({ error: 'Could not load shared data: ' + (err && err.message) });
    }
    return;
  }

  if (req.method === 'PUT') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    if (!body || typeof body.data !== 'object') {
      res.status(400).json({ error: 'Missing data' });
      return;
    }

    try {
      const { data: currentData, rev: currentRev } = await readCurrent();
      const clientRev = body.etag != null ? parseInt(body.etag, 10) : null;
      const force = body.force === true;

      // Genuine-conflict check only: block when the client based its edit on an
      // OLDER revision than what's stored. This can never fire on a formatting
      // quirk (both sides are integers we control), so no phantom 409s. The
      // client refetches the current revision and retries, which now matches.
      if (
        currentData &&
        !force &&
        clientRev != null &&
        !Number.isNaN(clientRev) &&
        clientRev !== currentRev
      ) {
        res.status(409).json({ etag: String(currentRev) });
        return;
      }

      const nextRev = (currentData ? currentRev : 0) + 1;
      const toStore = Object.assign({}, body.data, { _rev: nextRev });

      await put(BLOB_PATH, JSON.stringify(toStore), {
        access: 'private',
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: 'application/json',
      });

      res.status(200).json({ etag: String(nextRev) });
    } catch (err) {
      console.error('PUT /api/data failed:', err && err.message, err && err.stack);
      res.status(500).json({ error: 'Could not save shared data: ' + (err && err.message) });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
