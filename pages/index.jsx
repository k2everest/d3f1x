import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import axios from 'axios'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

export default function Home() {
  const initialCode = `// Manual preview snippet
const root = document.getElementById('root');
if (root) root.innerHTML = '<div style="padding:16px;font-family:system-ui,Arial"><h3>Manual preview</h3><p>Edit the code or press a test button.</p></div>';`
  const [code, setCode] = useState(initialCode)
  const [prompt, setPrompt] = useState('Create a simple counter that increments on button click')
  const [loading, setLoading] = useState(false)
  const [parentValidationError, setParentValidationError] = useState(null)
  const iframeRef = useRef(null)
  const previewUrlRef = useRef(null)

  useEffect(() => { updatePreview(code); return cleanupUrls }, [])

  function cleanupUrls() {
    if (previewUrlRef.current) { try { URL.revokeObjectURL(previewUrlRef.current) } catch(e){} previewUrlRef.current = null }
  }

  function makeRunnerPage() {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root">Waiting for code...</div><script>
(function(){
  const root = document.getElementById('root');
  function displayError(msg){ if (root) root.innerText = 'Preview error: ' + msg }
  window.addEventListener('message', function(ev){
    try {
      if (!ev.data || typeof ev.data.userCode !== 'string') return;
      const code = ev.data.userCode;
      try {
        if (root) root.innerHTML = '';
        (0,eval)(code);
      } catch (err) {
        console.error('User code execution error', err);
        displayError(err && err.message ? err.message : String(err));
      }
    } catch (err) {
      displayError(err && err.message ? err.message : String(err));
    }
  });
  try { window.parent.postMessage({ previewReady: true }, '*') } catch(e){}
})();
</script></body></html>`
  }

  function updatePreview(source) {
    try {
      cleanupUrls()
      setParentValidationError(null)

      const s = String(source || '')
      const trimmed = s.trim()
      const looksLikeHtml = trimmed.startsWith('<') || /<!doctype|<html/i.test(trimmed)

      if (looksLikeHtml) {
  const html = trimmed.startsWith('<!') || /<html/i.test(trimmed)
    ? trimmed
    : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${trimmed}</body></html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  previewUrlRef.current = url
  if (iframeRef.current) iframeRef.current.src = url
  return
}


      let validationError = null
      try {
        new Function(s)
      } catch (err) {
        validationError = err
      }

      const runnerHtml = makeRunnerPage()
      const blob = new Blob([runnerHtml], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      previewUrlRef.current = url

      if (!iframeRef.current) return

      function onMessageFromIframe(ev) {
        if (!ev || !ev.data) return
        if (ev.data.previewReady) {
          try {
            if (validationError) {
              const msg = String(validationError && validationError.message ? validationError.message : 'Invalid code')
              setParentValidationError(msg)
              const errorSnippet = \`// Validation failed in parent: \${JSON.stringify(msg)}
(function(){
  const root = document.getElementById('root');
  if (root) root.innerText = 'Preview error (invalid JS): ${msg.replace(/'/g, "\\\'")}';
})();\`
              iframeRef.current.contentWindow.postMessage({ userCode: errorSnippet }, '*')
            } else {
              iframeRef.current.contentWindow.postMessage({ userCode: String(s) }, '*')
            }
          } catch (e) {
            console.error('postMessage error', e)
            const failHtml = \`<!doctype html><html><body><div>Preview error: could not deliver code to runner</div></body></html>\`
            const failBlob = new Blob([failHtml], { type: 'text/html' })
            const failUrl = URL.createObjectURL(failBlob)
            if (iframeRef.current) iframeRef.current.src = failUrl
          }
          window.removeEventListener('message', onMessageFromIframe)
        }
      }

      window.addEventListener('message', onMessageFromIframe)
      iframeRef.current.onload = () => { }
      iframeRef.current.src = url
    } catch (err) {
      console.error('updatePreview error', err)
      alert('Erro ao atualizar preview: ' + (err && err.message ? err.message : err))
    }
  }

  async function handleGenerate() {
    setLoading(true)
    try {
      const resp = await axios.post('/api/generate', { prompt })
      const generated = resp.data.code || '// no code returned'
      setCode(generated)
      updatePreview(generated)
    } catch (err) {
      console.error(err)
      alert('Erro ao gerar: ' + (err.message || err))
    } finally { setLoading(false) }
  }

  function loadTestPayload(type) {
    switch (type) {
      case 'leading-slash': {
        const p = '/this/is/not/valid/js();'
        setCode(p)
        updatePreview(p)
        break
      }
      case 'regex-literal': {
        const p = 'const r = /abc/i; document.getElementById(\'root\').innerText = String(r.test(\'abc\'));'
        setCode(p)
        updatePreview(p)
        break
      }
      case 'contains-script': {
        const htmlFrag = \`<div>Fragment with </script> inside — should be handled as HTML fragment</div>\`
        setCode(htmlFrag)
        updatePreview(htmlFrag)
        break
      }
      case 'backticks': {
        const withTemplate = "const name = \`User\`; document.getElementById('root').innerHTML = \`<p>Hello \${'${name}'}<\/p>\`;"
        setCode(withTemplate)
        updatePreview(withTemplate)
        break
      }
      case 'long-unicode': {
        const long = 'document.getElementById(\'root\').innerText = "Unicode: ' + String.fromCharCode(0x1F600) + '";'
        setCode(long)
        updatePreview(long)
        break
      }
      default: {
        const example = \`const root = document.getElementById('root');\nif (root) root.innerHTML = '<div style="padding:12px;font-family:system-ui,Arial"><h3>Example: Counter</h3><div id="counter">Count: 0</div><button id="inc">Inc</button></div>';
let n = 0; const btn = document.getElementById('inc'); if (btn) btn.addEventListener('click', () => { n++; const c = document.getElementById('counter'); if (c) c.textContent = 'Count: ' + n; });\`
        setCode(example)
        updatePreview(example)
      }
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white">
      <header className="flex items-center gap-4 p-4 bg-white shadow sticky top-0 z-10">
        <h1 className="text-xl font-bold text-sky-700">Lovable-style Prototype</h1>
        <div className="flex-1" />
        <button onClick={() => { updatePreview(code) }} className="px-4 py-2 rounded bg-sky-600 text-white hover:bg-sky-700 transition">Atualizar Preview</button>
      </header>

      <main className="flex-1 grid grid-cols-2 gap-6 p-6">
        <section className="flex flex-col">
          <label className="text-sm font-semibold mb-2">Prompt (input para gerar código)</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            className="w-full p-3 rounded border border-slate-300 resize-none mb-3 font-mono text-sm leading-relaxed"
            rows={5}
            placeholder="Descreva o que deseja gerar em JS..."
          />
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700 transition disabled:opacity-50"
            >
              {loading ? 'Gerando...' : 'Gerar Código'}
            </button>
            <button onClick={() => loadTestPayload('normal')} className="px-3 py-2 bg-slate-200 rounded shadow hover:bg-slate-300 transition">Exemplo</button>
            <button onClick={() => loadTestPayload('leading-slash')} className="px-3 py-2 bg-yellow-200 rounded shadow hover:bg-yellow-300 transition">Teste: Leading Slash</button>
            <button onClick={() => loadTestPayload('regex-literal')} className="px-3 py-2 bg-yellow-200 rounded shadow hover:bg-yellow-300 transition">Teste: Regex Literal</button>
            <button onClick={() => loadTestPayload('contains-script')} className="px-3 py-2 bg-yellow-200 rounded shadow hover:bg-yellow-300 transition">Teste: &lt;/script&gt;</button>
            <button onClick={() => loadTestPayload('backticks')} className="px-3 py-2 bg-yellow-200 rounded shadow hover:bg-yellow-300 transition">Teste: Backticks</button>
            <button onClick={() => loadTestPayload('long-unicode')} className="px-3 py-2 bg-yellow-200 rounded shadow hover:bg-yellow-300 transition">Teste: Unicode</button>
          </div>

          <div className="flex-1 border border-slate-300 rounded overflow-hidden shadow">
            <Editor height="100%" defaultLanguage="javascript" value={code} onChange={(v) => setCode(v)} />
          </div>

          <div className="mt-4">
            <label className="text-sm font-semibold">Validação no Parent</label>
            <div className="mt-2 p-3 bg-red-100 text-red-800 rounded font-mono text-sm min-h-[40px]">
              {parentValidationError ? `Erro de sintaxe JS: ${parentValidationError}` : 'Sem erros de validação'}
            </div>
          </div>
        </section>

        <section className="flex flex-col">
          <label className="text-sm font-semibold mb-2">Preview (iframe seguro)</label>
          <iframe ref={iframeRef} className="flex-1 border border-slate-300 rounded shadow" title="preview" sandbox="allow-scripts" />
          <div className="mt-4">
            <label className="text-sm font-semibold">Console</label>
            <div className="mt-2 p-3 bg-black text-white rounded font-mono text-xs h-32 overflow-auto">
              (Console do preview aparece no DevTools do navegador)
            </div>
          </div>
        </section>
      </main>

      <footer className="p-4 text-xs text-slate-500 text-center border-t border-slate-200">
        Prototype: Next.js + Tailwind + Monaco • Substitua /api/generate pelo seu provedor LLM preferido
      </footer>
    </div>
  )
}
