const { isAuthed } = require('../lib/auth');
const toolHtml = require('../lib/tool-html');

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hikvision Vs. — sign in</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#0B1119;font-family:'Inter',system-ui,sans-serif;color:#EAEFF4}
  .card{width:100%;max-width:360px;padding:36px 32px;background:#111A26;border:1px solid #22303F;border-radius:16px}
  .brand{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:22px;margin-bottom:6px}
  .brand .hk{color:#E4002B}
  .sub{font-size:12.5px;color:#8A95A3;margin-bottom:24px}
  input{width:100%;padding:12px 14px;border-radius:9px;border:1px solid #22303F;background:#0B1119;
    color:#EAEFF4;font-size:14px;margin-bottom:14px}
  input:focus{outline:none;border-color:#E4002B}
  button{width:100%;padding:12px;border-radius:9px;border:none;background:#E4002B;color:#fff;
    font-weight:600;font-size:14px;cursor:pointer}
  button:disabled{opacity:.6;cursor:default}
  .err{color:#FF6B6B;font-size:12.5px;margin:-6px 0 14px;min-height:16px}
</style>
</head>
<body>
  <div class="card">
    <div class="brand"><span class="hk">HIK</span>VISION VS.</div>
    <div class="sub">Team password required</div>
    <div class="err" id="err"></div>
    <input type="password" id="pw" placeholder="Password" autofocus>
    <button id="go" onclick="go()">Sign in</button>
  </div>
  <script>
    const pw = document.getElementById('pw'), err = document.getElementById('err'), go_ = document.getElementById('go');
    pw.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    async function go(){
      err.textContent = ''; go_.disabled = true; go_.textContent = 'Checking…';
      try{
        const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password: pw.value }) });
        if (res.ok) { location.reload(); return; }
        const out = await res.json().catch(()=>({}));
        err.textContent = out.error || 'Wrong password';
      }catch(e){ err.textContent = 'Could not reach the server'; }
      go_.disabled = false; go_.textContent = 'Sign in';
    }
  </script>
</body>
</html>`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isAuthed(req)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(LOGIN_HTML);
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(toolHtml);
};
