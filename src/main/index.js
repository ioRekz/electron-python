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
  statSync,
  promises as fsPromises
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
  getSpeciesDailyActivity,
  createImageDirectoryDatabase,
  insertDeployments,
  insertMedia,
  insertObservations
} from './queries'
import { autoUpdater } from 'electron-updater'
import exifr from 'exifr'
import readline from 'linebyline'
import luxon, { DateTime } from 'luxon'
import geoTz from 'geo-tz'

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

async function getPredictions(path) {
  console.log('Getting predictions for path:', path)
  return new Promise((resolve, reject) => {
    let preds = []
    const scriptPath = join(__dirname, '../../test-species/main.py')
    const pythonInterpreter = join(__dirname, '../../test-species/.venv/bin/python3.11')
    pythonProcess = spawn(pythonInterpreter, [scriptPath, '--path', path])
    const rl = readline(pythonProcess.stdout)

    rl.on('line', (line) => {
      try {
        // log.info('Python line:', line)
        if (line.startsWith('PREDICTION:')) {
          const [, prediction] = line.split('PREDICTION: ')
          preds.push(JSON.parse(prediction))
          // log.info('Prediction:', JSON.parse(prediction))
        }
      } catch (err) {
        console.error('Failed to parse line:', line, err)
      }
    })

    pythonProcess.stderr.on('data', (err) => {
      log.error('Python error:', err.toString())
    })

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        resolve(preds)
      } else {
        reject(new Error(`Python process exited with code ${code}`))
      }
    })

    pythonProcess.on('error', (err) => {
      reject(err)
    })
  })
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

