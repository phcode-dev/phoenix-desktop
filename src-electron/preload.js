const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAppAPI', {
    // App info
    getAppName: () => ipcRenderer.invoke('get-app-name'),
    getAppPath: () => ipcRenderer.invoke('get-app-path'),

    // Process lifecycle
    spawnProcess: (command, args) => ipcRenderer.invoke('spawn-process', command, args),
    writeToProcess: (instanceId, data) => ipcRenderer.invoke('write-to-process', instanceId, data),
    onProcessStdout: (callback) => ipcRenderer.on('process-stdout', (_event, instanceId, line) => callback(instanceId, line)),
    onProcessStderr: (callback) => ipcRenderer.on('process-stderr', (_event, instanceId, line) => callback(instanceId, line)),
    onProcessClose: (callback) => ipcRenderer.on('process-close', (_event, instanceId, data) => callback(instanceId, data)),

    // Quit the app with an exit code (for CI)
    quitApp: (exitCode) => ipcRenderer.invoke('quit-app', exitCode),

    // Log to main process console
    consoleLog: (message) => ipcRenderer.send('console-log', message),

    // Flag to identify Electron environment
    isElectron: true,

    // CLI
    getCliArgs: () => ipcRenderer.invoke('get-cli-args')
});

// the electronFSAPI is the fn that you need to copy to your election app impl for the fs to work.
contextBridge.exposeInMainWorld('electronFSAPI', {
    // Path utilities
    path: {
        sep: process.platform === 'win32' ? '\\' : '/'
    },
    documentDir: () => ipcRenderer.invoke('get-documents-dir'),
    homeDir: () => ipcRenderer.invoke('get-home-dir'),
    tempDir: () => ipcRenderer.invoke('get-temp-dir'),
    appLocalDataDir: () => ipcRenderer.invoke('get-app-data-dir'),
    getWindowsDrives: () => ipcRenderer.invoke('get-windows-drives'),
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

    // FS operations — results may be {__fsError, code, message} on failure since
    // Electron IPC strips Error.code. The renderer (fslib_electron.js) handles unwrapping.
    fsReaddir: (path) => ipcRenderer.invoke('fs-readdir', path),
    fsStat: (path) => ipcRenderer.invoke('fs-stat', path),
    fsMkdir: (path, options) => ipcRenderer.invoke('fs-mkdir', path, options),
    fsUnlink: (path) => ipcRenderer.invoke('fs-unlink', path),
    fsRmdir: (path, options) => ipcRenderer.invoke('fs-rmdir', path, options),
    fsRename: (oldPath, newPath) => ipcRenderer.invoke('fs-rename', oldPath, newPath),
    fsReadFile: (path) => ipcRenderer.invoke('fs-read-file', path),
    fsWriteFile: (path, data) => ipcRenderer.invoke('fs-write-file', path, data)
});

// Phoenix-specific Electron APIs (not part of the copy-paste FS library)
contextBridge.exposeInMainWorld('electronAPI', {
    // Asset URL conversion - converts platform path to asset:// URL
    // Only allows paths under appLocalData/assets/ directory for security
    // The actual path validation happens in the protocol handler in main.js
    // Returns null if platformPath is falsy
    convertToAssetURL: (platformPath) => {
        if (!platformPath) return null;
        // Normalize path separators to forward slashes for URL
        const normalizedPath = platformPath.replace(/\\/g, '/');
        return `asset://localhost/${encodeURIComponent(normalizedPath)}`;
    },

    // Set zoom factor on the webview (mirrors Tauri's zoom_window)
    zoomWindow: (scaleFactor) => ipcRenderer.invoke('zoom-window', scaleFactor),

    // In-memory storage for multi-window sync (mirrors Tauri's put_item/get_all_items)
    putItem: (key, value) => ipcRenderer.invoke('put-item', key, value),
    getAllItems: () => ipcRenderer.invoke('get-all-items')
});
