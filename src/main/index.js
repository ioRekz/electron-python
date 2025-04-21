import { app, shell, BrowserWindow, ipcMain, protocol, dialog } from 'electron'
import { net as electronNet } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { spawn } from 'child_process'
import {
  readdirSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  chmodSync,
  accessSync,
  constants,
  createWriteStream,
  statSync
} from 'fs'
import log from 'electron-log'
import net from 'net'
import path from 'path'
import { pipeline } from 'stream/promises'
import { importCamTrapDataset } from './camtrap'
import {
  getSpeciesDistribution,
  getDeployments,
  getDeploymentsActivity,
  getTopSpeciesTimeseries,
  getSpeciesTimeseries,
  getSpeciesHeatmapData,
  getLocationsActivity,
  getMedia,
  getSpeciesDailyActivity
} from './queries'
import { autoUpdater } from 'electron-updater'

// Configure electron-log
log.transports.file.level = 'info'
log.transports.console.level = 'info'

let pythonProcess = null
let serverPort = null

autoUpdater.logger = log
autoUpdater.checkForUpdatesAndNotify()

function findFreePort() {
  return new Promise((resolve, reject) => {
    log.info('Finding free port...')
    const server = net.createServer()
    server.listen(0, () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

async function extractTarGz(tarPath, extractPath) {
  // Check if extraction directory already exists and contains files
  log.info(`Checking extraction directory at ${extractPath}`, existsSync(extractPath))
  if (existsSync(extractPath)) {
    try {
      const files = readdirSync(extractPath)
      if (files.length > 0 && files.includes('env')) {
        log.info(
          `Extraction directory already exists with content at ${extractPath}, skipping extraction`
        )
        return extractPath
      }
    } catch (error) {
      log.warn(`Error checking extraction directory: ${error}`)
    }
  }

  log.info(`Extracting ${tarPath} to ${extractPath}`)

  if (!existsSync(extractPath)) {
    mkdirSync(extractPath, { recursive: true })
  }

  return new Promise((resolve, reject) => {
    const startTime = Date.now()

    // Use native tar command - works on macOS, Linux, and modern Windows
    const tarProcess = spawn('tar', ['-xzf', tarPath, '-C', extractPath])

    tarProcess.stdout.on('data', (data) => {
      log.info(`tar output: ${data}`)
    })

    tarProcess.stderr.on('data', (data) => {
      // Not necessarily an error, tar outputs progress to stderr
      log.info(`tar progress: ${data}`)
    })

    tarProcess.on('error', (err) => {
      log.error(`Error executing tar command:`, err)
      reject(err)
    })

    tarProcess.on('close', (code) => {
      const duration = (Date.now() - startTime) / 1000
      if (code === 0) {
        log.info(`Extraction complete to ${extractPath}. Took ${duration} seconds.`)
        resolve(extractPath)
      } else {
        const err = new Error(`tar process exited with code ${code}`)
        log.error(err)
        reject(err)
      }
    })
  })
}

function isExecutable(filePath) {
  try {
    accessSync(filePath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function makeExecutable(filePath) {
  try {
    log.info(`Making ${filePath} executable...`)
    chmodSync(filePath, 0o755) // rwx r-x r-x
    return true
  } catch (err) {
    log.error(`Failed to make file executable: ${err}`)
    return false
  }
}

async function downloadFile(url, destination) {
  log.info(`Downloading ${url} to ${destination}...`)

  try {
    // Ensure the directory exists
    const dir = path.dirname(destination)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    // Create a write stream
    const writer = createWriteStream(destination)

    // Download the file with electron's net module
    const response = await electronNet.fetch(url)
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`)
    }

    // Pipe the response to the file
    await pipeline(response.body, writer)

    log.info(`Download complete: ${destination}`)
    return destination
  } catch (error) {
    log.error(`Download failed: ${error.message}`)
    throw error
  }
}

async function startPythonServer() {
  log.info('Finding free port for Python server...')
  serverPort = is.dev ? 5002 : await findFreePort()
  log.info(`Free port found: ${serverPort}`)

  let scriptPath
  let pythonInterpreter

  if (is.dev) {
    scriptPath = join(__dirname, '../../test-species/main.py')
    pythonInterpreter = join(__dirname, '../../test-species/.venv/bin/python3.11')

    log.info(`Using extracted main.py at: ${scriptPath}`)
    log.info(`Using Python interpreter: ${pythonInterpreter}`)
  } else {
    // Production mode
    const extractPath = join(app.getPath('userData'), 'species-data')

    const baseURL = 'https://pub-5a51774bae6b4020a4948aaf91b72172.r2.dev/conda-environments/'
    const osName =
      process.platform === 'win32' ? 'Windows' : process.platform === 'linux' ? 'Linux' : 'macOS'

    const envDownloadUrl = `${baseURL}species-env-${osName}.tar.gz`
    const downloadedTarPath = join(app.getPath('userData'), `species-env.tar.gz`)

    scriptPath = join(process.resourcesPath, 'python', 'main.py')

    try {
      // Check if we already have files extracted
      if (existsSync(extractPath)) {
        const files = readdirSync(extractPath)
        if (files.length > 0 && files.includes('species-env')) {
          log.info('Environment already extracted, using existing files')
        } else {
          // Download and extract the environment
          log.info('Downloading environment file...')
          await downloadFile(envDownloadUrl, downloadedTarPath)
          log.info('Extracting downloaded environment...')
          await extractTarGz(downloadedTarPath, extractPath)
        }
      } else {
        // Download and extract the environment
        log.info('Downloading environment file...')
        await downloadFile(envDownloadUrl, downloadedTarPath)
        log.info('Extracting downloaded environment...')
        await extractTarGz(downloadedTarPath, extractPath)
      }

      // Use the extracted Python environment
      pythonInterpreter =
        process.platform === 'win32'
          ? join(extractPath, 'species-env/python.exe')
          : join(extractPath, 'species-env/bin/python3.11')

      // Check if executable and make it executable if needed
      if (!isExecutable(pythonInterpreter)) {
        log.warn(`Python interpreter not executable: ${pythonInterpreter}`)
        if (!makeExecutable(pythonInterpreter)) {
          log.warn('Could not make Python interpreter executable, falling back to bundled backend')
          if (!isExecutable(scriptPath)) {
            makeExecutable(scriptPath)
          }
        }
      }
    } catch (error) {
      log.error('Failed to download or extract environment:', error)
    }
  }

  try {
    log.info(`Starting Python server on port ${serverPort}...`)

    if (is.dev) {
      pythonProcess = spawn(pythonInterpreter, [scriptPath, '--port', serverPort.toString()])
    } else if (pythonInterpreter && existsSync(pythonInterpreter)) {
      // If we have a valid Python interpreter, use it
      pythonProcess = spawn(pythonInterpreter, [scriptPath, '--port', serverPort.toString()])
    } else {
      log.error('Python interpreter not found or not executable:', pythonInterpreter)
    }

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString()
      log.info('Python output:', output)
    })

    //python/flask sends everything to stderr
    pythonProcess.stderr.on('data', (data) => {
      log.info(`Python output: ${data}`)
    })

    pythonProcess.on('error', (err) => {
      log.error('Failed to start Python server:', err)
      throw err // Re-throw to be caught by the outer try-catch
    })

    // Wait a bit to ensure the server is ready
    await new Promise((resolve) => setTimeout(resolve, 2000))
  } catch (error) {
    log.error('Error in Python process startup:', error)

    // Last resort: try with system Python
    if (is.dev && pythonInterpreter !== 'python3') {
      log.info('Attempting to start with system Python as last resort...')
      pythonProcess = spawn('python3', [scriptPath, '--port', serverPort.toString()])

      // Set up event handlers again
      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString()
        log.info('Python output (fallback):', output)
      })

      pythonProcess.stderr.on('data', (data) => {
        log.error(`Python output (fallback): ${data}`)
      })

      pythonProcess.on('error', (err) => {
        log.error('Failed to start Python server with fallback:', err)
        throw new Error('Could not start Python server with any method')
      })

      // Wait again
      await new Promise((resolve) => setTimeout(resolve, 2000))
    } else {
      throw error // Re-throw if we've exhausted our options
    }
  }
}

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1300,
    height: 800,
    // show: false,
    // frame: false,
    // titleBarStyle: 'hidden',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    mainWindow.webContents.openDevTools()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Setup drag and drop event handlers
  mainWindow.webContents.on('will-navigate', (event) => {
    // Prevent navigation when dropping files
    event.preventDefault()
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + `?port=${serverPort}`)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { port: serverPort }
    })
  }
}

log.info('Starting Electron app...')

// Add this before app.whenReady()
function registerLocalFileProtocol() {
  protocol.handle('local-file', (request) => {
    log.info('local-file protocol request:', request.url, request.URLSearchParams)
    const url = new URL(request.url)
    const filePath = url.searchParams.get('path')

    log.info('Original path:', filePath)

    return electronNet.fetch(`file://${filePath}`)
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('org.biowatch')

  // Register local-file:// protocol
  registerLocalFileProtocol()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => log.info('pong'))

  // Add image selection handler
  ipcMain.handle('select-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif'] }]
    })
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0]
      // Convert Windows backslashes to forward slashes for URLs
      const urlPath = filePath.replace(/\\/g, '/')
      return {
        path: filePath,
        url: `local-file://get?path=${urlPath}`
      }
    }
    return null
  })

  // Add folder selection handler
  ipcMain.handle('select-folder', async () => {
    const result = dialog.showOpenDialogSync({
      properties: ['openDirectory']
    })
    if (!result) return null
    // if (!pythonProcess) {
    //   startPythonServer()
    // }
    const path = result[0]
    const id = crypto.randomUUID()
    const { data } = await importCamTrapDataset(path, id)

    return {
      path,
      data,
      id
    }
  })

  // Add species distribution handler
  ipcMain.handle('get-species-distribution', async (_, studyId) => {
    try {
      const dbPath = join(app.getPath('userData'), `${studyId}.db`)
      if (!existsSync(dbPath)) {
        log.warn(`Database not found for study ID: ${studyId}`)
        return { error: 'Database not found for this study' }
      }

      const distribution = await getSpeciesDistribution(dbPath)
      return { data: distribution }
    } catch (error) {
      log.error('Error getting species distribution:', error)
      return { error: error.message }
    }
  })

  // Add deployments handler
  ipcMain.handle('get-deployments', async (_, studyId) => {
    try {
      const dbPath = join(app.getPath('userData'), `${studyId}.db`)
      if (!existsSync(dbPath)) {
        log.warn(`Database not found for study ID: ${studyId}`)
        return { error: 'Database not found for this study' }
      }

      const deployments = await getDeployments(dbPath)
      return { data: deployments }
    } catch (error) {
      log.error('Error getting deployments:', error)
      return { error: error.message }
    }
  })

  ipcMain.handle('get-deployments-activity', async (_, studyId) => {
    try {
      const dbPath = join(app.getPath('userData'), `${studyId}.db`)
      if (!existsSync(dbPath)) {
        log.warn(`Database not found for study ID: ${studyId}`)
        return { error: 'Database not found for this study' }
      }

      const activity = await getDeploymentsActivity(dbPath)
      return { data: activity }
    } catch (error) {
      log.error('Error getting deployments activity:', error)
      return { error: error.message }
    }
  })

  ipcMain.handle('get-top-species-timeseries', async (_, studyId) => {
    try {
      const dbPath = join(app.getPath('userData'), `${studyId}.db`)
      if (!existsSync(dbPath)) {
        log.warn(`Database not found for study ID: ${studyId}`)
        return { error: 'Database not found for this study' }
      }

      const timeseriesData = await getTopSpeciesTimeseries(dbPath)
      return { data: timeseriesData }
    } catch (error) {
      log.error('Error getting top species timeseries:', error)
      return { error: error.message }
    }
  })

  ipcMain.handle('get-species-timeseries', async (_, studyId, species) => {
    try {
      const dbPath = join(app.getPath('userData'), `${studyId}.db`)
      if (!existsSync(dbPath)) {
        log.warn(`Database not found for study ID: ${studyId}`)
        return { error: 'Database not found for this study' }
      }

      const timeseriesData = await getSpeciesTimeseries(dbPath, species)
      return { data: timeseriesData }
    } catch (error) {
      log.error('Error getting species timeseries:', error)
      return { error: error.message }
    }
  })

  ipcMain.handle(
    'get-species-heatmap-data',
    async (_, studyId, species, startDate, endDate, startTime, endTime) => {
      try {
        const dbPath = join(app.getPath('userData'), `${studyId}.db`)
        if (!existsSync(dbPath)) {
          log.warn(`Database not found for study ID: ${studyId}`)
          return { error: 'Database not found for this study' }
        }

        const heatmapData = await getSpeciesHeatmapData(
          dbPath,
          species,
          startDate,
          endDate,
          startTime,
          endTime
        )
        return { data: heatmapData }
      } catch (error) {
        log.error('Error getting species heatmap data:', error)
        return { error: error.message }
      }
    }
  )

  ipcMain.handle('get-locations-activity', async (_, studyId) => {
    try {
      const dbPath = join(app.getPath('userData'), `${studyId}.db`)
      if (!existsSync(dbPath)) {
        log.warn(`Database not found for study ID: ${studyId}`)
        return { error: 'Database not found for this study' }
      }

      const activity = await getLocationsActivity(dbPath)
      return { data: activity }
    } catch (error) {
      log.error('Error getting locations activity:', error)
      return { error: error.message }
    }
  })

  ipcMain.handle('get-species-daily-activity', async (_, studyId, species, startDate, endDate) => {
    try {
      const dbPath = join(app.getPath('userData'), `${studyId}.db`)
      if (!existsSync(dbPath)) {
        log.warn(`Database not found for study ID: ${studyId}`)
        return { error: 'Database not found for this study' }
      }

      const dailyActivity = await getSpeciesDailyActivity(dbPath, species, startDate, endDate)
      return { data: dailyActivity }
    } catch (error) {
      log.error('Error getting species daily activity data:', error)
      return { error: error.message }
    }
  })

  // Add drag and drop handler
  ipcMain.handle('import-dropped-directory', async (_, directoryPath) => {
    try {
      log.info(`Processing dropped directory: ${directoryPath}`)

      // Validate that the path exists and is a directory
      if (!existsSync(directoryPath) || !statSync(directoryPath).isDirectory()) {
        log.warn(`Invalid directory path: ${directoryPath}`)
        return { error: 'The dropped item is not a valid directory' }
      }

      const id = crypto.randomUUID()
      const { data } = await importCamTrapDataset(directoryPath, id)

      return {
        path: directoryPath,
        data,
        id
      }
    } catch (error) {
      log.error('Error processing dropped directory:', error)
      return { error: error.message }
    }
  })

  // Add handler for showing study context menu
  ipcMain.handle('show-study-context-menu', (event, studyId) => {
    const { Menu } = require('electron')
    const targetWindow = BrowserWindow.fromWebContents(event.sender)

    const menu = Menu.buildFromTemplate([
      {
        label: 'Delete study',
        click: () => {
          try {
            log.info(`Deleting database for study: ${studyId}`)
            const dbPath = join(app.getPath('userData'), `${studyId}.db`)
            event.sender.send('delete-study', studyId)

            if (existsSync(dbPath)) {
              unlinkSync(dbPath)
              log.info(`Successfully deleted database: ${dbPath}`)
              return { success: true }
            } else {
              log.warn(`Database not found for deletion: ${dbPath}`)
              return { success: true, message: 'Database already deleted or not found' }
            }
          } catch (error) {
            log.error('Error deleting study database:', error)
            return { error: error.message, success: false }
          }
        }
      }
    ])

    menu.popup({ window: targetWindow })
    return true
  })

  // Add handler for deleting study database
  ipcMain.handle('delete-study-database', async (_, studyId) => {
    try {
      log.info(`Deleting database for study: ${studyId}`)
      const dbPath = join(app.getPath('userData'), `${studyId}.db`)

      if (existsSync(dbPath)) {
        unlinkSync(dbPath)
        log.info(`Successfully deleted database: ${dbPath}`)
        return { success: true }
      } else {
        log.warn(`Database not found for deletion: ${dbPath}`)
        return { success: true, message: 'Database already deleted or not found' }
      }
    } catch (error) {
      log.error('Error deleting study database:', error)
      return { error: error.message, success: false }
    }
  })

  // Update media handler to use the new getMedia function with options
  ipcMain.handle('get-media', async (_, studyId, options = {}) => {
    try {
      const dbPath = join(app.getPath('userData'), `${studyId}.db`)
      if (!existsSync(dbPath)) {
        log.warn(`Database not found for study ID: ${studyId}`)
        return { error: 'Database not found for this study' }
      }

      const media = await getMedia(dbPath, options)
      return { data: media }
    } catch (error) {
      log.error('Error getting media:', error)
      return { error: error.message }
    }
  })

  // Keep the old handler for backward compatibility, but implement it using the new function
  ipcMain.handle('get-latest-media', async (_, studyId, limit = 10) => {
    try {
      const dbPath = join(app.getPath('userData'), `${studyId}.db`)
      if (!existsSync(dbPath)) {
        log.warn(`Database not found for study ID: ${studyId}`)
        return { error: 'Database not found for this study' }
      }

      const media = await getMedia(dbPath, { limit })
      return { data: media }
    } catch (error) {
      log.error('Error getting latest media:', error)
      return { error: error.message }
    }
  })

  try {
    // await startPythonServer()

    createWindow()
  } catch (error) {
    log.error('Failed to start Python server:', error)
    app.quit()
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('before-quit', () => {
    log.info('Quitting app....')
    if (pythonProcess) {
      pythonProcess.kill()
      pythonProcess = null
    }
  })

  // Add model status check handler
  ipcMain.handle('check-model-status', () => {
    return checkModelStatus()
  })

  // Add model download handler
  ipcMain.handle('download-model', async () => {
    return await downloadModel()
  })
})

