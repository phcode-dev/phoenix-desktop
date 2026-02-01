const { contextBridge, ipcRenderer, webUtils } = require('electron');

/**
 * electronAppAPI - Process lifecycle and app info APIs
 * NOTE: This API block is copied from phoenix-fs library. Do not modify without
 * updating the source library. Only add new Phoenix-specific APIs to electronAPI below.
 */
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
    onProcessError: (callback) => ipcRenderer.on('process-error', (_event, instanceId, err) => callback(instanceId, err)),

    // Quit the app with an exit code (for CI)
    quitApp: (exitCode) => ipcRenderer.invoke('quit-app', exitCode),

    // Log to main process console
    consoleLog: (message) => ipcRenderer.send('console-log', message),

    // Flag to identify Electron environment
    isElectron: true,

    // CLI
    getCliArgs: () => ipcRenderer.invoke('get-cli-args')
});

/**
 * electronFSAPI - File system APIs
 * NOTE: This API block is copied from phoenix-fs library. Do not modify without
 * updating the source library. Only add new Phoenix-specific APIs to electronAPI below.
 */
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
        // Encode each path segment individually to preserve URL path structure (like Tauri's convertFileSrc)
        const encodedPath = normalizedPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
        return `asset://localhost${encodedPath}`;
    },

    // Set zoom factor on the webview (mirrors Tauri's zoom_window)
    zoomWindow: (scaleFactor) => ipcRenderer.invoke('zoom-window', scaleFactor),

    /**
     * In-memory storage for multi-window sync (mirrors Tauri's put_item/get_all_items)
     * WARNING: These APIs are ONLY for use by storage.js - do not use elsewhere
     */
    putItem: (key, value) => ipcRenderer.invoke('put-item', key, value),
    getAllItems: () => ipcRenderer.invoke('get-all-items'),

    // Toggle DevTools
    toggleDevTools: () => ipcRenderer.invoke('toggle-dev-tools'),

    // Path to phnode binary (src-electron/bin/phnode)
    getPhNodePath: () => ipcRenderer.invoke('get-phnode-path'),

    // Path to src-node for development (../phoenix/src-node)
    // Throws if path does not exist
    getSrcNodePath: () => ipcRenderer.invoke('get-src-node-path'),

    // Trust ring / credential APIs
    trustWindowAesKey: (key, iv) => ipcRenderer.invoke('trust-window-aes-key', key, iv),
    removeTrustWindowAesKey: (key, iv) => ipcRenderer.invoke('remove-trust-window-aes-key', key, iv),
    storeCredential: (scopeName, secretVal) => ipcRenderer.invoke('store-credential', scopeName, secretVal),
    getCredential: (scopeName) => ipcRenderer.invoke('get-credential', scopeName),
    deleteCredential: (scopeName) => ipcRenderer.invoke('delete-credential', scopeName),

    // Window management APIs (mirrors Tauri's window labeling scheme)
    getWindowLabels: () => ipcRenderer.invoke('get-window-labels'),
    getCurrentWindowLabel: () => ipcRenderer.invoke('get-current-window-label'),
    createPhoenixWindow: (url, options) => ipcRenderer.invoke('create-phoenix-window', url, options),
    closeWindow: () => ipcRenderer.invoke('close-window'),
    closeWindowByLabel: (label) => ipcRenderer.invoke('close-window-by-label', label),
    quitApp: (exitCode) => ipcRenderer.invoke('quit-app', exitCode),
    focusWindow: () => ipcRenderer.invoke('focus-window'),

    // Inter-window event system (mirrors Tauri's event system)
    emitToWindow: (targetLabel, eventName, payload) => ipcRenderer.invoke('emit-to-window', targetLabel, eventName, payload),
    emitToAllWindows: (eventName, payload) => ipcRenderer.invoke('emit-to-all-windows', eventName, payload),
    onWindowEvent: (eventName, callback) => {
        const handler = (event, data) => {
            if (data.eventName === eventName) {
                callback(data.payload);
            }
        };
        ipcRenderer.on('window-event', handler);
        // Return unlisten function (like Tauri)
        return () => ipcRenderer.removeListener('window-event', handler);
    },

    // Process and platform info
    getProcessId: () => ipcRenderer.invoke('get-process-id'),
    getPlatformArch: () => ipcRenderer.invoke('get-platform-arch'),
    getCwd: () => ipcRenderer.invoke('get-cwd'),

    // Fullscreen APIs
    isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
    setFullscreen: (enable) => ipcRenderer.invoke('set-fullscreen', enable),

    // Window title APIs
    setWindowTitle: (title) => ipcRenderer.invoke('set-window-title', title),
    getWindowTitle: () => ipcRenderer.invoke('get-window-title'),

    // Clipboard APIs
    clipboardReadText: () => ipcRenderer.invoke('clipboard-read-text'),
    clipboardWriteText: (text) => ipcRenderer.invoke('clipboard-write-text', text),
    clipboardReadFiles: () => ipcRenderer.invoke('clipboard-read-files'),

    // Shell APIs
    moveToTrash: (platformPath) => ipcRenderer.invoke('move-to-trash', platformPath),
    showInFolder: (platformPath) => ipcRenderer.invoke('show-in-folder', platformPath),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    openUrlInBrowserWin: (url, browser) => ipcRenderer.invoke('open-url-in-browser-win', url, browser),

    // Close requested handler
    onCloseRequested: (callback) => ipcRenderer.on('close-requested', () => callback()),
    registerCloseHandler: () => ipcRenderer.invoke('register-close-handler'),
    allowClose: () => ipcRenderer.invoke('allow-close'),

    // Single instance event listener (mirrors Tauri's single-instance event)
    onSingleInstance: (callback) => ipcRenderer.on('single-instance', (_event, payload) => callback(payload)),

    // Drag and drop: get native file path from a dropped File object
    getPathForFile: (file) => webUtils.getPathForFile(file),

    // Health metrics for Google Analytics (sends to hidden metrics window)
    sendHealthMetric: (payload) => ipcRenderer.send('send-health-metric', payload),
    onHealthMetric: (callback) => ipcRenderer.on('health-metric', (_event, payload) => callback(payload)),

    // App updater APIs - just expose primitives, logic is in update-electron.js
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    isPackaged: () => ipcRenderer.invoke('is-packaged'),
    getExecutablePath: () => ipcRenderer.invoke('get-executable-path'),
    setUpdateScheduled: (scheduled) => ipcRenderer.invoke('set-update-scheduled', scheduled),
    getUpdateScheduled: () => ipcRenderer.invoke('get-update-scheduled')
});
