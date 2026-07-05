const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  runTests: (args) => ipcRenderer.invoke('run-tests', args),
  getHistory: () => ipcRenderer.invoke('get-history'),
  openReport: (path) => ipcRenderer.invoke('open-report', path),
  importSummary: () => ipcRenderer.invoke('import-summary-dialog'),
  importConfig: () => ipcRenderer.invoke('import-config-dialog'),
  onTestOutput: (callback) => {
    const handler = (event, output) => callback(output);
    ipcRenderer.on('test-output', handler);
    return () => {
      ipcRenderer.removeListener('test-output', handler);
    };
  }
});
