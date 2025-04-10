import { contextBridge, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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
