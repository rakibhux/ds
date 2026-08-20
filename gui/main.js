const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let activeProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f172a',
      symbolColor: '#94a3b8',
      height: 35
    },
    backgroundColor: '#0f172a',
  });

  // Check if we are in dev mode
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (activeProcess) {
      activeProcess.kill();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('select-binary', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Executables', extensions: ['exe', 'bat', 'cmd', 'sh', 'bin'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  } catch (err) {
    console.error('Failed to open dialog:', err);
    return null;
  }
});

ipcMain.handle('check-binary', async (event, filePath) => {
  if (!filePath) return false;
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch (e) {
    return false;
  }
});

ipcMain.on('run-search', (event, { binaryPath, domains, tlds, extraArgs }) => {
  if (activeProcess) {
    activeProcess.kill();
  }

  const args = [];
  
  if (domains && domains.length > 0) {
    args.push(domains.join(','));
  }
  
  if (tlds && tlds.length > 0) {
    args.push('--tld', tlds.join(','));
  }

  args.push('--no-color'); // Avoid terminal colors

  if (extraArgs) {
    args.push(...extraArgs);
  }

  try {
    activeProcess = spawn(binaryPath, args);

    let buffer = '';

    const handleData = (data) => {
      buffer += data.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop(); // Keep partial line

      for (const line of lines) {
        if (line.trim()) {
          event.sender.send('search-stdout', line);
        }
      }
    };

    activeProcess.stdout.on('data', handleData);
    activeProcess.stderr.on('data', (data) => {
      event.sender.send('search-stderr', data.toString());
    });

    activeProcess.on('error', (err) => {
      event.sender.send('search-error', err.message);
    });

    activeProcess.on('close', (code) => {
      if (buffer.trim()) {
        event.sender.send('search-stdout', buffer);
      }
      event.sender.send('search-exit', code);
      activeProcess = null;
    });

  } catch (err) {
    event.sender.send('search-error', `Failed to start process: ${err.message}`);
    activeProcess = null;
  }
});

ipcMain.on('cancel-search', () => {
  if (activeProcess) {
    activeProcess.kill();
    activeProcess = null;
  }
});
