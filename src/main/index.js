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
  chmodSync,
  accessSync,
  constants,
  createWriteStream
} from 'fs'
import log from 'electron-log'
import net from 'net'
import path from 'path'
import { pipeline } from 'stream/promises'

// Configure electron-log
log.transports.file.level = 'info'
log.transports.console.level = 'info'

let pythonProcess = null
let serverPort = null

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

function getSpeciesExtractPath() {
  return join(app.getPath('userData'), 'species-data')
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
  serverPort = await findFreePort()
  log.info(`Free port found: ${serverPort}`)

  let scriptPath
  let extractPath
  let pythonInterpreter

  if (is.dev) {
    // Extract env.tgz in dev mode
    const speciesZipPath = join(__dirname, '../../clean-species/env.tgz')
    extractPath = getSpeciesExtractPath()

    try {
      await extractTarGz(speciesZipPath, extractPath)
      scriptPath = join(__dirname, '../../test-species/main.py')

      pythonInterpreter = join(extractPath, 'env/bin/python3.11')

      // Check if Python interpreter is executable
      if (!isExecutable(pythonInterpreter)) {
        log.warn(`Python interpreter not executable: ${pythonInterpreter}`)
        if (!makeExecutable(pythonInterpreter)) {
          // Fall back to system Python if we can't make it executable
          log.warn('Falling back to system Python')
          pythonInterpreter = 'python3'
        }
      }

      log.info(`Using extracted main.py at: ${scriptPath}`)
      log.info(`Using Python interpreter: ${pythonInterpreter}`)
    } catch (error) {
      log.error('Failed to extract env.tgz:', error)
      // Fallback to original script path and system Python
      scriptPath = join(__dirname, '../../clean-species/main.py')
      pythonInterpreter = 'python3'
      log.info(`Falling back to: ${scriptPath} with system Python`)
    }
  } else {
    // Production mode
    extractPath = getSpeciesExtractPath()

    // Select URL based on platform
    const envDownloadUrl =
      process.platform === 'win32'
        ? 'https://pub-5a51774bae6b4020a4948aaf91b72172.r2.dev/conda-environments/species-env-Windows.tar.gz'
        : process.platform === 'linux'
          ? 'https://pub-5a51774bae6b4020a4948aaf91b72172.r2.dev/conda-environments/species-env-Linux.tar.gz'
          : 'https://pub-5a51774bae6b4020a4948aaf91b72172.r2.dev/conda-environments/species-env-macOS.tar.gz'

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
          // scriptPath = join(__dirname, '../../test-species', 'main.py')
          if (!isExecutable(scriptPath)) {
            makeExecutable(scriptPath)
          }
        } else {
          // Python interpreter is now executable, use backend script from resources
          // scriptPath = join(__dirname, '../../test-species', 'main.py')
        }
      } else {
        // Python interpreter is executable, use main.py from resources
        // scriptPath = join(__dirname, '../../test-species', 'main.py')
        log.info(`Using Python interpreter: ${pythonInterpreter} with script: ${scriptPath}`)
      }
    } catch (error) {
      log.error('Failed to download or extract environment:', error)
      // Fallback to bundled executable
      scriptPath = join(process.resourcesPath, 'python', 'backend')
      if (!isExecutable(scriptPath)) {
        makeExecutable(scriptPath)
      }
      log.info(`Falling back to bundled backend: ${scriptPath}`)
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
      // Otherwise fall back to bundled executable
      pythonProcess = spawn(scriptPath, ['--port', serverPort.toString()])
    }

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString()
      log.info('Python output:', output)
    })

    //python/flask sends everything to stderr
    pythonProcess.stderr.on('data', (data) => {
      log.error(`Python output: ${data}`)
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
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
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
  electronApp.setAppUserModelId('com.electron')

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
    return {
      path: result[0]
    }
  })

  // Handle text processing
  ipcMain.handle('process-text', async (_, text) => {
    return new Promise((resolve, reject) => {
      const isProduction = !is.dev
      let executablePath

      // Add detailed logging
      log.info('Environment:', isProduction ? 'Production' : 'Development')
      log.info('process.resourcesPath:', process.resourcesPath)

      if (isProduction) {
        try {
          // Log contents of resources directory
          const resourcesContent = readdirSync(process.resourcesPath)
          log.info('Contents of resources directory:', resourcesContent)

          // Log contents of python directory if it exists
          const pythonPath = join(process.resourcesPath, 'python')
          try {
            const pythonContent = readdirSync(pythonPath)
            log.info('Contents of python directory:', pythonContent)
          } catch (err) {
            log.error('Error reading python directory:', err)
          }
        } catch (err) {
          log.error('Error reading resources directory:', err)
        }

        executablePath = join(
          process.resourcesPath,
          'python',
          process.platform === 'win32' ? 'text_processor.exe' : 'text_processor'
        )
      } else {
        executablePath = join(__dirname, '../../python', 'check.py')
      }

      log.info('Final executablePath:', executablePath)

      const childProcess = isProduction
        ? spawn(executablePath, [text])
        : spawn(join(__dirname, '../../python', '.venv/bin/python'), [executablePath, text])

      let result = ''

      childProcess.stdout.on('data', (data) => {
        result += data.toString()
      })

      childProcess.stderr.on('data', (data) => {
        log.error(`Python Process Error: ${data}`)
      })

      childProcess.on('error', (err) => {
        log.error('Failed to start Python process:', err)
        reject(err)
      })

      childProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Process exited with code ${code}`))
        } else {
          resolve(result.trim())
        }
      })
    })
  })

  try {
    await startPythonServer()
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
