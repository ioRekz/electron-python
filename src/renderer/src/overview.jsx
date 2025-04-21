import { useEffect, useState, useRef } from 'react'
import ReactDOMServer from 'react-dom/server'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { Camera, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react'

function DeploymentMap({ deployments }) {
  if (!deployments || deployments.length === 0) {
    return <div className="text-gray-500">No location data available for map</div>
  }

  // Filter to include only deployments with valid coordinates
  const validDeployments = deployments.filter(
    (deployment) => deployment.latitude && deployment.longitude
  )

  if (validDeployments.length === 0) {
    return (
      <div className="text-gray-500">No valid geographic coordinates found for deployments</div>
    )
  }

  // Create bounds from all valid deployment coordinates
  const positions = validDeployments.map((deployment) => [
    parseFloat(deployment.latitude),
    parseFloat(deployment.longitude)
  ])

  // Create a bounds object that encompasses all markers
  const bounds = L.latLngBounds(positions)

  // Format date for popup display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  // Create camera icon as a custom marker
  const createCameraIcon = () => {
    const cameraIcon = ReactDOMServer.renderToString(
      <div className="camera-marker">
        <Camera color="#1E40AF" fill="#93C5FD" size={28} />
      </div>
    )

    return L.divIcon({
      html: cameraIcon,
      className: 'custom-camera-icon',
      iconSize: [18, 18],
      iconAnchor: [14, 14]
    })
  }

  // Create the camera icon outside of the map loop for better performance
  const cameraIcon = createCameraIcon()

  return (
    <div className="w-full h-full bg-white rounded border border-gray-200">
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [50, 50] }}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {validDeployments.map((deployment) => (
          <Marker
            key={deployment.deploymentID}
            position={[parseFloat(deployment.latitude), parseFloat(deployment.longitude)]}
            icon={cameraIcon}
          >
            <Popup>
              <div>
                <h3 className="font-medium">{deployment.locationName || 'Unnamed Location'}</h3>
                <p className="text-sm">
                  {formatDate(deployment.deploymentStart)} - {formatDate(deployment.deploymentEnd)}
                </p>
                <p className="text-xs text-gray-500">
                  Coordinates: {deployment.latitude}, {deployment.longitude}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}

// Export SpeciesDistribution so it can be imported in activity.jsx
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
    <div className="w-1/2 bg-white rounded border border-gray-200 p-3 overflow-y-auto">
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

export default function Overview({ data, studyId }) {
  const [speciesData, setSpeciesData] = useState(null)
  const [deploymentsData, setDeploymentsData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const contributorsRef = useRef(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)

        // Fetch both species and deployments data in parallel
        const [speciesResponse, deploymentsResponse] = await Promise.all([
          window.api.getSpeciesDistribution(studyId),
          window.api.getDeployments(studyId)
        ])

        // Check for errors
        if (speciesResponse.error) {
          setError(speciesResponse.error)
        } else {
          setSpeciesData(speciesResponse.data)
        }

        if (deploymentsResponse.error) {
          console.error('Deployments error:', deploymentsResponse.error)
          // Don't set main error if species data was successful
        } else {
          console.log('Deployments response:', deploymentsResponse)
          setDeploymentsData(deploymentsResponse.data)
        }
      } catch (err) {
        setError(err.message || 'Failed to fetch data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [studyId])

  // Check scroll possibility
  useEffect(() => {
    if (!contributorsRef.current) return

    const checkScroll = () => {
      const container = contributorsRef.current
      setCanScrollLeft(container.scrollLeft > 0)
      setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 5)
    }

    const container = contributorsRef.current
    container.addEventListener('scroll', checkScroll)
    // Initial check
    checkScroll()

    // Check again if window resizes
    window.addEventListener('resize', checkScroll)

    return () => {
      container?.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [data.contributors])

  const scrollContributors = (direction) => {
    if (!contributorsRef.current) return

    const container = contributorsRef.current
    const scrollAmount = container.clientWidth * 0.75 // Scroll by 75% of visible width

    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    })
  }

  const toggleDescription = () => {
    setIsDescriptionExpanded(!isDescriptionExpanded)
  }

  const taxonomicData = data.taxonomic || null

  return (
    <div className="flex flex-col px-4 gap-4">
      <header className="flex flex-col">
        <div className="flex gap-2">
          <a
            target="_blank"
            rel="noopener noreferrer"
            href={data.homepage}
            className="max-w-prose text-balance font-medium"
          >
            {data.title || data?.project?.title}
          </a>
        </div>
        <div className="text-gray-500 text-sm max-w-prose mb-2">
          {data.temporal.start} to {data.temporal.end}
        </div>
        {data.description && (
          <div className="relative">
            <div
              className={`text-gray-800 text-sm max-w-prose ${
                !isDescriptionExpanded ? 'line-clamp-5 overflow-hidden' : ''
              }`}
            >
              {data.description}
            </div>
            <button
              onClick={toggleDescription}
              className="text-gray-500 text-xs flex items-center hover:text-blue-700 transition-colors"
            >
              {isDescriptionExpanded ? (
                <>
                  <span>Show less</span>
                  <ChevronUp size={16} className="ml-1" />
                </>
              ) : (
                <>
                  <span>Show more</span>
                  <ChevronDown size={16} className="ml-1" />
                </>
              )}
            </button>
          </div>
        )}
      </header>

      {data.contributors && data.contributors.length > 0 && (
        <div className="relative">
          {/* Left scroll button */}
          {canScrollLeft && (
            <button
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 rounded-full p-1 shadow-md border border-gray-200"
              onClick={() => scrollContributors('left')}
              aria-label="Scroll left"
            >
              <ChevronLeft size={20} />
            </button>
          )}

          {/* Right scroll button */}
          {canScrollRight && (
            <button
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 rounded-full p-1 shadow-md border border-gray-200"
              onClick={() => scrollContributors('right')}
              aria-label="Scroll right"
            >
              <ChevronRight size={20} />
            </button>
          )}

          {/* Left fade effect */}
          {canScrollLeft && (
            <div className="absolute left-0 top-0 h-full w-12 bg-gradient-to-r from-white to-transparent z-[1] pointer-events-none"></div>
          )}

          {/* Right fade effect */}
          {canScrollRight && (
            <div className="absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-white to-transparent z-[1] pointer-events-none"></div>
          )}

          <div
            ref={contributorsRef}
            className="flex overflow-x-auto gap-4 scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {data.contributors.map((contributor, index) => (
              <div
                key={index}
                className="flex flex-col flex-shrink-0 w-64 p-4 border border-gray-200 rounded-md shadow-sm bg-white"
              >
                <div className="">
                  {contributor.title || `${contributor.firstName} ${contributor.lastName}`}
                </div>
                <div className="text-sm text-gray-600">
                  {contributor.role &&
                    contributor.role
                      .replace(/([A-Z])/g, ' $1')
                      .replace(/^./, (str) => str.toUpperCase())}
                </div>
                {contributor.organization && (
                  <div className="text-sm text-gray-500 mt-2 mb-2 line-clamp-2 overflow-hidden relative">
                    {contributor.organization}
                    <div className="absolute bottom-0 right-0 bg-gradient-to-l from-white to-transparent w-8 h-4"></div>
                  </div>
                )}
                {contributor.email && (
                  <div className="text-sm text-blue-500 mt-2 truncate mt-auto">
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      href={`mailto:${contributor.email}`}
                    >
                      {contributor.email}
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-4">Loading data...</div>
      ) : error ? (
        <div className="text-red-500 py-4">Error: {error}</div>
      ) : (
        <>
          <div className="flex flex-row gap-4 h-[450px] mt-4">
            <SpeciesDistribution data={speciesData} taxonomicData={taxonomicData} />
            <DeploymentMap deployments={deploymentsData} />
          </div>
        </>
      )}
    </div>
  )
}
