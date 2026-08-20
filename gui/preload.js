const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded successfully!');

contextBridge.exposeInMainWorld('api', {
  getDefaultBinaryPath: () => ipcRenderer.invoke('get-default-binary-path'),
  selectBinary: () => ipcRenderer.invoke('select-binary'),
  checkBinary: (filePath) => ipcRenderer.invoke('check-binary', filePath),
  runSearch: (args) => ipcRenderer.send('run-search', args),
  cancelSearch: () => ipcRenderer.send('cancel-search'),
  
  onSearchStdout: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('search-stdout', listener);
    return () => ipcRenderer.removeListener('search-stdout', listener);
  },
  onSearchStderr: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('search-stderr', listener);
    return () => ipcRenderer.removeListener('search-stderr', listener);
  },
  onSearchError: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('search-error', listener);
    return () => ipcRenderer.removeListener('search-error', listener);
  },
  onSearchExit: (callback) => {
    const listener = (event, code) => callback(code);
    ipcRenderer.on('search-exit', listener);
    return () => ipcRenderer.removeListener('search-exit', listener);
  },
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('search-stdout');
    ipcRenderer.removeAllListeners('search-stderr');
    ipcRenderer.removeAllListeners('search-error');
    ipcRenderer.removeAllListeners('search-exit');
  }
});
