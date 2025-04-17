import 'leaflet/dist/leaflet.css'
import { Cctv, ChartBar, Image, NotebookText } from 'lucide-react'
import { NavLink, Route, Routes, useParams } from 'react-router'
import Deployments from './deployments'
import Overview from './overview'
import Activity from './activity'
import Media from './media'

export default function Study() {
  let { id } = useParams()
  const study = JSON.parse(localStorage.getItem('studies')).find((study) => study.id === id)
  console.log('S', study)
  return (
    <div className="flex gap-4 flex-col h-full">
      <header className="w-full flex border-b border-gray-200 divide-gray-200 divide-x sticky top-0 bg-white z-10 rounded-tl-md rounded-tr-md">
        <NavLink
          to={`/study/${id}`}
          end
          className={({ isActive }) =>
            `${isActive ? 'bg-gray-100' : ''} hover:bg-gray-100 transition-colors flex justify-center flex-row gap-2 items-center px-4 h-10 text-sm rounded-tl-md`
          }
        >
          <NotebookText color="black" size={20} className="pb-[2px]" />
          Overview
        </NavLink>
        <NavLink
          to={`/study/${id}/activity`}
          className={({ isActive }) =>
            `${isActive ? 'bg-gray-100' : ''} cursor-pointer hover:bg-gray-100 transition-colors flex justify-center flex-row gap-2 items-center px-4 h-10 text-sm`
          }
        >
          <ChartBar color="black" size={20} className="pb-[2px]" />
          Activity
        </NavLink>
        <NavLink
          to={`/study/${id}/deployments`}
          className={({ isActive }) =>
            `${isActive ? 'bg-gray-100' : ''} cursor-pointer hover:bg-gray-100 transition-colors flex justify-center flex-row gap-2 items-center px-4 h-10 text-sm`
          }
        >
          <Cctv color="black" size={20} className="pb-[2px]" />
          Deployments
        </NavLink>
        <NavLink
          to={`/study/${id}/media`}
          className={({ isActive }) =>
            `${isActive ? 'bg-gray-100' : ''} cursor-pointer hover:bg-gray-100 transition-colors flex justify-center flex-row gap-2 items-center px-4 h-10 text-sm rounded-tr-md`
          }
        >
          <Image color="black" size={20} className="pb-[2px]" />
          Media
        </NavLink>
      </header>
      <div className="flex-1 overflow-y-auto h-full pb-4">
        <Routes>
          <Route index element={<Overview data={study.data} studyId={id} />} />
          <Route path="activity" element={<Activity studyData={study.data} studyId={id} />} />
          <Route path="deployments" element={<Deployments studyId={id} />} />
          <Route path="media" element={<Media studyId={id} path={study.path} />} />
        </Routes>
      </div>
    </div>
  )
}
