const { clearEditorCookie } = require('../lib/auth');

// Re-locks editing without a full logout — used when someone hides the admin
// tools again (gear icon / 5-click), so the server-side permission actually
// drops too, not just the UI.
module.exports = async (req, res) => {
  clearEditorCookie(res);
  res.status(200).json({ ok: true });
};
