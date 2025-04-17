import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router'
import { MapContainer, TileLayer, LayersControl, Marker, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// TimelineChart component
const TimelineChart = ({ timeseriesData, topSpecies, dateRange, setDateRange }) => {
  const svgRef = useRef(null)
  const containerRef = useRef(null)
  const dragRef = useRef({
    isDragging: false,
    initialX: 0,
    initialRange: [null, null]
  })

  // SVG dimensions and settings
  const svgHeight = 100
  const svgWidth = 800 // Fixed reference width for the viewBox
  const width = svgWidth
  const height = svgHeight
  const xAxisHeight = 20 // Space for x-axis and labels
  const topPadding = 0 // Small padding at the top for visual clarity

  const handleRangeMouseDown = (event) => {
    if (!timeseriesData || timeseriesData.length === 0) return
    event.preventDefault()

    // Save initial drag position and date range
    dragRef.current = {
      isDragging: true,
      initialX: event.clientX,
      initialRange: [...dateRange]
    }

    document.addEventListener('mousemove', handleRangeDrag)
    document.addEventListener(
      'mouseup',
      () => {
        dragRef.current.isDragging = false
        document.removeEventListener('mousemove', handleRangeDrag)
      },
      { once: true }
    )
  }

  const handleRangeDrag = (event) => {
    if (!timeseriesData || timeseriesData.length === 0 || !dragRef.current.isDragging) return

    const svgRect = svgRef.current.getBoundingClientRect()
    const totalWidth = svgRect.width
    const startDate = new Date(timeseriesData[0].date)
    const endDate = new Date(timeseriesData[timeseriesData.length - 1].date)
    const totalTimeRange = endDate.getTime() - startDate.getTime()

    const deltaX = event.clientX - dragRef.current.initialX
    const dateDelta = (deltaX / totalWidth) * totalTimeRange

    const newStart = new Date(dragRef.current.initialRange[0].getTime() + dateDelta)
    const newEnd = new Date(dragRef.current.initialRange[1].getTime() + dateDelta)

    if (newStart >= startDate && newEnd <= endDate) {
      setDateRange([newStart, newEnd])
    } else if (newStart < startDate) {
      const rangeDuration =
        dragRef.current.initialRange[1].getTime() - dragRef.current.initialRange[0].getTime()
      setDateRange([startDate, new Date(startDate.getTime() + rangeDuration)])
    } else if (newEnd > endDate) {
      const rangeDuration =
        dragRef.current.initialRange[1].getTime() - dragRef.current.initialRange[0].getTime()
      setDateRange([new Date(endDate.getTime() - rangeDuration), endDate])
    }
  }

  const handleRangeResize = (event, isLeftHandle) => {
    if (!timeseriesData || timeseriesData.length === 0) return

    const svgRect = svgRef.current.getBoundingClientRect()
    const x = event.clientX - svgRect.left
    const totalWidth = svgRect.width
    const startDate = new Date(timeseriesData[0].date)
    const endDate = new Date(timeseriesData[timeseriesData.length - 1].date)

    const newDate = new Date(
      startDate.getTime() + ((endDate.getTime() - startDate.getTime()) * x) / totalWidth
    )

    if (isLeftHandle && newDate < dateRange[1] && newDate >= startDate) {
      setDateRange([newDate, dateRange[1]])
    } else if (!isLeftHandle && newDate > dateRange[0] && newDate <= endDate) {
      setDateRange([dateRange[0], newDate])
    }
  }

  const handleMouseUp = (resizeHandler) => {
    document.removeEventListener('mousemove', resizeHandler)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  const generateLinePath = (speciesName) => {
    if (!timeseriesData || timeseriesData.length === 0) return ''

    const maxValue = Math.max(
      ...timeseriesData.map((day) => Math.max(...topSpecies.map((s) => day[s.scientificName] || 0)))
    )

    const xScale = width / Math.max(timeseriesData.length - 1, 1)
    const yScale = (height - xAxisHeight - topPadding) / (maxValue || 1)

    const points = timeseriesData.map((day, i) => ({
      x: i * xScale,
      y: height - xAxisHeight - (day[speciesName] || 0) * yScale
    }))

    let path = `M ${points[0].x},${points[0].y}`

    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i]
      const next = points[i + 1]

      const ctrlPointX1 = current.x + (next.x - current.x) * 0.3
      const ctrlPointY1 = current.y
      const ctrlPointX2 = next.x - (next.x - current.x) * 0.3
      const ctrlPointY2 = next.y

      path += ` C ${ctrlPointX1},${ctrlPointY1} ${ctrlPointX2},${ctrlPointY2} ${next.x},${next.y}`
    }

    return path
  }

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        className="bg-white rounded flex-grow"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <line
          x1="0"
          y1={height - xAxisHeight}
          x2={width}
          y2={height - xAxisHeight}
          stroke="black"
        />

        {timeseriesData &&
          timeseriesData
            .filter(
              (_, i) =>
                i % Math.ceil(timeseriesData.length / 5) === 0 ||
                i === 0 ||
                i === timeseriesData.length - 1
            )
            .map((day, i) => (
              <text
                key={i}
                x={
                  ((i * (timeseriesData.length / 5)) / (timeseriesData.length - 1)) * (width - 40) +
                  20
                }
                y={height - 5}
                textAnchor="middle"
                fontSize="12"
              >
                {new Date(day.date).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: '2-digit'
                })}
              </text>
            ))}

        {topSpecies.length > 0 && (
          <path
            d={generateLinePath(topSpecies[0].scientificName)}
            fill="none"
            stroke="blue"
            strokeWidth="2"
            opacity="0.7"
          />
        )}

        {topSpecies.length > 1 && (
          <path
            d={generateLinePath(topSpecies[1].scientificName)}
            fill="none"
            stroke="green"
            strokeWidth="2"
            opacity="0.7"
          />
        )}

        {dateRange[0] && dateRange[1] && timeseriesData.length > 0 && (
          <rect
            x={
              ((dateRange[0] - new Date(timeseriesData[0].date)) /
                (new Date(timeseriesData[timeseriesData.length - 1].date) -
                  new Date(timeseriesData[0].date))) *
              svgWidth
            }
            y="0"
            width={
              ((dateRange[1] - dateRange[0]) /
                (new Date(timeseriesData[timeseriesData.length - 1].date) -
                  new Date(timeseriesData[0].date))) *
              svgWidth
            }
            height={svgHeight}
            fill="rgba(0, 0, 255, 0.2)"
            cursor="move"
            onMouseDown={handleRangeMouseDown}
          />
        )}

        {dateRange[0] && timeseriesData.length > 0 && (
          <rect
            x={
              ((dateRange[0] - new Date(timeseriesData[0].date)) /
                (new Date(timeseriesData[timeseriesData.length - 1].date) -
                  new Date(timeseriesData[0].date))) *
              svgWidth
            }
            y="0"
            width="5"
            height={svgHeight}
            fill="rgba(0, 0, 255, 0.5)"
            cursor="ew-resize"
            onMouseDown={(e) => {
              e.preventDefault()
              const resizeHandler = (event) => handleRangeResize(event, true)
              document.addEventListener('mousemove', resizeHandler)
              document.addEventListener('mouseup', () => handleMouseUp(resizeHandler), {
                once: true
              })
            }}
          />
        )}

        {dateRange[1] && timeseriesData.length > 0 && (
          <rect
            x={
              ((dateRange[1] - new Date(timeseriesData[0].date)) /
                (new Date(timeseriesData[timeseriesData.length - 1].date) -
                  new Date(timeseriesData[0].date))) *
                svgWidth -
              5
            }
            y="0"
            width="5"
            height={svgHeight}
            fill="rgba(0, 0, 255, 0.5)"
            cursor="ew-resize"
            onMouseDown={(e) => {
              e.preventDefault()
              const resizeHandler = (event) => handleRangeResize(event, false)
              document.addEventListener('mousemove', resizeHandler)
              document.addEventListener('mouseup', () => handleMouseUp(resizeHandler), {
                once: true
              })
            }}
          />
        )}
      </svg>
    </div>
  )
}

