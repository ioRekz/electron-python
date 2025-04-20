import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LayersControl, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { useParams } from 'react-router'
import {
  CartesianGrid,
  Customized,
  Line,
  LineChart,
  Rectangle,
  ResponsiveContainer,
  XAxis,
  YAxis
} from 'recharts'
import CircularTimeFilter, { DailyActivityRadar } from './clock'

// TimelineChart component using Recharts
const TimelineChart = ({ timeseriesData, selectedSpecies, dateRange, setDateRange, palette }) => {
  const draggingRef = useRef(false)
  const resizingRef = useRef(null) // null, 'left', or 'right'
  const dragStartXRef = useRef(null)
  const initialRangeRef = useRef(null)
  const chartRef = useRef(null)

  console.log('dragging', draggingRef.current)

  // Format data for Recharts
  const formatData = useCallback(() => {
    if (!timeseriesData) return []

    return timeseriesData.map((day) => {
      const item = {
        date: new Date(day.date),
        displayDate: new Date(day.date).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: '2-digit'
        })
      }

      // Add data for each selected species
      selectedSpecies.forEach((species) => {
        item[species.scientificName] = day[species.scientificName] || 0
      })

      return item
    })
  }, [timeseriesData, selectedSpecies])

  const data = formatData()

  // Custom component for the selection rectangle
  const SelectionRangeRectangle = (props) => {
    const { height, margin, xAxisMap } = props

    if (!dateRange[0] || !dateRange[1] || !data || data.length === 0 || !xAxisMap) {
      console.log('No date range or data available')
      return null
    }

    // Use the xAxisMap scale function directly with actual Date objects
    const scale = xAxisMap ? xAxisMap[0].scale : null

    if (!scale) {
      console.log('No scale function available')
      return null
    }

    // Get the x positions using the scale function from xAxisMap with actual Date objects
    const x1 = scale(dateRange[0])
    const x2 = scale(dateRange[1])

    console.log('RECT positions', x1, x2, 'for dates', dateRange[0], dateRange[1])

    // Handle edge cases
    if (isNaN(x1) || isNaN(x2)) {
      console.log('Invalid x positions')
      return null
    }

    // Calculate width and get available height
    const rectWidth = Math.abs(x2 - x1)
    const rectHeight = height - margin.top - margin.bottom

    const handleMouseDown = (e, type) => {
      e.stopPropagation()
      e.preventDefault()

      if (type === 'move') {
        draggingRef.current = true
      } else {
        resizingRef.current = type
      }

      dragStartXRef.current = e.clientX
      initialRangeRef.current = [...dateRange]

      // Add global event listeners
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    console.log('rect', x1, x2, rectWidth, rectHeight)

    return (
      <g>
        {/* Main selection rectangle */}
        <Rectangle
          x={x1}
          y={margin.top}
          width={rectWidth}
          height={rectHeight}
          fill="rgba(0, 0, 255, 0.1)"
          stroke="rgba(0, 0, 255, 0.5)"
          onMouseDown={(e) => handleMouseDown(e, 'move')}
          style={{ cursor: 'move' }}
        />

        {/* Left resize handle */}
        <Rectangle
          x={x1}
          y={margin.top}
          width={5}
          height={rectHeight}
          fill="rgba(0, 0, 255, 0.2)"
          stroke="rgba(0, 0, 255, 0.7)"
          onMouseDown={(e) => handleMouseDown(e, 'left')}
          style={{ cursor: 'ew-resize' }}
        />

        {/* Right resize handle */}
        <Rectangle
          x={x1 + rectWidth - 5}
          y={margin.top}
          width={5}
          height={rectHeight}
          fill="rgba(0, 0, 255, 0.2)"
          stroke="rgba(0, 0, 255, 0.7)"
          onMouseDown={(e) => handleMouseDown(e, 'right')}
          style={{ cursor: 'ew-resize' }}
        />
      </g>
    )
  }

  const handleMouseMove = useCallback(
    (e) => {
      console.log('MOUSE MOVE', draggingRef.current, resizingRef.current, e.clientX)
      if (!draggingRef.current && !resizingRef.current) return
      console.log('Range', initialRangeRef.current, dragStartXRef.current, chartRef.current)
      if (!initialRangeRef.current || dragStartXRef.current === null || !chartRef.current) return

      const chartElement = chartRef.current
      console.log('CHART', chartElement)
      if (!chartElement) return

      console.log('client', e.clientX)

      const chartRect = chartElement.getBoundingClientRect()
      const deltaX = e.clientX - dragStartXRef.current
      const percentDelta = deltaX / chartRect.width

      console.log('DELTA', deltaX, percentDelta)

      // Calculate how many days that represents
      const timeRange = data[data.length - 1].date.getTime() - data[0].date.getTime()
      const daysDelta = Math.round((percentDelta * timeRange) / (24 * 60 * 60 * 1000))

      let newStartDate, newEndDate

      if (draggingRef.current) {
        // Move the entire selection
        newStartDate = new Date(
          initialRangeRef.current[0].getTime() + daysDelta * 24 * 60 * 60 * 1000
        )
        newEndDate = new Date(
          initialRangeRef.current[1].getTime() + daysDelta * 24 * 60 * 60 * 1000
        )

        console.log('NEW START', newStartDate)
        console.log('NEW END', newEndDate)

        // Make sure we don't go out of bounds
        if (newStartDate < data[0].date) {
          const adjustment = data[0].date.getTime() - newStartDate.getTime()
          newStartDate = new Date(data[0].date)
          newEndDate = new Date(newEndDate.getTime() + adjustment)
        }

        if (newEndDate > data[data.length - 1].date) {
          const adjustment = newEndDate.getTime() - data[data.length - 1].date.getTime()
          newEndDate = new Date(data[data.length - 1].date)
          newStartDate = new Date(newStartDate.getTime() - adjustment)
        }
      } else if (resizingRef.current === 'left') {
        // Resize from the left side
        newStartDate = new Date(
          initialRangeRef.current[0].getTime() + daysDelta * 24 * 60 * 60 * 1000
        )
        newEndDate = initialRangeRef.current[1]

        // Make sure start doesn't go beyond end or start of data
        newStartDate = new Date(
          Math.max(
            data[0].date.getTime(),
            Math.min(
              newStartDate.getTime(),
              initialRangeRef.current[1].getTime() - 24 * 60 * 60 * 1000
            )
          )
        )
      } else if (resizingRef.current === 'right') {
        // Resize from the right side
        newStartDate = initialRangeRef.current[0]
        newEndDate = new Date(
          initialRangeRef.current[1].getTime() + daysDelta * 24 * 60 * 60 * 1000
        )

        // Make sure end doesn't go before start or beyond end of data
        newEndDate = new Date(
          Math.min(
            data[data.length - 1].date.getTime(),
            Math.max(
              newEndDate.getTime(),
              initialRangeRef.current[0].getTime() + 24 * 60 * 60 * 1000
            )
          )
        )
      }

      console.log('NEW DATES', newStartDate, newEndDate)

      setDateRange([newStartDate, newEndDate])
    },
    [data, setDateRange]
  )

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false
    resizingRef.current = null
    dragStartXRef.current = null
    initialRangeRef.current = null

    // Remove global event listeners
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove])

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%" ref={chartRef}>
        <LineChart data={data} margin={{ top: 0, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            type="category"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tick={{ fontSize: 10 }}
            tickFormatter={(date) => {
              return date.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: '2-digit'
              })
            }}
            interval="preserveStartEnd"
            minTickGap={50}
            height={25}
          />
          <YAxis hide={true} />
          {/* <Tooltip content={<CustomTooltip />} /> */}

          {selectedSpecies.map((species, index) => (
            <Line
              key={species.scientificName}
              type="monotone"
              dataKey={species.scientificName}
              stroke={palette[index % palette.length]}
              dot={false}
              activeDot={{ r: 5 }}
              name={species.scientificName}
              fillOpacity={0.2}
              fill={palette[index % palette.length]}
            />
          ))}

          <Customized component={SelectionRangeRectangle} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// SpeciesMap component