// Add IPC handler to get server port
ipcMain.handle('get-server-port', () => serverPort)

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (pythonProcess) {
    pythonProcess.kill()
    pythonProcess = null
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

function checkModelStatus() {
  // if (is.dev) {
  //   // In dev mode, assume model is available through the Python environment
  //   return { isDownloaded: true }
  // }

  const extractPath = join(app.getPath('userData'), 'species-data')
  const envPath = join(extractPath, 'species-env')

  // Check if environment exists and has content
  if (existsSync(envPath)) {
    try {
      const stats = statSync(envPath)
      return {
        isDownloaded: stats.isDirectory(),
        size: stats.size,
        lastModified: stats.mtime
      }
    } catch (error) {
      log.warn(`Error checking model status: ${error}`)
    }
  }

  return { isDownloaded: false }
}

async function downloadModel() {
  // if (is.dev) {
  //   // In dev mode, just return success
  //   return { success: true, message: "Model already available in dev mode" }
  // }

  try {
    const extractPath = join(app.getPath('userData'), 'species-data')
    const baseURL = 'https://pub-5a51774bae6b4020a4948aaf91b72172.r2.dev/conda-environments/'
    const osName =
      process.platform === 'win32' ? 'Windows' : process.platform === 'linux' ? 'Linux' : 'macOS'

    const envDownloadUrl = `${baseURL}species-env-${osName}.tar.gz`
    const downloadedTarPath = join(app.getPath('userData'), `species-env.tar.gz`)

    // Download the environment
    log.info('Downloading environment file...')
    await downloadFile(envDownloadUrl, downloadedTarPath)

    // Extract the environment
    log.info('Extracting downloaded environment...')
    await extractTarGz(downloadedTarPath, extractPath)

    return {
      success: true,
      message: 'Model downloaded and extracted successfully'
    }
  } catch (error) {
    log.error('Failed to download model:', error)
    return {
      success: false,
      message: `Failed to download model: ${error.message}`
    }
  }
}