// SpeciesMap component
const SpeciesMap = ({ heatmapData, topSpecies }) => {
  // Function to create a pie chart icon
  const createPieChartIcon = (counts) => {
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
    const size = Math.min(50, Math.max(20, Math.sqrt(total) * 3)) // Scale dot size based on count

    const createSVG = () => {
      // Create SVG for pie chart
      const svgNS = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(svgNS, 'svg')
      svg.setAttribute('width', size)
      svg.setAttribute('height', size)
      svg.setAttribute('viewBox', `0 0 100 100`)

      // Add a circle background - only needed for multiple species
      if (Object.keys(counts).length > 1) {
        const circle = document.createElementNS(svgNS, 'circle')
        circle.setAttribute('cx', '50')
        circle.setAttribute('cy', '50')
        circle.setAttribute('r', '50')
        circle.setAttribute('fill', 'white')
        svg.appendChild(circle)
      }

      // Draw pie slices
      let startAngle = 0
      const colors = [
        'rgba(0, 0, 255, 0.8)',
        'rgba(0, 128, 0, 0.8)',
        'rgba(255, 0, 0, 0.8)',
        'rgba(255, 165, 0, 0.8)'
      ]

      // Use the same radius for pie slices as for the circle
      const radius = 50

      // Special case for single species - draw a full circle
      if (Object.keys(counts).length === 1) {
        const species = Object.keys(counts)[0]
        const index = topSpecies.findIndex((s) => s.scientificName === species)
        const colorIndex = index >= 0 ? index : 0
        const color = colors[colorIndex % colors.length]

        const circle = document.createElementNS(svgNS, 'circle')
        circle.setAttribute('cx', '50')
        circle.setAttribute('cy', '50')
        circle.setAttribute('r', '50')
        circle.setAttribute('fill', color)
        svg.appendChild(circle)
      } else {
        // Multiple species - draw pie slices
        Object.entries(counts).forEach(([species, count], index) => {
          const portion = count / total
          const endAngle = startAngle + portion * 2 * Math.PI
          const color = colors[index % colors.length]

          const largeArcFlag = portion > 0.5 ? 1 : 0

          const x1 = 50 + radius * Math.sin(startAngle)
          const y1 = 50 - radius * Math.cos(startAngle)
          const x2 = 50 + radius * Math.sin(endAngle)
          const y2 = 50 - radius * Math.cos(endAngle)

          const pathData = [
            `M 50 50`,
            `L ${x1} ${y1}`,
            `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
            `Z`
          ].join(' ')

          const path = document.createElementNS(svgNS, 'path')
          path.setAttribute('d', pathData)
          path.setAttribute('fill', color)
          path.setAttribute('stroke', color) // Match stroke color to fill color
          path.setAttribute('stroke-width', '0.5') // Very thin stroke just to smooth edges
          svg.appendChild(path)

          startAngle = endAngle
        })
      }

      return svg
    }

    const svgElement = createSVG()
    const svgString = new XMLSerializer().serializeToString(svgElement)
    const dataUrl = `data:image/svg+xml;base64,${btoa(svgString)}`

    return L.icon({
      iconUrl: dataUrl,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2]
    })
  }

  // Process data points
  const processPointData = () => {
    const locations = {}

    // Combine data from all species
    topSpecies.slice(0, 4).forEach((species) => {
      const speciesName = species.scientificName
      const points = heatmapData?.[speciesName] || []

      points.forEach((point) => {
        const key = `${point.lat},${point.lng}`
        if (!locations[key]) {
          locations[key] = {
            lat: parseFloat(point.lat),
            lng: parseFloat(point.lng),
            counts: {}
          }
        }

        locations[key].counts[speciesName] = point.count
      })
    })

    return Object.values(locations)
  }

  const locationPoints = processPointData()

  // Calculate bounds if we have location points
  const bounds =
    locationPoints.length > 0
      ? locationPoints.reduce(
          (bounds, point) => {
            return [
              [Math.min(bounds[0][0], point.lat), Math.min(bounds[0][1], point.lng)],
              [Math.max(bounds[1][0], point.lat), Math.max(bounds[1][1], point.lng)]
            ]
          },
          [
            [90, 180],
            [-90, -180]
          ] // Initial bounds [min, max]
        )
      : null

  console.log('bounds', bounds)

  // Only use bounds if we have points and the bounds are valid
  const shouldUseBounds =
    bounds &&
    bounds[0][0] <= bounds[1][0] &&
    bounds[0][1] <= bounds[1][1] &&
    locationPoints.length > 1

  // Options for bounds
  const boundsOptions = {
    padding: [20, 20]
  }

  return (
    <MapContainer
      bounds={shouldUseBounds ? bounds : undefined}
      boundsOptions={shouldUseBounds ? boundsOptions : undefined}
      className="rounded w-full h-full border border-gray-200"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <LayersControl position="topright">
        <LayersControl.Overlay name="Species Distribution" checked={true}>
          <MarkerClusterGroup
            chunkedLoading
            showCoverageOnHover={false}
            // spiderfyOnMaxZoom={true}
            maxClusterRadius={200}
            animateAddingMarkers={false}
            iconCreateFunction={(cluster) => {
              // Get all markers in this cluster
              const markers = cluster.getAllChildMarkers()

              // Combine counts from all markers
              const combinedCounts = {}
              markers.forEach((marker) => {
                Object.entries(marker.options.counts).forEach(([species, count]) => {
                  if (!combinedCounts[species]) combinedCounts[species] = 0
                  combinedCounts[species] += count
                })
              })

              // return null

              console.log('make icon')

              return createPieChartIcon(combinedCounts)
            }}
          >
            {locationPoints.map((point, index) => (
              <Marker
                key={index}
                position={[point.lat, point.lng]}
                icon={createPieChartIcon(point.counts)}
                counts={point.counts}
              >
                {/* <Popup>
                  <div className="text-sm">
                    <h3 className="font-bold mb-1">Species Data</h3>
                    <ul>
                      {Object.entries(point.counts).map(([species, count], i) => (
                        <li key={i}>
                          <span className="italic">{species}</span>: {count} observations
                        </li>
                      ))}
                    </ul>
                  </div>
                </Popup> */}
              </Marker>
            ))}
          </MarkerClusterGroup>
        </LayersControl.Overlay>

        {/* Add a legend */}
        <div className="absolute bottom-5 right-5 bg-white p-2 rounded shadow-md z-[1000]">
          <h4 className="text-sm font-bold mb-1">Legend</h4>
          {topSpecies.slice(0, 4).map((species, index) => {
            const colors = ['blue', 'green', 'red', 'orange']
            return (
              <div key={index} className="flex items-center space-x-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: colors[index % colors.length] }}
                ></div>
                <span className="text-xs">{species.scientificName}</span>
              </div>
            )
          })}
        </div>
      </LayersControl>
    </MapContainer>
  )
}

function SpeciesDistribution({ data, taxonomicData }) {
  const [commonNames, setCommonNames] = useState({})
  const [isLoadingNames, setIsLoadingNames] = useState(false)

  const totalCount = data.reduce((sum, item) => sum + item.count, 0)

  // Create a map of scientific names to common names from taxonomic data
  const scientificToCommonMap = {}
  if (taxonomicData && Array.isArray(taxonomicData)) {
    taxonomicData.forEach((taxon) => {
      if (taxon.scientificName && taxon?.vernacularNames?.eng) {
        scientificToCommonMap[taxon.scientificName] = taxon.vernacularNames.eng
      }
    })
  }

  // Function to fetch common names from Global Biodiversity Information Facility (GBIF)
  async function fetchCommonName(scientificName) {
    try {
      // Step 1: Match the scientific name to get usageKey
      const matchResponse = await fetch(
        `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(scientificName)}`
      )
      const matchData = await matchResponse.json()

      // Check if we got a valid usageKey
      if (!matchData.usageKey) {
        return null
      }

      // Step 2: Use the usageKey to fetch vernacular names
      const vernacularResponse = await fetch(
        `https://api.gbif.org/v1/species/${matchData.usageKey}/vernacularNames`
      )
      const vernacularData = await vernacularResponse.json()

      // Find English vernacular name if available
      if (vernacularData && vernacularData.results && vernacularData.results.length > 0) {
        // Prefer English names
        const englishName = vernacularData.results.find(
          (name) => name.language === 'eng' || name.language === 'en'
        )

        if (englishName) {
          return englishName.vernacularName
        }

        // If no English name, return the first available name
        return vernacularData.results[0].vernacularName
      }

      return null
    } catch (error) {
      console.error(`Error fetching common name for ${scientificName}:`, error)
      return null
    }
  }

  // Fetch missing common names
  useEffect(() => {
    const fetchMissingCommonNames = async () => {
      if (!data) return

      const missingCommonNames = data.filter(
        (species) =>
          species.scientificName &&
          !scientificToCommonMap[species.scientificName] &&
          !commonNames[species.scientificName]
      )

      if (missingCommonNames.length === 0) return

      setIsLoadingNames(true)
      const newCommonNames = { ...commonNames }

      // Fetch common names for species with missing common names
      await Promise.all(
        missingCommonNames.map(async (species) => {
          const commonName = await fetchCommonName(species.scientificName)
          if (commonName) {
            newCommonNames[species.scientificName] = commonName
          }
        })
      )

      setCommonNames(newCommonNames)
      setIsLoadingNames(false)
    }

    fetchMissingCommonNames()
  }, [data, taxonomicData])

  if (!data || data.length === 0) {
    return <div className="text-gray-500">No species data available</div>
  }

  return (
    <div className="w-full h-full bg-white rounded border border-gray-200 p-3 overflow-y-auto">
      <div className="space-y-4">
        {data.map((species, index) => {
          // Try to get the common name from the taxonomic data first, then from fetched data
          const commonName =
            scientificToCommonMap[species.scientificName] ||
            commonNames[species.scientificName] ||
            'Unknown'

          return (
            <div key={index} className="">
              <div className="flex justify-between mb-1 items-center">
                <div>
                  <span className="capitalize text-sm">{commonName}</span>
                  {species.scientificName && (
                    <span className="text-gray-500 text-sm italic ml-2">
                      ({species.scientificName})
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">{species.count}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${(species.count / totalCount) * 100}%` }}
                ></div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Activity({ studyData, studyId }) {
  const { id } = useParams()
  const actualStudyId = studyId || id // Use passed studyId or from params
  const [timeseriesData, setTimeseriesData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [topSpecies, setTopSpecies] = useState([])
  const [dateRange, setDateRange] = useState([null, null])
  const [heatmapData, setHeatmapData] = useState(null)
  const [mapLoading, setMapLoading] = useState(false)
  const [speciesDistributionData, setSpeciesDistributionData] = useState(null)
  const throttleTimerRef = useRef(null)
  const latestParamsRef = useRef({ studyId: null, dateRange: [null, null], topSpecies: [] })

  // Get taxonomic data from studyData
  const taxonomicData = studyData?.taxonomic || null

  // True throttle implementation
  const throttle = (func, limit) => {
    let lastRun = 0
    return function (...args) {
      const now = Date.now()
      if (now - lastRun >= limit) {
        lastRun = now
        func.apply(this, args)
      }
    }
  }

  // Fetch heatmap data function
  const fetchHeatmapData = useCallback(async () => {
    const { studyId, dateRange, topSpecies } = latestParamsRef.current

    if (!dateRange[0] || !dateRange[1] || topSpecies.length === 0 || !studyId) return

    try {
      setMapLoading(true)
      const speciesNames = topSpecies.map((s) => s.scientificName)
      const response = await window.api.getSpeciesHeatmapData(
        studyId,
        speciesNames,
        dateRange[0].toISOString(),
        dateRange[1].toISOString()
      )

      if (response.error) {
        console.error('Error fetching heatmap data:', response.error)
        return
      }

      setHeatmapData(response.data)

      const allPoints = Object.values(response.data).flat()
      if (allPoints.length > 0) {
        // setMapCenter([allPoints[0].lat, allPoints[0].lng])
        // setMapZoom(6)
      }
    } catch (err) {
      console.error('Failed to fetch heatmap data:', err)
    } finally {
      setMapLoading(false)
    }
  }, [])

  // Create a throttled version of the fetch function (500ms delay)
  const throttledFetchHeatmapData = useCallback(throttle(fetchHeatmapData, 1000), [
    fetchHeatmapData
  ])

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)

        const response = await window.api.getTopSpeciesTimeseries(actualStudyId)
        const speciesResponse = await window.api.getSpeciesDistribution(actualStudyId)

        if (response.error) {
          setError(response.error)
        } else {
          setTimeseriesData(response.data.timeseries)
          setTopSpecies(response.data.topSpecies)
        }

        if (speciesResponse.error) {
          console.error('Error fetching species distribution:', speciesResponse.error)
        } else {
          setSpeciesDistributionData(speciesResponse.data)
          console.log('Species distribution data:', speciesResponse.data)
        }
      } catch (err) {
        setError(err.message || 'Failed to fetch activity data')
      } finally {
        setLoading(false)
      }
    }

    if (actualStudyId) {
      fetchData()
    }
  }, [actualStudyId])

  useEffect(() => {
    if (
      timeseriesData &&
      timeseriesData.length > 0 &&
      dateRange[0] === null &&
      dateRange[1] === null
    ) {
      const totalPeriods = timeseriesData.length
      const startIndex = Math.max(totalPeriods - Math.ceil(totalPeriods * 0.3), 0)
      const endIndex = totalPeriods - 1

      setDateRange([
        new Date(timeseriesData[startIndex].date),
        new Date(timeseriesData[endIndex].date)
      ])
    }
  }, [timeseriesData])

  useEffect(() => {
    // Update the latest parameters ref
    latestParamsRef.current = {
      studyId: actualStudyId,
      dateRange,
      topSpecies
    }

    async function fetchData() {
      // Trigger the throttled fetch
      // throttledFetchHeatmapData()

      // fetchHeatmapData()

      const speciesNames = topSpecies.map((s) => s.scientificName)
      const response = await window.api.getSpeciesHeatmapData(
        studyId,
        speciesNames,
        dateRange[0].toISOString(),
        dateRange[1].toISOString()
      )

      if (response.error) {
        console.error('Error fetching heatmap data:', response.error)
        return
      }

      setHeatmapData(response.data)
      console.log('Heatmap data:', response.data)
    }

    fetchData()

    // Cleanup function to cancel any pending throttled calls when component unmounts
    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current)
      }
    }
  }, [dateRange, topSpecies, actualStudyId, studyId, throttledFetchHeatmapData])

  const filteredTimeseriesData =
    timeseriesData && dateRange[0] && dateRange[1]
      ? timeseriesData.filter((day) => {
          const dayDate = new Date(day.date)
          return dayDate >= dateRange[0] && dayDate <= dateRange[1]
        })
      : []

  const filteredTopSpecies = topSpecies.map((species) => {
    const count = filteredTimeseriesData.reduce((sum, day) => {
      return sum + (day[species.scientificName] || 0)
    }, 0)
    return { ...species, filteredCount: count }
  })

  return (
    <div className="px-4 pb-4 flex flex-col h-[calc(100vh-4rem)]">
      {loading ? (
        <div className="py-4">Loading activity data...</div>
      ) : error ? (
        <div className="text-red-500 py-4">Error: {error}</div>
      ) : !timeseriesData || timeseriesData.length === 0 ? (
        <div className="text-gray-500 py-4">No activity data available</div>
      ) : (
        <div className="flex flex-col h-full gap-4">
          {/* First row - takes remaining space */}
          <div className="flex flex-row gap-4 flex-1 min-h-0">
            {/* Species Distribution - left side */}
            <div className="h-full overflow-auto w-xs">
              <SpeciesDistribution data={speciesDistributionData} taxonomicData={taxonomicData} />
            </div>

            {/* Map - right side */}
            <div className="h-full flex-1">
              {heatmapData && <SpeciesMap heatmapData={heatmapData} topSpecies={topSpecies} />}
            </div>
          </div>

          {/* Second row - fixed height with timeline */}
          <div className="w-full flex h-[140px] rounded px-2 border border-gray-200 flex-shrink-0">
            <TimelineChart
              timeseriesData={timeseriesData}
              topSpecies={topSpecies}
              dateRange={dateRange}
              setDateRange={setDateRange}
            />
          </div>
        </div>
      )}
    </div>
  )
}
