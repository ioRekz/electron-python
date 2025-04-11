import { ChartBar, NotebookText, Camera } from 'lucide-react'
import { Route, Routes, NavLink, useParams } from 'react-router'
import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import ReactDOMServer from 'react-dom/server'

// Fix the default marker icon issue in react-leaflet
// This is needed because the CSS assets are not properly loaded
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png'
})

function DeploymentMap({ deployments, selectedDeployment, setSelectedDeployment }) {
  if (!deployments || deployments.length === 0) {
    return <div className="text-gray-500">No location data available for map</div>
  }

  const mapRef = useRef(null)

  useEffect(() => {
    if (mapRef.current && selectedDeployment) {
      mapRef.current.setView([parseFloat(selectedDeployment.latitude), parseFloat(selectedDeployment.longitude)], 13)
    }
  }, [selectedDeployment])

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
    <div className="w-full h-[400px] bg-white rounded border border-gray-200">
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [30, 30] }}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
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
            opacity={selectedDeployment?.deploymentID === deployment.deploymentID ? 1 : 0.5}
            zIndexOffset={selectedDeployment?.deploymentID === deployment.deploymentID ? 1000 : 0}
            eventHandlers={{
              click: () => {console.log('clicked', deployment.deploymentID); setSelectedDeployment(deployment)}
            }}
          >
            {/* <Popup>
              <div>
                <h3 className="font-medium">{deployment.locationName || 'Unnamed Location'}</h3>
                <p className="text-sm">
                  {formatDate(deployment.deploymentStart)} - {formatDate(deployment.deploymentEnd)}
                </p>
                <p className="text-xs text-gray-500">
                  Coordinates: {deployment.latitude}, {deployment.longitude}
                </p>
              </div>
            </Popup> */}
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}

function DeploymentsList({ activity, selectedDeployment, setSelectedDeployment }) {
  if (!activity.deployments || activity.deployments.length === 0) {
    return <div className="text-gray-500">No deployment data available</div>
  }

  useEffect(() => {
    if (selectedDeployment && selectedDeployment) {
      document.getElementById(selectedDeployment.deploymentID).scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [selectedDeployment])

  // Format date to a more readable format
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: '2-digit',
      month: 'short', 
      day: 'numeric'
    })
  }

  console.log('selectedDeployment', selectedDeployment,)

  return (
    <div className="w-full flex-1 overflow-y-auto">
      <div className="flex flex-col gap-2">
        <div className="ml-56 pl-6 flex justify-between text-sm text-gray-700">
          <span>{formatDate(activity.startDate)} </span>
          <span>{formatDate(activity.endDate)}</span>
        </div>
        <div className="flex flex-col divide-y divide-gray-200 mb-4">
        {activity.deployments.sort((a, b) => new Date(a.deploymentStart) - new Date(b.deploymentStart)).map((deployment) => (
          <div key={deployment.deploymentID} id={deployment.deploymentID} className="flex gap-4 items-center py-4 first:pt-1">
            <div className={`text-sm w-56 truncate text-gray-700 ${selectedDeployment?.deploymentID === deployment.deploymentID ? 'font-bold' : ''}`} onClick={() => setSelectedDeployment(deployment)}>
              {deployment.locationName || deployment.locationID || 'Unnamed Location'}
            </div>
            <div className="flex gap-2 flex-1">
            {deployment.periods.map((period) => (
              <div 
                key={period.start} 
                title={`${period.count} observations`}
                className="flex items-center justify-center aspect-square w-[5%]"
              >
                <div
                  className="rounded-full bg-emerald-500 aspect-square max-w-[25px]"
                  style={{
                    width: period.count > 0 ? `${Math.min((period.count / activity.percentile90Count) * 100, 100)}%` : '0%',
                    minWidth: period.count > 0 ? '4px' : '0px',
                  }}
                ></div>
              </div>
            ))}
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  )
}

export default function Deployments({ studyId }) {
  const [activity, setActivity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedDeployment, setSelectedDeployment] = useState(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)


        const activityResponse = await window.api.getDeploymentsActivity(studyId)
        console.log('Activity response:', activityResponse) 

        if (activityResponse.error) {
          console.error('Deployments error:', activityResponse.error)
          // Don't set main error if species data was successful
        } else {
          setActivity(activityResponse.data)
        }
      } catch (err) {
        setError(err.message || 'Failed to fetch data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [studyId])

  console.log('Activity data:', activity)

  return (
    <div className="flex flex-col gap-6 px-4 h-[calc(100vh-100px)]">
      
      {activity && <DeploymentMap deployments={activity.deployments} selectedDeployment={selectedDeployment} setSelectedDeployment={setSelectedDeployment} />}
      {activity && <DeploymentsList activity={activity} selectedDeployment={selectedDeployment} setSelectedDeployment={setSelectedDeployment} />}
    </div>
  )
}