const SpeciesMap = ({ heatmapData, selectedSpecies, palette, geoKey }) => {
  // Function to create a pie chart icon
  const createPieChartIcon = (counts) => {
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
    const size = Math.min(60, Math.max(10, Math.sqrt(total) * 3)) // Scale dot size based on count

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
      const colors = selectedSpecies.map((_, i) => palette[i % palette.length])

      // Use the same radius for pie slices as for the circle
      const radius = 50

      // Special case for single species - draw a full circle
      if (Object.keys(counts).length === 1) {
        const species = Object.keys(counts)[0]
        const index = selectedSpecies.findIndex((s) => s.scientificName === species)
        const colorIndex = index >= 0 ? index : 0
        const color = colors[colorIndex]

        const circle = document.createElementNS(svgNS, 'circle')
        circle.setAttribute('cx', '50')
        circle.setAttribute('cy', '50')
        circle.setAttribute('r', '50')
        circle.setAttribute('fill', color)
        svg.appendChild(circle)
      } else {
        // Multiple species - draw pie slices
        Object.entries(counts).forEach(([species, count]) => {
          const index = selectedSpecies.findIndex((s) => s.scientificName === species)
          if (index < 0) return // Skip if species not in selectedSpecies

          const portion = count / total
          const endAngle = startAngle + portion * 2 * Math.PI
          const color = colors[index]

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
    selectedSpecies.forEach((species) => {
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
      <LayersControl position="topright">
        <LayersControl.BaseLayer name="Street Map" checked={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="Satellite">
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        </LayersControl.BaseLayer>

        <LayersControl.Overlay name="Species Distribution" checked={true}>
          <MarkerClusterGroup
            key={geoKey}
            chunkedLoading
            showCoverageOnHover={false}
            spiderfyOnEveryZoom={false}
            maxClusterRadius={100}
            animateAddingMarkers={false}
            iconCreateFunction={(cluster) => {
              // Get all markers in this cluster
              const markers = cluster.getAllChildMarkers()

              // Combine counts from all markers
              const combinedCounts = {}

              // First, initialize counts for all selected species to ensure consistent ordering
              selectedSpecies.forEach((species) => {
                combinedCounts[species.scientificName] = 0
              })

              // Then add actual counts from markers
              markers.forEach((marker) => {
                Object.entries(marker.options.counts).forEach(([species, count]) => {
                  // Only add species that are in our selectedSpecies list
                  if (selectedSpecies.some((s) => s.scientificName === species)) {
                    combinedCounts[species] += count
                  }
                })
              })

              // Filter out species with zero counts to avoid empty slices
              const filteredCounts = Object.fromEntries(
                Object.entries(combinedCounts).filter(([, count]) => count > 0)
              )

              return createPieChartIcon(filteredCounts)
            }}
          >
            {locationPoints.map((point, index) => (
              <Marker
                key={index}
                position={[point.lat, point.lng]}
                icon={createPieChartIcon(point.counts)}
                counts={point.counts}
              >
                <Popup>
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
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </LayersControl.Overlay>

        {/* Add a legend */}
        <div className="absolute bottom-5 right-5 bg-white p-2 rounded shadow-md z-[1000]">
          {selectedSpecies.map((species, index) => (
            <div key={index} className="flex items-center space-x-2 space-y-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: palette[index % palette.length] }}
              ></div>
              <span className="text-xs">{species.scientificName}</span>
            </div>
          ))}
        </div>
      </LayersControl>
    </MapContainer>
  )
}

function SpeciesDistribution({ data, taxonomicData, selectedSpecies, onSpeciesChange, palette }) {
  const [commonNames, setCommonNames] = useState({})

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
    }

    fetchMissingCommonNames()
  }, [data, taxonomicData])

  // Handle toggling species selection when clicking on the dot
  const handleSpeciesToggle = (species) => {
    // Find if this species is already selected
    const isSelected = selectedSpecies.some((s) => s.scientificName === species.scientificName)

    let newSelectedSpecies
    if (isSelected) {
      // Remove from selection
      newSelectedSpecies = selectedSpecies.filter(
        (s) => s.scientificName !== species.scientificName
      )
    } else {
      // Add to selection
      newSelectedSpecies = [...selectedSpecies, species]
    }

    // Make sure we always have at least one species selected
    if (newSelectedSpecies.length > 0) {
      onSpeciesChange(newSelectedSpecies)
    }
  }

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

          const isSelected = selectedSpecies.some(
            (s) => s.scientificName === species.scientificName
          )
          const colorIndex = selectedSpecies.findIndex(
            (s) => s.scientificName === species.scientificName
          )
          const color = colorIndex >= 0 ? palette[colorIndex % palette.length] : '#ccc'

          return (
            <div
              key={index}
              className="cursor-pointer group"
              onClick={() => handleSpeciesToggle(species)}
            >
              <div className="flex justify-between mb-1 items-center cursor-pointer">
                <div className="flex items-center cursor-pointer">
                  <div
                    className={`w-2 h-2 rounded-full mr-2 border cursor-pointer ${isSelected ? `border-transparent bg-[${color}]` : 'border-gray-300'} group-hover:bg-gray-800 `}
                    style={{
                      backgroundColor: isSelected ? color : null
                    }}
                  ></div>

                  <span className="capitalize text-sm">{commonName}</span>
                  {species.scientificName && (
                    <span className="text-gray-500 text-sm italic ml-2">
                      {species.scientificName}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">{species.count}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${(species.count / totalCount) * 100}%`,
                    backgroundColor: isSelected ? color : '#ccc'
                  }}
                ></div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const palette = [
  'hsl(173 58% 39%)',
  'hsl(43 74% 66%)',
  'hsl(12 76% 61%)',
  'hsl(197 37% 24%)',
  'hsl(27 87% 67%)'
]

export default function Activity({ studyData, studyId }) {
  const { id } = useParams()
  const actualStudyId = studyId || id // Use passed studyId or from params

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedSpecies, setSelectedSpecies] = useState([])
  const [dateRange, setDateRange] = useState([null, null])
  const [timeRange, setTimeRange] = useState({ start: 0, end: 24 })
  const [timeseriesData, setTimeseriesData] = useState(null)
  const [heatmapData, setHeatmapData] = useState(null)
  const [speciesDistributionData, setSpeciesDistributionData] = useState(null)
  const [dailyActivityData, setDailyActivityData] = useState(null)

  // Get taxonomic data from studyData
  const taxonomicData = studyData?.taxonomic || null

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

          // Default select the top 2 species
          setSelectedSpecies(response.data.allSpecies.slice(0, 2))
        }

        if (speciesResponse.error) {
          console.error('Error fetching species distribution:', speciesResponse.error)
        } else {
          setSpeciesDistributionData(speciesResponse.data)
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
    async function fetchTimeseriesData() {
      if (!selectedSpecies.length || !actualStudyId) return

      try {
        const speciesNames = selectedSpecies.map((s) => s.scientificName)
        const response = await window.api.getSpeciesTimeseries(actualStudyId, speciesNames)

        if (response.error) {
          console.error('Error fetching species timeseries:', response.error)
          return
        }

        setTimeseriesData(response.data.timeseries)
      } catch (err) {
        console.error('Failed to fetch species timeseries:', err)
      }
    }

    fetchTimeseriesData()
  }, [selectedSpecies, actualStudyId])

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
    async function fetchHeatmapData() {
      if (!selectedSpecies.length || !dateRange[0] || !dateRange[1]) return

      const speciesNames = selectedSpecies.map((s) => s.scientificName)
      const response = await window.api.getSpeciesHeatmapData(
        studyId,
        speciesNames,
        dateRange[0].toISOString(),
        dateRange[1].toISOString(),
        timeRange.start,
        timeRange.end
      )

      if (response.error) {
        console.error('Error fetching heatmap data:', response.error)
        return
      }

      setHeatmapData(response.data)
    }

    fetchHeatmapData()
  }, [dateRange, timeRange, selectedSpecies, actualStudyId, studyId])

  useEffect(() => {
    async function fetchDailyActivityData() {
      if (!selectedSpecies.length || !dateRange[0] || !dateRange[1]) return

      try {
        const speciesNames = selectedSpecies.map((s) => s.scientificName)
        const response = await window.api.getSpeciesDailyActivity(
          actualStudyId,
          speciesNames,
          dateRange[0].toISOString(),
          dateRange[1].toISOString()
        )

        if (response.error) {
          console.error('Error fetching daily activity data:', response.error)
          return
        }

        setDailyActivityData(response.data)
      } catch (err) {
        console.error('Failed to fetch daily activity data:', err)
      }
    }

    fetchDailyActivityData()
  }, [dateRange, selectedSpecies, actualStudyId])

  // Handle time range changes
  const handleTimeRangeChange = useCallback((newTimeRange) => {
    setTimeRange(newTimeRange)
  }, [])

  // Handle species selection changes
  const handleSpeciesChange = useCallback((newSelectedSpecies) => {
    // Ensure we have at least one species selected
    if (newSelectedSpecies.length === 0) {
      return
    }
    setSelectedSpecies(newSelectedSpecies)
  }, [])

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

            {/* Map - right side */}
            <div className="h-full flex-1">
              {heatmapData && (
                <SpeciesMap
                  heatmapData={heatmapData}
                  selectedSpecies={selectedSpecies}
                  palette={palette}
                  geoKey={selectedSpecies + ' ' + dateRange + ' ' + timeRange}
                />
              )}
            </div>
            <div className="h-full overflow-auto w-xs">
              <SpeciesDistribution
                data={speciesDistributionData}
                taxonomicData={taxonomicData}
                selectedSpecies={selectedSpecies}
                onSpeciesChange={handleSpeciesChange}
                palette={palette}
              />
            </div>
          </div>

          {/* Second row - fixed height with timeline and clock */}
          <div className="w-full flex h-[130px] flex-shrink-0 gap-3">
            <div className="w-[140px] h-full rounded border border-gray-200 flex items-center justify-center relative">
              <DailyActivityRadar
                activityData={dailyActivityData}
                selectedSpecies={selectedSpecies}
                palette={palette}
                timeRange={timeRange}
                onChange={handleTimeRangeChange}
              />
              <div className="absolute w-full h-full flex items-center justify-center">
                <CircularTimeFilter
                  onChange={handleTimeRangeChange}
                  startTime={timeRange.start}
                  endTime={timeRange.end}
                />
              </div>
            </div>
            <div className="flex-grow rounded px-2 border border-gray-200">
              <TimelineChart
                timeseriesData={timeseriesData}
                selectedSpecies={selectedSpecies}
                dateRange={dateRange}
                setDateRange={setDateRange}
                palette={palette}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
