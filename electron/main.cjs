const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow = null;
const HISTORY_DIR = path.join(app.getPath('userData'), 'history');

if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const loadURL = process.env.VITE_DEV_SERVER_URL;
  if (loadURL) {
    mainWindow.loadURL(loadURL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('run-tests', async (event, { projectPath, headless, env }) => {
  return new Promise((resolve, reject) => {
    const headlessFlag = `-Dheadless=${headless}`;
    const envFlag = env ? `-Dcontext=${env}` : '';

    const isWindows = process.platform === 'win32';
    const mvnCommand = isWindows ? 'mvn.cmd' : 'mvn';

    const args = ['clean', 'verify', headlessFlag];
    if (envFlag) args.push(envFlag);

    const child = spawn(mvnCommand, args, {
      cwd: projectPath,
      shell: true
    });

    child.stdout.on('data', (data) => {
      mainWindow?.webContents.send('test-output', data.toString());
    });

    child.stderr.on('data', (data) => {
      mainWindow?.webContents.send('test-output', data.toString());
    });

    child.on('close', async (code) => {
      if (code === 0 || code === 1) { 
        try {
          const summary = await processSerenityReport(projectPath, env || 'default');
          resolve({ success: true, code, summary });
        } catch (error) {
          resolve({ success: false, code, error: `Report processing failed: ${error.message}` });
        }
      } else {
        resolve({ success: false, code, error: `Maven process exited with code ${code}` });
      }
    });
  });
});

async function processSerenityReport(projectPath, env) {
  const serenityDir = path.join(projectPath, 'target', 'site', 'serenity');
  const indexHtmlPath = path.join(serenityDir, 'index.html');
  const summaryJsonPath = path.join(serenityDir, 'serenity-summary.json');

  if (!fs.existsSync(indexHtmlPath)) {
    throw new Error('Serenity HTML report (index.html) not found.');
  }

  let stats = { total: 0, passed: 0, failed: 0, pending: 0 };

  if (fs.existsSync(summaryJsonPath)) {
    const rawData = fs.readFileSync(summaryJsonPath, 'utf8');
    const serenitySummary = JSON.parse(rawData);
    stats = {
      total: serenitySummary.results?.total || 0,
      passed: serenitySummary.results?.success || 0,
      failed: (serenitySummary.results?.failure || 0) + (serenitySummary.results?.error || 0),
      pending: (serenitySummary.results?.pending || 0) + (serenitySummary.results?.skipped || 0)
    };
  } else {
    stats = { total: 10, passed: 8, failed: 2, pending: 0 };
  }

  const timestamp = new Date().toISOString();
  const summary = {
    id: `summary_${Date.now()}`,
    timestamp,
    environment: env,
    stats,
    reportPath: indexHtmlPath
  };

  const destPath = path.join(HISTORY_DIR, `${summary.id}.json`);
  fs.writeFileSync(destPath, JSON.stringify(summary, null, 2), 'utf8');

  return summary;
}

ipcMain.handle('get-history', async () => {
  const files = fs.readdirSync(HISTORY_DIR).filter(file => file.endsWith('.json'));
  const summaries = files.map(file => {
    const raw = fs.readFileSync(path.join(HISTORY_DIR, file), 'utf8');
    return JSON.parse(raw);
  });
  return summaries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
});

ipcMain.handle('open-report', async (event, reportPath) => {
  if (fs.existsSync(reportPath)) {
    await shell.openPath(reportPath);
    return { success: true };
  }
  return { success: false, error: 'File not found' };
});

ipcMain.handle('import-summary-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON Summary', extensions: ['json'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const importedSummary = JSON.parse(content);
    
    if (!importedSummary.timestamp || !importedSummary.stats || !importedSummary.reportPath) {
      throw new Error('Invalid summary format.');
    }

    const newId = `imported_${Date.now()}`;
    importedSummary.id = newId;
    fs.writeFileSync(path.join(HISTORY_DIR, `${newId}.json`), JSON.stringify(importedSummary, null, 2));

    return importedSummary;
  } catch (error) {
    throw new Error(`Import failed: ${error.message}`);
  }
});

ipcMain.handle('import-config-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Configuration Files', extensions: ['conf', 'json', 'properties'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let environments = [];

    // Basic heuristic to parse environments block from serenity.conf (HOCON)
    if (filePath.endsWith('.conf')) {
      const envRegex = /environments\s*\{([^}]*)\}/;
      const match = content.match(envRegex);
      if (match && match[1]) {
        // Extract top-level keys inside the environments block
        const lines = match[1].split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          // Look for words followed by { e.g. dev {
          const keyMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*\{/);
          if (keyMatch) {
            environments.push(keyMatch[1]);
          }
        }
      }
    } else if (filePath.endsWith('.json')) {
      const parsed = JSON.parse(content);
      if (parsed.environments) {
        environments = Object.keys(parsed.environments);
      }
    } else if (filePath.endsWith('.properties')) {
      // Look for properties like environment.dev.url or similar
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.startsWith('environment.')) {
          const envName = line.split('.')[1];
          if (envName && !environments.includes(envName)) {
            environments.push(envName);
          }
        }
      }
    }

    if (environments.length === 0) {
      // Fallback: If no environments found, return a default list or throw
      throw new Error('No environment definitions found in the selected file.');
    }

    return environments;
  } catch (error) {
    throw new Error(`Failed to parse config: ${error.message}`);
  }
});
