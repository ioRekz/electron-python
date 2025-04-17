import { contextBridge, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { getLocationsActivity } from '../main/queries'

// Custom APIs for renderer
const api = {
  getPort: async () => {
    return await electronAPI.ipcRenderer.invoke('get-port')
  },
  selectImage: async () => {
    console.log('electronAPI', electronAPI)
    return await electronAPI.ipcRenderer.invoke('select-image')
  },
  selectFolder: async () => {
    return await electronAPI.ipcRenderer.invoke('select-folder')
  },
  checkModelStatus: async () => {
    return await electronAPI.ipcRenderer.invoke('check-model-status')
  },
  downloadModel: async () => {
    return await electronAPI.ipcRenderer.invoke('download-model')
  },
  getSpeciesDistribution: async (studyId) => {
    return await electronAPI.ipcRenderer.invoke('get-species-distribution', studyId)
  },
  getDeployments: async (studyId) => {
    return await electronAPI.ipcRenderer.invoke('get-deployments', studyId)
  },
  importDroppedDirectory: async (path) => {
    return await electronAPI.ipcRenderer.invoke(
      'import-dropped-directory',
      webUtils.getPathForFile(path)
    )
  },
  showStudyContextMenu: async (studyId) => {
    return await electronAPI.ipcRenderer.invoke('show-study-context-menu', studyId)
  },
  deleteStudyDatabase: async (studyId) => {
    return await electronAPI.ipcRenderer.invoke('delete-study-database', studyId)
  },
  getDeploymentsActivity: async (studyId) => {
    return await electronAPI.ipcRenderer.invoke('get-deployments-activity', studyId)
  },
  getTopSpeciesTimeseries: async (studyId) => {
    return await electronAPI.ipcRenderer.invoke('get-top-species-timeseries', studyId)
  },
  getSpeciesHeatmapData: async (studyId, species, startDate, endDate) => {
    return await electronAPI.ipcRenderer.invoke(
      'get-species-heatmap-data',
      studyId,
      species,
      startDate,
      endDate
    )
  },
  getLocationsActivity: async (studyId) => {
    return await electronAPI.ipcRenderer.invoke('get-locations-activity', studyId)
  },
  getLatestMedia: async (studyId, limit = 10) => {
    return await electronAPI.ipcRenderer.invoke('get-latest-media', studyId, limit)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
