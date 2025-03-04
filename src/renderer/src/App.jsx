import { useState } from 'react'
import Versions from './components/Versions'
import electronLogo from './assets/electron.svg'

function App() {
  const [inputText, setInputText] = useState('')
  const [result, setResult] = useState('')
  const [bearResult, setBearResult] = useState(null)
  const [selectedImage, setSelectedImage] = useState(null)
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

  const handleBearDetection = async () => {
    try {
      const result = await window.api.selectImage()
      console.log('Selected image:', result)
      if (!result) return

      console.log('Selected image:', result)

      // Use the custom protocol URL for display
      setSelectedImage(result.url)

      const response = await fetch(
        `http://localhost:${port}/bear?path=${encodeURIComponent(result.path)}`
      )
      const data = await response.json()
      setBearResult(data)
    } catch (error) {
      console.error('Error:', error)
      setBearResult({ error: 'Error processing image' })
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
          <button onClick={handleBearDetection}>Detect Bears</button>
        </div>
      </div>

      {selectedImage && (
        <div style={{ margin: '20px 0' }}>
          <div style={{ position: 'relative', width: '400px' }}>
            <img
              src={selectedImage}
              style={{
                width: '400px',
                height: 'auto',
                display: 'block'
              }}
              alt="Selected"
            />
            {bearResult?.prediction?.boxes &&
              bearResult.prediction.boxes.map((box, index) => {
                const { normalized } = box
                // Calculate absolute positions based on our 400px display width
                const displayWidth = 400
                const aspectRatio =
                  bearResult.prediction.image_size.height / bearResult.prediction.image_size.width
                const displayHeight = displayWidth * aspectRatio

                return (
                  <div
                    key={index}
                    style={{
                      position: 'absolute',
                      left: `${normalized.x1 * displayWidth}px`,
                      top: `${normalized.y1 * displayHeight}px`,
                      width: `${(normalized.x2 - normalized.x1) * displayWidth}px`,
                      height: `${(normalized.y2 - normalized.y1) * displayHeight}px`,
                      border: '2px solid red',
                      pointerEvents: 'none',
                      backgroundColor: 'rgba(255, 0, 0, 0.1)'
                    }}
                  />
                )
              })}
          </div>
          {bearResult?.prediction && <div>Found {bearResult.prediction.boxes.length} bears</div>}
          {bearResult?.error && <div style={{ color: 'red' }}>Error: {bearResult.error}</div>}
        </div>
      )}

      <Versions></Versions>
    </>
  )
}

export default App
