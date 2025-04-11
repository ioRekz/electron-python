import { ChartBar, NotebookText, Camera, CameraIcon, Cctv } from 'lucide-react'
import { Route, Routes, NavLink, useParams } from 'react-router'
import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import Deployments from './deployments'
import Overview from './overview'



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
          to={`/study/${id}/analysis`}
          className={({ isActive }) =>
            `${isActive ? 'bg-gray-100' : ''} cursor-pointer hover:bg-gray-100 transition-colors flex justify-center flex-row gap-2 items-center px-4 h-10 text-sm rounded-tl-md`
          }
        >
          <ChartBar color="black" size={20} className="pb-[2px]" />
          Analysis
        </NavLink>
        <NavLink
          to={`/study/${id}/deployments`}
          className={({ isActive }) =>
            `${isActive ? 'bg-gray-100' : ''} cursor-pointer hover:bg-gray-100 transition-colors flex justify-center flex-row gap-2 items-center px-4 h-10 text-sm rounded-tl-md`
          }
        >
          <Cctv color="black" size={20} className="pb-[2px]" />
          Deployments
        </NavLink>
      </header>
      <div className="flex-1 overflow-y-auto h-full">
      <Routes>
        <Route index element={<Overview data={study.data} studyId={id} />} />
        <Route path="analysis" element={<div>Analysis</div>} />
        <Route path="deployments" element={<Deployments studyId={id} />} />
      </Routes>
      </div>
    </div>
  )
}
