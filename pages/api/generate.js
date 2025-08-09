import axios from 'axios'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { prompt } = req.body || {}

  await new Promise(r => setTimeout(r, 300))

  const escapedPrompt = String(prompt || '').replace(/</g, '&lt;').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

  const snippet = `// Generated snippet for prompt:\n// ${escapedPrompt}\n(function(){\n  const root = document.getElementById('root');\n  if (!root) return;\n  root.innerHTML = ${JSON.stringify(`<div style=\"font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial;padding:12px\"><h3>Generated preview</h3><p>${escapedPrompt}</p><div id=\\\"counter\\\">Count: 0</div><button id=\\\"inc\\\">Inc</button></div>`)};\n  let n = 0;\n  const btn = document.getElementById('inc');\n  if (btn) btn.addEventListener('click', function(){ n++; const c = document.getElementById('counter'); if (c) c.textContent = 'Count: ' + n; });\n})();`

  return res.status(200).json({ code: snippet })
}
