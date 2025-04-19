import { useState, useEffect, useRef } from 'react'

const CircularTimeFilter = ({ onChange, startTime = 6, endTime = 18 }) => {
  const [isDraggingStart, setIsDraggingStart] = useState(false)
  const [isDraggingEnd, setIsDraggingEnd] = useState(false)
  const [isDraggingArc, setIsDraggingArc] = useState(false)
  const [start, setStart] = useState(startTime)
  const [end, setEnd] = useState(endTime)
  const [lastDragPosition, setLastDragPosition] = useState(null)
  const svgRef = useRef(null)
  const radius = 40
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
      return `M ${center.x} ${center.y - radius}
              A ${radius} ${radius} 0 1 1 ${center.x - 0.1} ${center.y - radius}`
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

    return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`
  }

  const formatTime = (time) => {
    const hours = Math.floor(time)
    const minutes = Math.round((time - hours) * 60)
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col items-center">
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
              {isMajor && (
                <text
                  x={center.x + (radius - 12) * Math.cos((angle - 90) * (Math.PI / 180))}
                  y={center.y + (radius - 12) * Math.sin((angle - 90) * (Math.PI / 180))}
                  fontSize="10"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#4b5563"
                >
                  {i}
                </text>
              )}
            </g>
          )
        })}

        <path
          d={createArc(timeToAngle(start), timeToAngle(end))}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          cursor="pointer"
          onMouseDown={handleMouseDown('arc')}
        />

        <circle
          cx={startCoord.x}
          cy={startCoord.y}
          r="4"
          fill="#3b82f6"
          cursor="pointer"
          onMouseDown={handleMouseDown('start')}
        />

        <circle
          cx={endCoord.x}
          cy={endCoord.y}
          r="4"
          fill="#3b82f6"
          cursor="pointer"
          onMouseDown={handleMouseDown('end')}
        />
      </svg>
    </div>
  )
}

export default CircularTimeFilter
