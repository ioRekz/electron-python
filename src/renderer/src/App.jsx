import { Camera, ChartBar, ImageIcon } from 'lucide-react'
import { useState } from 'react'

function App() {
  const [predictions, setPredictions] = useState([])
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

  console.log('Predictionss:', predictions)

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
                  className="min-w-0 flex w-full items-center text-sm hover:bg-gray-100 rounded-md px-2 h-7"
                >
                  Google/Speciesnet
                </a>
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
                className="cursor-pointer hover:bg-gray-50 transition-colors mt-8 flex justify-center flex-row gap-2 items-center border border-gray-200 px-2 h-10 text-sm shadow-sm rounded-md"
              >
                <ImageIcon color="black" size={20} className="pb-[2px]" />
                Start Importing
              </button>
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
    </div>
  )
}

export default App
