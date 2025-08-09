import { useState, useRef } from 'react'

export default function Home() {
  const [parentValidationError, setParentValidationError] = useState(null)
  const iframeRef = useRef(null)

  const runUserCode = (code) => {
    let validationError = null
    // Simulação de validação, substitua pela real se quiser
    try {
      new Function(code)
    } catch (e) {
      validationError = e
    }

    if (validationError) {
      const msg = String(
        validationError && validationError.message ? validationError.message : 'Invalid code'
      )
      setParentValidationError(msg)

      const errorSnippet = `// Validation failed in parent: ${JSON.stringify(msg)}
(function(){
  const root = document.getElementById('root');
  if (root) root.innerText = \`Preview error (invalid JS): \${msg.replace(/'/g, "\\'")}\`;
})();
`
      iframeRef.current.contentWindow.postMessage({ userCode: errorSnippet }, '*')
    } else {
      setParentValidationError(null)
      iframeRef.current.contentWindow.postMessage({ userCode: String(code) }, '*')
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Arial', padding: 16 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: 16 }}>Run JS Code</h1>
      <textarea
        rows={8}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 14, padding: 8, marginBottom: 8 }}
        placeholder="Write some JavaScript code here..."
        onChange={(e) => runUserCode(e.target.value)}
      />
      {parentValidationError && (
        <div style={{ color: 'red', marginBottom: 8 }}>Error: {parentValidationError}</div>
      )}
      <iframe
        ref={iframeRef}
        title="output"
        style={{ width: '100%', height: 200, border: '1px solid #ccc' }}
        sandbox="allow-scripts"
        srcDoc={`<div id="root" style="padding: 10px; font-family: monospace;"></div>
<script>
  window.addEventListener('message', (event) => {
    const { userCode } = event.data;
    if (!userCode) return;
    try {
      eval(userCode);
    } catch(e) {
      const root = document.getElementById('root');
      if(root) root.innerText = 'Runtime error: ' + e.message;
    }
  });
</script>`}
      />
    </div>
  )
}
