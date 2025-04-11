import { useNavigate } from 'react-router'

export default function Import({ onNewStudy }) {
  let navigate = useNavigate()

  const handleClassification = async () => {
    const { data, id } = await window.api.selectFolder()
    if (!id) return
    onNewStudy({ id, name: data.name, data })
    navigate(`/study/${id}`)
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col justify-around border-gray-200 border p-4 rounded-md w-96 gap-2">
        <h2 className="font-medium">Import</h2>
        <p className="text-sm text-gray-500">
          Select or drop a Camtrap DP folder. After importing, we will generate summary and
          visualsations.
        </p>
        <button
          onClick={handleClassification}
          className={`cursor-pointer transition-colors mt-8 flex justify-center flex-row gap-2 items-center border border-gray-200 px-2 h-10 text-sm shadow-sm rounded-md hover:bg-gray-50`}
        >
          Start Importing
        </button>
      </div>
    </div>
  )
}
