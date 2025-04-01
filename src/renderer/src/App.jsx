import { useState } from 'react'
import electronLogo from './assets/electron.svg'

function App() {
  const [predictions, setPredictions] = useState([])
  const [imageDimensions, setImageDimensions] = useState({})
  const urlParams = new URLSearchParams(window.location.search)
  const port = urlParams.get('port')

  const handleClassification = async () => {
    try {
      const result = await window.api.selectFolder()
      if (!result) return

      const response = await fetch(
        `http://localhost:${port}/predict?path=${encodeURIComponent(result.path)}`
      )
      const data = await response.json()
      setPredictions(data.predictions)
    } catch (error) {
      console.error('Error:', error)
      setPredictions([])
    }
  }

  const handleImageLoad = (event, predictionId) => {
    const img = event.target
    const rect = img.getBoundingClientRect()
    setImageDimensions((prev) => ({
      ...prev,
      [predictionId]: {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        displayWidth: rect.width,
        displayHeight: rect.height,
        top: rect.top,
        left: rect.left
      }
    }))
  }

  const renderBoundingBoxes = (prediction) => {
    const dims = imageDimensions[prediction.filepath]
    if (!dims) return null

    // Calculate the actual image display area within the container
    const imageAspectRatio = dims.naturalWidth / dims.naturalHeight
    const containerAspectRatio = dims.displayWidth / dims.displayHeight

    let imageDisplayWidth, imageDisplayHeight, offsetX, offsetY

    if (imageAspectRatio > containerAspectRatio) {
      // Image is wider than container
      imageDisplayWidth = dims.displayWidth
      imageDisplayHeight = dims.displayWidth / imageAspectRatio
      offsetX = 0
      offsetY = (dims.displayHeight - imageDisplayHeight) / 2
    } else {
      // Image is taller than container
      imageDisplayHeight = dims.displayHeight
      imageDisplayWidth = dims.displayHeight * imageAspectRatio
      offsetX = (dims.displayWidth - imageDisplayWidth) / 2
      offsetY = 0
    }

    return prediction.detections
      .filter((d) => d.conf > 0.6)
      .map((detection, index) => {
        const [x, y, w, h] = detection.bbox
        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: `${offsetX + x * imageDisplayWidth}px`,
              top: `${offsetY + y * imageDisplayHeight}px`,
              width: `${w * imageDisplayWidth}px`,
              height: `${h * imageDisplayHeight}px`,
              border: '2px solid red',
              pointerEvents: 'none',
              backgroundColor: 'rgba(255, 0, 0, 0.1)'
            }}
          />
        )
      })
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', width: '100%' }}>
      <div style={{ padding: '20px' }}>
        <img alt="logo" className="logo" src={electronLogo} />
        <div className="creator">Powered by electron-vite</div>
        <div className="text-red-400 text-2xl">Image Classification Demo</div>

        <div className="actions">
          <div className="action">
            <button onClick={handleClassification}>Classify Images</button>
          </div>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px'
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px',
            maxWidth: '100%'
          }}
        >
          {predictions.map((pred, index) => (
            <div
              key={index}
              style={{
                border: '1px solid #ccc',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  paddingBottom: '75%' // 4:3 aspect ratio
                }}
              >
                <img
                  src={`local-file://get?path=${pred.filepath}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                  }}
                  alt="Classified"
                  onLoad={(e) => handleImageLoad(e, pred.filepath)}
                />
                {renderBoundingBoxes(pred)}
              </div>
              <div style={{ marginTop: '10px' }}>
                <strong>Prediction:</strong> {pred.prediction.split(';').pop()}
                <br />
                <strong>Confidence:</strong> {(pred.prediction_score * 100).toFixed(2)}%
                <br />
                <strong>Detections:</strong> {pred.detections.filter((d) => d.conf > 0.6).length}{' '}
                animals
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* <Versions></Versions> */}
    </div>
  )
}

export default App
