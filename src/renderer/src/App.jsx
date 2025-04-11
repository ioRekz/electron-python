import { Camera, ChartBar, ImageIcon, Download, CheckCircle, AlertCircle } from 'lucide-react'
import { useState, useEffect } from 'react'

function App() {
  const [predictions, setPredictions] = useState([])
  const [modelStatus, setModelStatus] = useState({ isChecking: true, isDownloaded: false })
  const [isDownloading, setIsDownloading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const urlParams = new URLSearchParams(window.location.search)
  const port = urlParams.get('port') === 'null' ? 5002 : urlParams.get('port')

  // Check model status on component mount
  useEffect(() => {
    async function checkModel() {
      try {
        const status = await window.api.checkModelStatus()
        setModelStatus({ isChecking: false, ...status })
      } catch (error) {
        console.error('Error checking model status:', error)
        setModelStatus({ isChecking: false, isDownloaded: false, error: error.message })
      }
    }

    checkModel()
  }, [])

  const handleModelDownload = async () => {
    if (isDownloading || modelStatus.isDownloaded) return

    setIsDownloading(true)
    try {
      const result = await window.api.downloadModel()
      if (result.success) {
        setModelStatus({ isChecking: false, isDownloaded: true })
      } else {
        setModelStatus({
          isChecking: false,
          isDownloaded: false,
          error: result.message
        })
      }
    } catch (error) {
      console.error('Error downloading model:', error)
      setModelStatus({
        isChecking: false,
        isDownloaded: false,
        error: error.message
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const handleClassification = async () => {
    // Don't allow classification if model isn't downloaded
    if (!modelStatus.isDownloaded) {
      alert('Please download the model first')
      return
    }

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

  // Setup drag and drop event handlers
  useEffect(() => {
    const handleDragOver = (e) => {
      console.log('Drag over:', e)
      e.preventDefault()
      // e.stopPropagation()
      setIsDragging(true)
    }

    const handleDragLeave = (e) => {
      e.preventDefault()
      // e.stopPropagation()
      setIsDragging(false)
    }

    const handleDrop = async (e) => {
      console.log('Dropped:', e)
      e.preventDefault()
      // e.stopPropagation()
      setIsDragging(false)

      // Process dropped items
      const items = e.dataTransfer.items
      if (!items || items.length === 0) return

      // Get directory path from dropped item
      for (const item of items) {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry()
          if (entry && entry.isDirectory) {
            setIsImporting(true)
            try {
              const file = item.getAsFile()
              const result = await window.electron.importDroppedDirectory(file.path)

              if (result.error) {
                console.error('Import error:', result.error)
                // Show error notification to user
              } else {
                // Handle successful import
                console.log('Successfully imported:', result)
                // Update your app state with the imported data
              }
            } catch (error) {
              console.error('Error during import:', error)
              // Show error notification to user
            } finally {
              setIsImporting(false)
            }
            break
          }
        }
      }
    }

    // Add event listeners
    document.body.addEventListener('dragover', handleDragOver)
    document.body.addEventListener('dragleave', handleDragLeave)
    document.body.addEventListener('drop', handleDrop)
    console.log('Register')

    // Clean up event listeners
    return () => {
      document.body.removeEventListener('dragover', handleDragOver)
      document.body.removeEventListener('dragleave', handleDragLeave)
      document.body.removeEventListener('drop', handleDrop)
    }
  }, [])

  // Add a visual indicator for drag state
  const dragOverlay = isDragging ? (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
    >
      <div
        style={{
          padding: '2rem',
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          textAlign: 'center'
        }}
      >
        <h2>Drop Camera Trap Directory to Import</h2>
      </div>
    </div>
  ) : null

  // Add a loading indicator for import process
  const importingOverlay = isImporting ? (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
    >
      <div
        style={{
          padding: '2rem',
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          textAlign: 'center'
        }}
      >
        <h2>Importing Camera Trap Data...</h2>
        <p>This may take a few moments</p>
      </div>
    </div>
  ) : null

  console.log('Predictions:', predictions)

  return (
    <div className={`relative flex min-h-svh flex-row`}>
      <div className="w-52 h-full p-2 fixed">
        <header className="p-2">
          <div className="text-base font-semibold p-2 flex items-center">
            <Camera color="black" size={24} className="rotate-[80deg]" />
            <span className="pt-[3px]">iowatch</span>
          </div>
        </header>
        <ul className="flex w-full min-w-0 flex-col gap-4 p-2">
          <li>
            <a className="flex w-full items-center h-8 gap-2 text-sm font-medium hover:bg-gray-100 rounded-md p-2">
              {/* <NotebookPen color="black" size={20} className="pb-[2px]" /> */}
              <span>Study</span>
            </a>
            <ul className="border-l mx-3.5 border-gray-200 flex w-full flex-col gap-1 px-1.5 py-0.5 text-[hsl(var(--sidebar-foreground))]">
              <li className="flex items-center">
                <a
                  href="#"
                  className="min-w-0 flex w-full items-center text-sm hover:bg-gray-100 rounded-md px-2 h-7 font-semibold"
                >
                  Snow Leopard
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="min-w-0 flex w-full items-center text-sm hover:bg-gray-100 rounded-md px-2 h-7"
                >
                  Bird Flu
                </a>
              </li>
            </ul>
          </li>
          <li className="">
            <a className="flex w-full items-center h-8 gap-2 text-sm font-medium hover:bg-gray-100 rounded-md p-2">
              {/* <BotIcon color="black" size={20} className="pb-[2px]" /> */}
              <span>Model</span>
            </a>
            <ul className="border-l mx-3.5 border-gray-200 flex w-full flex-col gap-1 px-1.5 py-0.5 text-[hsl(var(--sidebar-foreground))]">
              <li>
                <a
                  href="#"
                  className="min-w-0 flex w-full items-center justify-between text-sm hover:bg-gray-100 rounded-md px-2 h-7"
                >
                  <span>Google/Speciesnet</span>
                  {modelStatus.isChecking ? (
                    <span className="animate-pulse">...</span>
                  ) : modelStatus.isDownloaded ? (
                    <CheckCircle size={16} className="text-green-500" />
                  ) : isDownloading ? (
                    <Download size={16} className="animate-pulse text-blue-500" />
                  ) : (
                    <button
                      onClick={handleModelDownload}
                      className="text-blue-500 hover:text-blue-700"
                      title="Download model"
                    >
                      <Download size={16} />
                    </button>
                  )}
                </a>
                {modelStatus.error && (
                  <div className="text-xs text-red-500 px-2 py-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    <span>Error: {modelStatus.error}</span>
                  </div>
                )}
              </li>
            </ul>
          </li>
        </ul>
      </div>
      <main className="ml-52 relative flex w-full flex-1 flex-col bg-white rounded-xl shadow mt-2 mr-2">
        {predictions.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col justify-around border-gray-100 border p-4 rounded-md w-72 gap-2">
              <h2 className="font-medium">Snow Leopard</h2>
              <p className="text-sm text-gray-500">
                {"You don't have any picture in this study yet."}
              </p>
              <p className="text-sm text-gray-500">
                After importing, we will classify your images using Speciesnet and visualize the
                results.
              </p>
              <button
                onClick={handleClassification}
                disabled={!modelStatus.isDownloaded}
                className={`cursor-pointer transition-colors mt-8 flex justify-center flex-row gap-2 items-center border border-gray-200 px-2 h-10 text-sm shadow-sm rounded-md ${
                  modelStatus.isDownloaded ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                <ImageIcon color="black" size={20} className="pb-[2px]" />
                {!modelStatus.isDownloaded ? 'Download Model First' : 'Start Importing'}
              </button>
              {!modelStatus.isDownloaded && !isDownloading && (
                <button
                  onClick={handleModelDownload}
                  className="cursor-pointer hover:bg-blue-50 transition-colors flex justify-center flex-row gap-2 items-center border border-blue-200 px-2 h-10 text-sm shadow-sm rounded-md text-blue-600"
                >
                  <Download size={20} className="pb-[2px]" />
                  Download Model
                </button>
              )}
              {isDownloading && (
                <div className="flex justify-center items-center gap-2 text-blue-600">
                  <Download size={20} className="animate-pulse" />
                  <span>Downloading model...</span>
                </div>
              )}
            </div>
          </div>
        )}
        {predictions.length > 0 && (
          <div className="flex gap-4 flex-col">
            <header className="w-full flex border-b border-gray-200 divide-gray-200 divide-x">
              <button className="cursor-pointer bg-gray-100 hover:bg-gray-50 transition-colors flex justify-center flex-row gap-2 items-center px-4 h-10 text-sm rounded-tl-md">
                <ImageIcon color="black" size={20} className="pb-[2px]" />
                Images
              </button>
              <button className="cursor-pointer hover:bg-gray-50 transition-colors flex justify-center flex-row gap-2 items-center px-4 h-10 text-sm ">
                <ChartBar color="black" size={20} className="pb-[2px]" />
                Analysis
              </button>
            </header>
            <ul className="flex flex-row gap-4 flex-wrap px-4">
              {predictions.map((pred) => (
                <li key={pred.filepath} className="w-72 rounded-sm flex gap-2 flex-col">
                  <div className="w-full relative">
                    <div className="absolute size-full">
                      {pred.detections
                        .filter((d) => d.conf > 0.6)
                        .map((d, i) => (
                          <div
                            style={{
                              left: `${d.bbox[0] * 100}%`,
                              top: `${d.bbox[1] * 100}%`,
                              width: `${d.bbox[2] * 100}%`,
                              height: `${d.bbox[3] * 100}%`
                            }}
                            className="absolute border-2 border-red-500"
                            key={i}
                          ></div>
                        ))}
                    </div>
                    <img
                      src={`local-file://get?path=${pred.filepath}`}
                      className="w-full"
                      alt="Classified"
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">{pred.prediction.split(';').pop()}</span>
                    <span className="text-sm text-gray-500">
                      {Math.round(pred.prediction_score * 100)}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
      {/* Drag overlay */}
      {dragOverlay}

      {/* Import loading overlay */}
      {importingOverlay}
    </div>
  )
}

export default App
