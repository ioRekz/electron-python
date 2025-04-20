import { useState, useEffect, useCallback } from 'react'
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption
} from '@headlessui/react'
import { CheckIcon } from 'lucide-react'
import CircularTimeFilter from './clock'

// Add the SpeciesFilter component
const SpeciesFilter = ({ speciesList, selectedSpecies, onChange }) => {
  const [query, setQuery] = useState('')

  const filteredSpecies =
    query === ''
      ? speciesList
      : speciesList.filter((item) =>
          item.scientificName.toLowerCase().includes(query.toLowerCase())
        )

  return (
    <div className="w-48 relative">
      <Combobox value={selectedSpecies} onChange={onChange} immediate>
        <div className="relative w-full cursor-default overflow-hidden rounded-lg bg-white text-left shadow-md border border-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-opacity-75 focus-visible:ring-offset-2 sm:text-sm">
          <ComboboxInput
            className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0 outline-none"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by species"
            displayValue={(species) => (species ? species.scientificName : 'All Species')}
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 text-gray-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9"
              />
            </svg>
          </ComboboxButton>
        </div>
        <ComboboxOptions className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm z-10">
          {filteredSpecies.map((species) => (
            <ComboboxOption
              key={species.scientificName}
              value={species}
              className="group flex cursor-default items-center gap-2 rounded-lg py-1.5 px-3 select-none data-[focus]:bg-gray-100"
            >
              <div className="text-sm/6 text-gray-800">
                {species.scientificName} ({species.count})
              </div>
              <CheckIcon className="ml-4 invisible size-4 fill-white group-data-[selected]:visible" />
            </ComboboxOption>
          ))}
        </ComboboxOptions>
      </Combobox>
    </div>
  )
}

export default function Media({ studyId, path }) {
  const [mediaFiles, setMediaFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState({ start: 0, end: 24 })
  const [selectedSpecies, setSelectedSpecies] = useState('')
  const [speciesList, setSpeciesList] = useState([])

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)

        // Get media files
        const mediaResponse = await window.api.getLatestMedia(studyId, 50)
        if (mediaResponse.error) {
          console.error('Failed to load media:', mediaResponse.error)
        } else {
          setMediaFiles(mediaResponse.data || [])
        }

        // Get species distribution
        const speciesResponse = await window.api.getSpeciesDistribution(studyId)
        if (speciesResponse.error) {
          console.error('Failed to load species:', speciesResponse.error)
        } else {
          setSpeciesList(speciesResponse.data || [])
        }

        setLoading(false)
      } catch (err) {
        console.error('Failed to load data:', err)
        setLoading(false)
      }
    }

    loadData()
  }, [studyId])

  const handleTimeRangeChange = useCallback(
    (range) => {
      setTimeRange(range)
    },
    [setTimeRange]
  )

  const handleSpeciesChange = useCallback(
    (species) => {
      setSelectedSpecies(species)
    },
    [setSelectedSpecies]
  )

  const constructImageUrl = (fullFilePath) => {
    console.log('fullFilePath', fullFilePath)
    if (fullFilePath.startsWith('http')) {
      return fullFilePath
    }
    const filePathParts = fullFilePath.split('/')
    const filePath = filePathParts.slice(1).join('/')
    const fullPath = `${path}/${filePath}`
    const urlPath = fullPath.replace(/\\/g, '/')

    return `local-file://get?path=${encodeURIComponent(urlPath)}`
  }

  const filteredMedia = mediaFiles.filter((media) => {
    // Filter by time
    const date = new Date(media.timestamp)
    const hours = date.getHours() + date.getMinutes() / 60

    const matchesTimeRange =
      timeRange.start <= timeRange.end
        ? hours >= timeRange.start && hours <= timeRange.end
        : hours >= timeRange.start || hours <= timeRange.end

    // Filter by species
    const matchesSpecies =
      !selectedSpecies || media.scientificName === selectedSpecies.scientificName

    return matchesTimeRange && matchesSpecies
  })

  return (
    <div className="flex flex-col gap-6 px-4 h-[calc(100vh-100px)] pb-4">
      <div className="flex gap-4 items-center">
        <SpeciesFilter
          speciesList={speciesList}
          selectedSpecies={selectedSpecies}
          onChange={handleSpeciesChange}
        />
        <CircularTimeFilter onChange={handleTimeRangeChange} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
        {loading ? (
          <div className="col-span-full text-center py-4">Loading media files...</div>
        ) : filteredMedia.length === 0 ? (
          <div className="col-span-full text-center py-4">
            {mediaFiles.length === 0
              ? 'No media files found'
              : 'No media files match the selected filters'}
          </div>
        ) : (
          filteredMedia.map((media) => (
            <div key={media.mediaID} className="border border-gray-300 rounded-lg overflow-hidden">
              <div className="bg-gray-100 flex items-center justify-center">
                <img
                  src={constructImageUrl(media.filePath)}
                  alt={media.fileName || `Media ${media.mediaID}`}
                  className="object-cover w-full h-full"
                />
              </div>
              <div className="p-2">
                <h3 className="text-sm font-semibold truncate">{media.scientificName}</h3>
                <p className="text-xs text-gray-500">
                  {new Date(media.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
