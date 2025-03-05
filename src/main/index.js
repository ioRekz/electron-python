import { app, shell, BrowserWindow, ipcMain, protocol, dialog } from 'electron'
import { net as electronNet } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { spawn } from 'child_process'
import { readdirSync } from 'fs'
import log from 'electron-log'
import net from 'net'

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

async function startPythonServer() {
  log.info('Starting Python server...')
  return new Promise((resolve, reject) => {
    findFreePort()
      .then((port) => {
        const scriptPath = is.dev
          ? join(__dirname, '../../python/image_classifier.py')
          : join(process.resourcesPath, 'python', 'backend')

        const resourcesPath = is.dev ? join(__dirname, '../../resources') : process.resourcesPath

        pythonProcess = is.dev
          ? spawn(join(__dirname, '../../python', '.venv/bin/python'), [
              scriptPath,
              '--port',
              port.toString(),
              '--resourcesPath',
              resourcesPath
            ])
          : spawn(scriptPath, ['--port', port.toString(), '--resourcesPath', resourcesPath])

        log.info(`Starting Python server on port ${port}...`)

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
          reject(err)
        })

        // Wait a bit to ensure the server is ready
        setTimeout(() => {
          serverPort = port
          resolve(port)
        }, 1000)
      })
      .catch((err) => {
        reject(err)
      })
  })
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
