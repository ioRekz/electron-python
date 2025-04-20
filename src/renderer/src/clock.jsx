import { useState, useEffect, useRef } from 'react'
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  Customized
} from 'recharts'

const CircularTimeFilter = ({ onChange, startTime = 6, endTime = 18 }) => {
  const [isDraggingStart, setIsDraggingStart] = useState(false)
  const [isDraggingEnd, setIsDraggingEnd] = useState(false)
  const [isDraggingArc, setIsDraggingArc] = useState(false)
  const [start, setStart] = useState(startTime)
  const [end, setEnd] = useState(endTime)
  const [lastDragPosition, setLastDragPosition] = useState(null)
  const svgRef = useRef(null)
  const radius = 47
  const padding = 8 // Add padding to prevent elements from being cut off
  const svgSize = radius * 2 + padding * 2 // Increase SVG size to accommodate padding
  const center = { x: radius + padding, y: radius + padding } // Adjust center coordinates

  useEffect(() => {
    onChange({ start, end })
  }, [start, end, onChange])

  const isFullDayRange = () => {
    return Math.abs(end - start) >= 23.9 || start === end
  }

  const angleToTime = (angle) => {
    let time = (angle / 15) % 24
    return time
  }

  const timeToAngle = (time) => {
    return (time * 15) % 360
  }

  const angleToCoordinates = (angle) => {
    const radians = (angle - 90) * (Math.PI / 180)
    return {
      x: center.x + radius * Math.cos(radians),
      y: center.y + radius * Math.sin(radians)
    }
  }

  const handleMouseDown = (handle) => (e) => {
    if (handle === 'start') {
      setIsDraggingStart(true)
    } else if (handle === 'end') {
      setIsDraggingEnd(true)
    } else if (handle === 'arc') {
      setIsDraggingArc(true)

      const svgRect = svgRef.current.getBoundingClientRect()
      const x = e.clientX - svgRect.left - center.x
      const y = e.clientY - svgRect.top - center.y

      let angle = Math.atan2(y, x) * (180 / Math.PI) + 90
      if (angle < 0) angle += 360

      setLastDragPosition(angle)
    }
  }

  const handleMouseMove = (e) => {
    if (!isDraggingStart && !isDraggingEnd && !isDraggingArc) return

    const svgRect = svgRef.current.getBoundingClientRect()
    const x = e.clientX - svgRect.left - center.x
    const y = e.clientY - svgRect.top - center.y

    let angle = Math.atan2(y, x) * (180 / Math.PI) + 90
    if (angle < 0) angle += 360

    if (isDraggingStart) {
      setStart(angleToTime(angle))
    } else if (isDraggingEnd) {
      setEnd(angleToTime(angle))
    } else if (isDraggingArc) {
      if (lastDragPosition !== null) {
        let angleDiff = angle - lastDragPosition

        if (angleDiff > 180) angleDiff -= 360
        if (angleDiff < -180) angleDiff += 360

        const timeDiff = angleDiff / 15

        let newStart = (start + timeDiff) % 24
        let newEnd = (end + timeDiff) % 24

        if (newStart < 0) newStart += 24
        if (newEnd < 0) newEnd += 24

        setStart(newStart)
        setEnd(newEnd)
      }

      setLastDragPosition(angle)
    }
  }

  const handleMouseUp = () => {
    setIsDraggingStart(false)
    setIsDraggingEnd(false)
    setIsDraggingArc(false)
    setLastDragPosition(null)
  }

  useEffect(() => {
    if (isDraggingStart || isDraggingEnd || isDraggingArc) {
      window.addEventListener('mouseup', handleMouseUp)
      window.addEventListener('mousemove', handleMouseMove)
    }

    return () => {
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [isDraggingStart, isDraggingEnd, isDraggingArc, lastDragPosition])

  const startCoord = angleToCoordinates(timeToAngle(start))
  const endCoord = angleToCoordinates(timeToAngle(end))

  const createArc = (startAngle, endAngle) => {
    if (isFullDayRange()) {
      // For full day range, create a complete circle
      return `M ${center.x} ${center.y}
              L ${center.x} ${center.y - radius}
              A ${radius} ${radius} 0 1 1 ${center.x - 0.1} ${center.y - radius}
              Z`
    }

    const startRad = (startAngle - 90) * (Math.PI / 180)
    const endRad = (endAngle - 90) * (Math.PI / 180)

    let largeArcFlag
    if (startAngle <= endAngle) {
      largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1
    } else {
      largeArcFlag = 360 - startAngle + endAngle <= 180 ? 0 : 1
    }

    const startX = center.x + radius * Math.cos(startRad)
    const startY = center.y + radius * Math.sin(startRad)
    const endX = center.x + radius * Math.cos(endRad)
    const endY = center.y + radius * Math.sin(endRad)

    // Create a pie section by starting at center, moving to arc start,
    // drawing the arc, then closing back to center
    return `M ${center.x} ${center.y}
            L ${startX} ${startY}
            A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}
            Z`
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
      <svg
        className="select-none"
        width={svgSize}
        height={svgSize}
        onMouseMove={handleMouseMove}
        ref={svgRef}
      >
        <circle cx={center.x} cy={center.y} r={radius} fill="none" stroke="#ddd" strokeWidth="2" />

        {Array.from({ length: 24 }).map((_, i) => {
          const angle = timeToAngle(i)
          const coord = angleToCoordinates(angle)
          const isMajor = i % 6 === 0

          return (
            <g key={i}>
              <line
                x1={
                  isMajor
                    ? center.x + (radius - 5) * Math.cos((angle - 90) * (Math.PI / 180))
                    : coord.x
                }
                y1={
                  isMajor
                    ? center.y + (radius - 5) * Math.sin((angle - 90) * (Math.PI / 180))
                    : coord.y
                }
                x2={coord.x}
                y2={coord.y}
                stroke={isMajor ? '#aaa' : '#9ca3af'}
                strokeWidth={isMajor ? 2 : 1}
              />
            </g>
          )
        })}

        <path
          d={createArc(timeToAngle(start), timeToAngle(end))}
          fill="rgba(0,0,255,0.1)"
          // fillOpacity="0.1"
          stroke="#8484f0"
          strokeWidth="2"
          cursor="pointer"
          onMouseDown={handleMouseDown('arc')}
        />

        <circle
          cx={startCoord.x}
          cy={startCoord.y}
          r="4"
          fill="#8484f0"
          cursor="pointer"
          onMouseDown={handleMouseDown('start')}
        />

        <circle
          cx={endCoord.x}
          cy={endCoord.y}
          r="4"
          fill="#8484f0"
          cursor="pointer"
          onMouseDown={handleMouseDown('end')}
        />
      </svg>
    </div>
  )
}

// New component for species daily activity visualization
const DailyActivityRadar = ({ activityData, selectedSpecies, palette, timeRangez, onChange }) => {
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartAngle, setDragStartAngle] = useState(null)
  const [isResizing, setIsResizing] = useState(null) // 'start' or 'end' or null
  const [initialTimeRange, setInitialTimeRange] = useState(null)
  const chartRef = useRef(null)

  const timeRange = { start: 6, end: 18 } // Default time range

  // Convert the activity data to a format suitable for the radar chart
  const formatData = (data) => {
    if (!data || !data.length) {
      return Array(24)
        .fill()
        .map((_, i) => ({
          hour: i,
          name: `${i}:00`
        }))
    }

    return data.map((hourData) => ({
      ...hourData,
      name: `${hourData.hour}:00`
    }))
  }

  const formattedData = formatData(activityData)

  // Custom tooltip to show hour and values
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-2 shadow-md text-xs border border-gray-200 rounded">
          <p className="font-bold">{payload[0].payload.name}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {entry.value} obs
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  // Show selected time range visually
  const isTimeInRange = (hour) => {
    if (timeRange.start <= timeRange.end) {
      return hour >= timeRange.start && hour < timeRange.end
    } else {
      // Handle overnight ranges (e.g. 22:00 - 6:00)
      return hour >= timeRange.start || hour < timeRange.end
    }
  }

  // Handle mouse down on the chart
  const handleMouseDown = (e, type, angle = null) => {
    e.stopPropagation()
    e.preventDefault()

    if (type === 'move') {
      setIsDragging(true)
    } else if (type === 'start' || type === 'end') {
      setIsResizing(type)
    }

    setInitialTimeRange({ ...timeRange })
    setDragStartAngle(angle)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Handle mouse move during dragging
  const handleMouseMove = (e) => {
    if (!isDragging && !isResizing) return
    if (!chartRef.current) return

    const svgElement = chartRef.current.querySelector('svg')
    if (!svgElement) return

    const rect = svgElement.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    // Calculate angle from center to current mouse position
    const dx = e.clientX - centerX
    const dy = e.clientY - centerY
    const mouseAngle = (Math.atan2(dy, dx) * 180) / Math.PI
    const normalizedAngle = (mouseAngle + 90 + 360) % 360

    // Convert angle to hours (0-24)
    const currentHour = normalizedAngle / 15

    if (isResizing === 'start') {
      onChange({ start: currentHour, end: timeRange.end })
    } else if (isResizing === 'end') {
      onChange({ start: timeRange.start, end: currentHour })
    } else if (isDragging && dragStartAngle !== null) {
      // Calculate difference in hours
      const angleDiff = normalizedAngle - dragStartAngle
      const hourDiff = angleDiff / 15

      // Apply the difference to both start and end
      let newStart = (initialTimeRange.start + hourDiff) % 24
      let newEnd = (initialTimeRange.end + hourDiff) % 24

      if (newStart < 0) newStart += 24
      if (newEnd < 0) newEnd += 24

      onChange({ start: newStart, end: newEnd })
    }
  }

  // Handle mouse up to end dragging
  const handleMouseUp = () => {
    setIsDragging(false)
    setIsResizing(null)
    setDragStartAngle(null)
    setInitialTimeRange(null)

    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  // TimeRangeOverlay - uses Recharts coordinate system
  const TimeRangeOverlay = (props) => {
    const { cx, cy, innerRadius, outerRadius, angleAxisMap } = props

    if (!angleAxisMap || !angleAxisMap[0]) {
      return null
    }

    const scale = angleAxisMap[0].scale

    console.log('Angle Axis Map:', angleAxisMap)

    // Convert hours to angles using the Recharts scale
    const startAngle = scale(timeRange.start * 15) - 90
    const endAngle = scale(timeRange.end * 15) - 90

    console.log('Start Angle:', startAngle)

    // Calculate the path for the selection arc
    const createArc = () => {
      // Use outerRadius (from Recharts) for consistent sizing
      const radius = outerRadius - 2 // Slightly smaller than outer edge

      // If it's a full day selection, draw a complete circle
      if (Math.abs(timeRange.end - timeRange.start) >= 23.9 || timeRange.start === timeRange.end) {
        return `M ${cx} ${cy - radius}
                A ${radius} ${radius} 0 1 1 ${cx - 0.1} ${cy - radius}`
      }

      const startRad = startAngle * (Math.PI / 180)
      const endRad = endAngle * (Math.PI / 180)

      const startX = cx + radius * Math.cos(startRad)
      const startY = cy + radius * Math.sin(startRad)
      const endX = cx + radius * Math.cos(endRad)
      const endY = cy + radius * Math.sin(endRad)

      // Determine if we need to draw the arc clockwise or counter-clockwise
      let largeArcFlag
      if (timeRange.start <= timeRange.end) {
        largeArcFlag = timeRange.end - timeRange.start > 12 ? 1 : 0
      } else {
        largeArcFlag = 24 - timeRange.start + timeRange.end > 12 ? 1 : 0
      }

      return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`
    }

    // Calculate handle positions
    const startRad = startAngle * (Math.PI / 180)
    const endRad = endAngle * (Math.PI / 180)
    const handleRadius = outerRadius - 2

    const startX = cx + handleRadius * Math.cos(startRad)
    const startY = cy + handleRadius * Math.sin(startRad)
    const endX = cx + handleRadius * Math.cos(endRad)
    const endY = cy + handleRadius * Math.sin(endRad)

    // Calculate label positions, offset slightly from handles
    const labelRadius = outerRadius + 8
    const startLabelX = cx + labelRadius * Math.cos(startRad)
    const startLabelY = cy + labelRadius * Math.sin(startRad)
    const endLabelX = cx + labelRadius * Math.cos(endRad)
    const endLabelY = cy + labelRadius * Math.sin(endRad)

    // Function to get initial angle for dragging
    const getInitialAngle = (angle) => {
      return (angle + 90) % 360
    }

    return (
      <g className="time-range-overlay">
        {/* Arc between start and end */}
        <path
          d={createArc()}
          stroke="rgba(59, 130, 246, 0.7)"
          strokeWidth="3"
          fill="none"
          style={{ cursor: 'move' }}
          onMouseDown={(e) => handleMouseDown(e, 'move', getInitialAngle(startAngle))}
        />

        {/* Start handle */}
        <circle
          cx={startX}
          cy={startY}
          r="4"
          fill="rgb(59, 130, 246)"
          stroke="white"
          strokeWidth="1"
          style={{ cursor: 'pointer' }}
          onMouseDown={(e) => handleMouseDown(e, 'start', getInitialAngle(startAngle))}
        />

        {/* End handle */}
        <circle
          cx={endX}
          cy={endY}
          r="4"
          fill="rgb(59, 130, 246)"
          stroke="white"
          strokeWidth="1"
          style={{ cursor: 'pointer' }}
          onMouseDown={(e) => handleMouseDown(e, 'end', getInitialAngle(endAngle))}
        />

        {/* Display time labels */}
        <text
          x={startLabelX}
          y={startLabelY}
          fontSize="9"
          fill="rgb(59, 130, 246)"
          textAnchor="middle"
          dominantBaseline="middle"
          fontWeight="bold"
        >
          {Math.floor(timeRange.start)}h
        </text>

        <text
          x={endLabelX}
          y={endLabelY}
          fontSize="9"
          fill="rgb(59, 130, 246)"
          textAnchor="middle"
          dominantBaseline="middle"
          fontWeight="bold"
        >
          {Math.floor(timeRange.end)}h
        </text>
      </g>
    )
  }

  return (
    <>
      <div className="relative w-full h-full" ref={chartRef}>
        {/* Hour labels with hardcoded positions */}
        <div className="absolute w-full h-full pointer-events-none">
          <div className="absolute top-0.5 left-1/2 transform -translate-x-1/2  text-[10px] text-gray-400">
            0h
          </div>
          <div className="absolute top-1/2 right-1 transform -translate-y-1/2 text-[10px] text-gray-400">
            6h
          </div>
          <div className="absolute bottom-0.5 left-1/2 transform -translate-x-1/2 text-[10px] text-gray-400">
            12h
          </div>
          <div className="absolute top-1/2 left-0.5 transform  -translate-y-1/2 text-[10px] text-gray-400">
            18h
          </div>
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={formattedData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <PolarGrid radialLines={false} polarRadius={[]} strokeWidth={1} />
            <PolarAngleAxis dataKey="name" tick={false} />
            {/* <PolarRadiusAxis
              angle={30}
              domain={[0, 'auto']}
              tick={false}
              axisLine={false}
              tickCount={5}
            /> */}
            {selectedSpecies.map((species, index) => (
              <Radar
                key={species.scientificName}
                name={species.scientificName}
                dataKey={species.scientificName}
                stroke={palette[index % palette.length]}
                fill={palette[index % palette.length]}
                fillOpacity={0.1}
                dot={false}
                activeDot={{ r: 5 }}
              />
            ))}
            <Tooltip content={<CustomTooltip />} />

            {/* Highlight the selected time range with Radar components */}
            {Array.from({ length: 24 }).map(
              (_, i) =>
                isTimeInRange(i) && (
                  <Radar
                    key={`timerange-${i}`}
                    dataKey={() => 0} // This creates an invisible radar
                    stroke="rgba(59, 130, 246, 0.3)"
                    strokeWidth={1}
                    fill="rgba(59, 130, 246, 0.1)"
                    fillOpacity={0.2}
                    isAnimationActive={false}
                  />
                )
            )}

            {/* Add the custom overlay with TimeRangeOverlay component */}
            {/* <Customized component={TimeRangeOverlay} /> */}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

// Export both components
export { CircularTimeFilter as default, DailyActivityRadar }
