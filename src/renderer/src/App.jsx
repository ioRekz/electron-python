import { useState } from 'react'
import Versions from './components/Versions'
import electronLogo from './assets/electron.svg'

function App() {
  const [inputText, setInputText] = useState('')
  const [result, setResult] = useState('')
  //get port from url params
  const urlParams = new URLSearchParams(window.location.search)
  const port = urlParams.get('port')

  const handleSubmit = async () => {
    if (!port) return

    try {
      const response = await fetch(`http://localhost:${port}/hello`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: inputText })
      })
      const data = await response.json()
      setResult(data.message)
    } catch (error) {
      console.error('Error:', error)
      setResult('Error processing text')
    }
  }

  return (
    <>
      <img alt="logo" className="logo" src={electronLogo} />
      <div className="creator">Powered by electron-vite</div>
      <div className="text">Python Integration Demo</div>

      <div className="input-section" style={{ margin: '20px 0' }}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Enter text..."
          style={{ marginRight: '10px', padding: '5px' }}
        />
        <button onClick={handleSubmit} style={{ padding: '5px 10px' }}>
          Submit
        </button>
      </div>

      {result && (
        <div className="result" style={{ margin: '20px 0' }}>
          Result: {result}
        </div>
      )}

      <p className="tip">
        Please try pressing <code>F12</code> to open the devTool
      </p>
      <div className="actions">
        <div className="action">
          <a href="https://electron-vite.org/" target="_blank" rel="noreferrer">
            Documentation
          </a>
        </div>
        <div className="action">
          <a target="_blank" rel="noreferrer">
            Send IPC
          </a>
        </div>
      </div>
      <Versions></Versions>
    </>
  )
}

export default App