async function processImagesDirectory(directoryPath) {
  log.info(`Processing images directory: ${directoryPath}`)
  const media = {}
  const deployments = {}
  const dbID = crypto.randomUUID()
  const dbPath = join(app.getPath('userData'), `${dbID}.db`)

  // Function to recursively scan directories
  async function scanDirectory(dir) {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        await scanDirectory(fullPath)
      } else {
        // Check if it's an image file
        const ext = path.extname(entry.name).toLowerCase()
        if (['.jpg', '.jpeg', '.png', '.gif', '.tiff', '.bmp'].includes(ext)) {
          try {
            // Get file stats
            const stats = await fsPromises.stat(fullPath)

            // Get EXIF data
            let exifData = {}
            try {
              exifData = await exifr.parse(fullPath, {
                gps: true,
                exif: true,
                reviveValues: true
              })
            } catch (exifError) {
              log.warn(`Could not extract EXIF data from ${fullPath}: ${exifError.message}`)
            }
            // Extract GPS coordinates if available
            let latitude = null
            let longitude = null
            if (exifData && exifData.latitude && exifData.longitude) {
              latitude = exifData.latitude
              longitude = exifData.longitude
            }

            // Extract date from EXIF or use file creation date

            const [timeZone] = geoTz.find(latitude, longitude)

            const date = luxon.DateTime.fromJSDate(exifData.DateTimeOriginal, {
              zone: timeZone
            })

            media[fullPath] = {
              mediaID: crypto.randomUUID(),
              deploymentID: 'tbd',
              timestamp: date,
              filePath: fullPath.replace(directoryPath, ''),
              fileName: entry.name
            }

            const dep = deployments[latitude + ',' + longitude]
            if (dep) {
              dep.deploymentStart = luxon.DateTime.min(dep.deploymentStart, date)
              dep.deploymentEnd = luxon.DateTime.max(dep.deploymentEnd, date)

              media[fullPath].deploymentID = dep.deploymentID
            } else {
              const id = crypto.randomUUID()
              deployments[latitude + ',' + longitude] = {
                deploymentID: id,
                deploymentStart: date,
                deploymentEnd: date,
                latitude,
                longitude,
                locationID: id,
                locationName: undefined
              }
              media[fullPath].deploymentID = id
            }
          } catch (error) {
            log.error(`Error processing image ${fullPath}: ${error.message}`)
          }
        }
      }
    }
  }

  await scanDirectory(directoryPath)
  // const predictions = await getPredictions(directoryPath)
  // log.info('GOT Predictions:', predictions[0])
  // for (const prediction of predictions) {
  //   const img = prediction.

  console.log('media', media[Object.keys(media)[0]])

  // return

  log.info(`Found ${Object.keys(media).length} images in directory`)
  log.info('deplyments', deployments)
  // log.info('media', media)

  // Create database and insert collected data
  try {
    // Create and initialize database
    const db = await createImageDirectoryDatabase(dbPath)

    // Insert deployments
    await insertDeployments(db, deployments)

    // Insert media

    log.info('Inserting media into database...', media)
    await insertMedia(db, media)

    log.info(`Successfully created database for image directory at ${dbPath}`)

    const predictions = await getPredictions(directoryPath)
    log.info('GOT Predictions:', predictions)
    const observations = predictions.map((prediction) => {
      const img = media[prediction.filepath]
      const isblank = ['blank', 'no cv result'].includes(prediction.prediction.split(';').at(-1))
      const scientificName =
        prediction.prediction.split(';').at(-3) + ' ' + prediction.prediction.split(';').at(-2)
      const observation = {
        observationID: crypto.randomUUID(),
        deploymentID: img.deploymentID,
        mediaID: img.mediaID,
        eventStart: img.timestamp,
        eventEnd: img.timestamp,
        eventID: crypto.randomUUID(),
        confidence: prediction.prediction_score,
        scientificName: isblank
          ? undefined
          : scientificName.trim() === ''
            ? prediction.prediction.split(';').at(-1)
            : scientificName,
        prediction: prediction.prediction
      }
      return observation
    })

    log.info('observations', observations)

    // // Insert observations into the database
    await insertObservations(db, observations)

    // Close database
    await new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    pythonProcess.kill()
    pythonProcess = null

    return {
      path: directoryPath,
      data: {
        name: 'study 1',
        title: 'Study 1',
        temporal: {
          start: DateTime.min(
            ...Object.values(deployments).map((dep) => dep.deploymentStart)
          ).toISODate(),
          end: DateTime.max(
            ...Object.values(deployments).map((dep) => dep.deploymentEnd)
          ).toISODate()
        }
      },
      id: dbID
    }
  } catch (error) {
    log.error(`Error creating database for image directory: ${error.message}`)
    throw error
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
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    // mainWindow.webContents.openDevTools()
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

// Add a shared function to process datasets (used by both select-dataset and import-dropped-dataset)
async function processDataset(inputPath, id) {
  let pathToImport = inputPath

  try {
    // Check if selected path is a file (potential zip) or directory
    const stats = statSync(inputPath)
    const isZip = stats.isFile() && inputPath.toLowerCase().endsWith('.zip')

    if (isZip) {
      log.info(`Processing zip file: ${inputPath}`)

      // Create a directory for extraction in app data
      const extractPath = join(app.getPath('userData'), id)
      if (!existsSync(extractPath)) {
        mkdirSync(extractPath, { recursive: true })
      }

      // Extract the zip file
      log.info(`Extracting ${inputPath} to ${extractPath}`)
      await new Promise((resolve, reject) => {
        const tarProcess = spawn('tar', ['-xf', inputPath, '-C', extractPath])

        tarProcess.stdout.on('data', (data) => {
          log.info(`tar output: ${data}`)
        })

        tarProcess.stderr.on('data', (data) => {
          log.info(`tar progress: ${data}`)
        })

        tarProcess.on('error', (err) => {
          log.error(`Error executing tar command:`, err)
          reject(err)
        })

        tarProcess.on('close', (code) => {
          if (code === 0) {
            log.info(`Extraction complete to ${extractPath}`)
            resolve()
          } else {
            const err = new Error(`tar process exited with code ${code}`)
            log.error(err)
            reject(err)
          }
        })
      })

      // Find the directory containing a datapackage.json file
      let camtrapDpDirPath = null

      const findCamtrapDpDir = (dir) => {
        if (camtrapDpDirPath) return // Already found, exit recursion

        try {
          const files = readdirSync(dir)

          // First check if this directory has datapackage.json
          if (files.includes('datapackage.json')) {
            camtrapDpDirPath = dir
            return
          }

          // Then check subdirectories
          for (const file of files) {
            const fullPath = join(dir, file)
            if (statSync(fullPath).isDirectory()) {
              findCamtrapDpDir(fullPath)
            }
          }
        } catch (error) {
          log.warn(`Error reading directory ${dir}: ${error.message}`)
        }
      }

      findCamtrapDpDir(extractPath)

      if (!camtrapDpDirPath) {
        throw new Error('CamTrap DP directory with datapackage.json not found in extracted archive')
      }

      log.info(`Found CamTrap DP directory at ${camtrapDpDirPath}`)
      pathToImport = camtrapDpDirPath
    } else if (!stats.isDirectory()) {
      throw new Error('The selected path is neither a directory nor a zip file')
    }

    // Import the dataset
    const { data } = await importCamTrapDataset(pathToImport, id)

    // Clean up CSV files and datapackage.json after successful import if it was a zip
    if (pathToImport !== inputPath) {
      log.info('Cleaning up CSV files and datapackage.json...')

      const cleanupDirectory = (dir) => {
        try {
          const files = readdirSync(dir)

          for (const file of files) {
            const fullPath = join(dir, file)

            if (statSync(fullPath).isDirectory()) {
              cleanupDirectory(fullPath)
            } else if (
              file.toLowerCase().endsWith('.csv') ||
              file.toLowerCase() === 'datapackage.json'
            ) {
              log.info(`Removing file: ${fullPath}`)
              unlinkSync(fullPath)
            }
          }
        } catch (error) {
          log.warn(`Error cleaning up directory ${dir}: ${error.message}`)
        }
      }

      cleanupDirectory(pathToImport)
    }

    return {
      path: pathToImport,
      data,
      id
    }
  } catch (error) {
    log.error('Error processing dataset:', error)
    // Clean up extracted directory if there was an error
    if (pathToImport !== inputPath) {
      try {
        await new Promise((resolve) => {
          const rmProcess = spawn('rm', ['-rf', join(app.getPath('userData'), id)])
          rmProcess.on('close', () => resolve())
          rmProcess.on('error', () => resolve())
        })
      } catch (cleanupError) {
        log.warn(`Failed to clean up after error: ${cleanupError.message}`)
      }
    }
    throw error
  }
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

  // Add dataset selection handler (supports both directories and zip files)
  ipcMain.handle('select-dataset', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory'],
      filters: [
        { name: 'Datasets', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (!result || result.canceled || result.filePaths.length === 0) return null

    const selectedPath = result.filePaths[0]
    const id = crypto.randomUUID()

    return await processDataset(selectedPath, id)
  })

  // Add drag and drop handler (supports both directories and zip files)
  ipcMain.handle('import-dropped-dataset', async (_, path) => {
    try {
      log.info(`Processing dropped item: ${path}`)

      // Validate that the path exists
      if (!existsSync(path)) {
        log.warn(`Invalid path: ${path}`)
        return { error: 'The dropped item does not exist' }
      }

      const id = crypto.randomUUID()
      return await processDataset(path, id)
    } catch (error) {
      log.error('Error processing dropped dataset:', error)
      return { error: error.message }
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

  // Add demo dataset download handler
  ipcMain.handle('download-demo-dataset', async () => {
    try {
      log.info('Downloading and importing demo dataset')

      // Create a temp directory for the downloaded file
      const downloadDir = join(app.getPath('temp'), 'camtrap-demo')
      if (!existsSync(downloadDir)) {
        mkdirSync(downloadDir, { recursive: true })
      }

      // URL for the demo dataset
      const demoDatasetUrl = 'https://gbif.mnhn.lu/ipt/archive.do?r=luxvalmoni20223025'
      const zipPath = join(downloadDir, 'demo-dataset.zip')
      const extractPath = join(downloadDir, 'extracted')

      // Download the file
      log.info(`Downloading demo dataset from ${demoDatasetUrl} to ${zipPath}`)
      await downloadFile(demoDatasetUrl, zipPath)
      log.info('Download complete')

      // Create extraction directory if it doesn't exist
      if (!existsSync(extractPath)) {
        mkdirSync(extractPath, { recursive: true })
      } else {
        // Clean the extraction directory first to avoid conflicts
        const files = readdirSync(extractPath)
        for (const file of files) {
          const filePath = join(extractPath, file)
          if (statSync(filePath).isDirectory()) {
            // Use rimraf or a similar recursive delete function for directories
            await new Promise((resolve, reject) => {
              const rmProcess = spawn('rm', ['-rf', filePath])
              rmProcess.on('close', (code) => {
                if (code === 0) resolve()
                else reject(new Error(`Failed to delete directory: ${filePath}`))
              })
              rmProcess.on('error', reject)
            })
          } else {
            unlinkSync(filePath)
          }
        }
      }

      // Extract the zip file using tar
      log.info(`Extracting ${zipPath} to ${extractPath}`)
      await new Promise((resolve, reject) => {
        // tar can extract zip files with the right flags (-xf for extract, automatic format detection)
        const tarProcess = spawn('tar', ['-xf', zipPath, '-C', extractPath])

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
          if (code === 0) {
            log.info(`Extraction complete to ${extractPath}`)
            resolve()
          } else {
            const err = new Error(`tar process exited with code ${code}`)
            log.error(err)
            reject(err)
          }
        })
      })

      // Find the directory containing a datapackage.json file
      let camtrapDpDirPath = null

      const findCamtrapDpDir = (dir) => {
        if (camtrapDpDirPath) return // Already found, exit recursion

        try {
          const files = readdirSync(dir)

          // First check if this directory has datapackage.json
          if (files.includes('datapackage.json')) {
            camtrapDpDirPath = dir
            return
          }

          // Then check subdirectories
          for (const file of files) {
            const fullPath = join(dir, file)
            if (statSync(fullPath).isDirectory()) {
              findCamtrapDpDir(fullPath)
            }
          }
        } catch (error) {
          log.warn(`Error reading directory ${dir}: ${error.message}`)
        }
      }

      findCamtrapDpDir(extractPath)

      if (!camtrapDpDirPath) {
        throw new Error('CamTrap DP directory with datapackage.json not found in extracted archive')
      }

      log.info(`Found CamTrap DP directory at ${camtrapDpDirPath}`)

      const id = crypto.randomUUID()
      const { data } = await importCamTrapDataset(camtrapDpDirPath, id)

      const result = {
        path: camtrapDpDirPath,
        data,
        id
      }

      log.info('Cleaning up temporary files after successful import...')

      try {
        if (existsSync(zipPath)) {
          unlinkSync(zipPath)
          log.info(`Deleted zip file: ${zipPath}`)
        }
      } catch (error) {
        log.warn(`Failed to delete zip file: ${error.message}`)
      }

      try {
        await new Promise((resolve, reject) => {
          const rmProcess = spawn('rm', ['-rf', extractPath])
          rmProcess.on('close', (code) => {
            if (code === 0) {
              log.info(`Deleted extraction directory: ${extractPath}`)
              resolve()
            } else {
              log.warn(`Failed to delete extraction directory, exit code: ${code}`)
              resolve() // Still resolve to avoid blocking the import process
            }
          })
          rmProcess.on('error', (err) => {
            log.warn(`Error during extraction directory cleanup: ${err.message}`)
            resolve() // Still resolve to avoid blocking the import process
          })
        })
      } catch (error) {
        log.warn(`Failed to cleanup extraction directory: ${error.message}`)
      }

      return result
    } catch (error) {
      log.error('Error downloading or importing demo dataset:', error)
      throw error
    }
  })

  ipcMain.handle('select-images-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Images Directory'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: 'Selection canceled' }
    }

    const directoryPath = result.filePaths[0]
    try {
      const data = await processImagesDirectory(directoryPath)
      return data
    } catch (error) {
      log.error('Error processing images directory:', error)
      return {
        success: false,
        error: error.message
      }
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
