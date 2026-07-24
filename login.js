const { get, put, BlobPreconditionFailedError } = require('@vercel/blob');
const { isAuthed } = require('../lib/auth');

const BLOB_PATH = 'hikvs/shared-data.json';

module.exports = async (req, res) => {
  if (!isAuthed(req)) {
    res.status(401).json({ error: 'Not logged in' });
    return;
  }

  // The single most common reason saves silently fail: no Blob store connected to the
  // project yet, so there's no read-write token available. Catch this up front with a
  // message that actually says what to do, instead of a generic 500 from deep in the SDK.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const msg = 'No Blob store connected to this project — go to the Vercel dashboard → Storage tab → create/connect a Blob store, then redeploy.';
    console.error(msg);
    res.status(500).json({ error: msg });
    return;
  }

  if (req.method === 'GET') {
    try {
      const result = await get(BLOB_PATH, { access: 'private' });
      if (!result) {
        res.status(200).json({ data: null, etag: null });
        return;
      }
      // result.stream is a native Web ReadableStream, not a Node stream — using the
      // Response API to consume it is the robust way, regardless of runtime version quirks
      // around Web Streams async-iteration support.
      const text = await new Response(result.stream).text();
      res.status(200).json({ data: JSON.parse(text), etag: result.blob.etag });
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
      const putOptions = {
        access: 'private',
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: 'application/json',
      };
      if (body.etag) putOptions.ifMatch = body.etag;
      const blob = await put(BLOB_PATH, JSON.stringify(body.data), putOptions);
      res.status(200).json({ etag: blob.etag });
    } catch (err) {
      // Use instanceof, not err.name — Vercel Blob's custom error classes don't set
      // .name to the class name at runtime (it stays "Error"), so a .name check alone
      // silently never matches. Keep the message-based check too as a defensive fallback.
      const isConflict = err instanceof BlobPreconditionFailedError
        || /precondition|etag|if-?match/i.test((err && err.message) || '');
      if (isConflict) {
        // someone else saved more recently — tell the client the current etag so it can retry
        try {
          const latest = await get(BLOB_PATH, { access: 'private' });
          res.status(409).json({ etag: latest ? latest.blob.etag : null });
        } catch {
          res.status(409).json({ etag: null });
        }
        return;
      }
      console.error('PUT /api/data failed:', err && err.message, err && err.stack);
      res.status(500).json({ error: 'Could not save shared data: ' + (err && err.message) });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
