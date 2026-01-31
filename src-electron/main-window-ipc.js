const { ipcMain, BrowserWindow, shell, clipboard } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { cleanupWindowTrust } = require('./main-cred-ipc');
const { isTrustedOrigin, updateTrustStatus, cleanupTrust, assertTrusted } = require('./ipc-security');
const { DEFAULTS, trackWindowState } = require('./window-state');

const PHOENIX_WINDOW_PREFIX = 'phcode-';
const PHOENIX_EXTENSION_WINDOW_PREFIX = 'extn-';
const MAX_WINDOWS = 30;

// Window registry: windowLabel -> BrowserWindow
const windowRegistry = new Map();
// Reverse lookup: webContentsId -> windowLabel
const webContentsToLabel = new Map();

function getNextLabel(prefix) {
    for (let i = 1; i <= MAX_WINDOWS; i++) {
        const label = `${prefix}${i}`;
        if (!windowRegistry.has(label)) {
            return label;
        }
    }
    throw new Error(`No free window label available for prefix: ${prefix}`);
}

// Track close handlers per window
const windowCloseHandlers = new Map();

// Callback when all registered windows are closed
let onAllWindowsClosedCallback = null;

function registerWindow(win, label) {
    const webContents = win.webContents;
    const webContentsId = webContents.id;
    windowRegistry.set(label, win);
    webContentsToLabel.set(webContentsId, label);

    // Initial trust evaluation
    updateTrustStatus(webContents);

    // Re-evaluate trust on navigation
    webContents.on('did-navigate', () => {
        updateTrustStatus(webContents);
    });
    webContents.on('did-navigate-in-page', () => {
        updateTrustStatus(webContents);
    });

    win.on('closed', () => {
        windowRegistry.delete(label);
        webContentsToLabel.delete(webContentsId);
        windowCloseHandlers.delete(webContentsId);
        // Clean up AES trust for closing window (mirrors Tauri's on_window_event CloseRequested handler)
        cleanupWindowTrust(webContentsId, label);
        // Clean up security trust
        cleanupTrust(webContentsId);
        // Notify if all registered windows are closed
        if (windowRegistry.size === 0 && onAllWindowsClosedCallback) {
            onAllWindowsClosedCallback();
        }
    });
}

function setupCloseHandler(win) {
    win.on('close', (event) => {
        const hasHandler = windowCloseHandlers.get(win.webContents.id);
        if (hasHandler && !win.forceClose) {
            event.preventDefault();
            win.webContents.send('close-requested');
        }
    });
}

function registerWindowIpcHandlers() {
    // Get all window labels (mirrors Tauri's _get_window_labels)
    ipcMain.handle('get-window-labels', (event) => {
        assertTrusted(event);
        return Array.from(windowRegistry.keys());
    });

    // Get current window's label
    ipcMain.handle('get-current-window-label', (event) => {
        assertTrusted(event);
        return webContentsToLabel.get(event.sender.id) || null;
    });

    // Create new window (mirrors openURLInPhoenixWindow for Electron)
    ipcMain.handle('create-phoenix-window', async (event, url, options) => {
        assertTrusted(event);
        const { windowTitle, fullscreen, resizable, height, minHeight, width, minWidth, isExtension } = options || {};

        const prefix = isExtension ? PHOENIX_EXTENSION_WINDOW_PREFIX : PHOENIX_WINDOW_PREFIX;
        const label = getNextLabel(prefix);

        // Resolve relative URLs based on the sender's current URL
        let resolvedUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
            const senderUrl = event.sender.getURL();
            if (senderUrl) {
                resolvedUrl = new URL(url, senderUrl).href;
            }
        }

        console.log(`Creating window ${label} with URL ${resolvedUrl}, isTrustedOrigin=${isTrustedOrigin(resolvedUrl)}`);

        const webPreferences = {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        };

        // Only inject preload for Phoenix windows with trusted URLs
        if (isTrustedOrigin(resolvedUrl)) {
            webPreferences.preload = path.join(__dirname, 'preload.js');
        }

        let windowConfig;
        if (isExtension) {
            // Extensions manage their own sizing
            windowConfig = {
                width: width || 800,
                height: height || 600,
                minWidth: minWidth,
                minHeight: minHeight
            };
        } else {
            // Phoenix windows: use defaults and ensure dimensions are at least the minimums
            const actualMinWidth = Math.max(minWidth || DEFAULTS.minWidth, DEFAULTS.minWidth);
            const actualMinHeight = Math.max(minHeight || DEFAULTS.minHeight, DEFAULTS.minHeight);
            windowConfig = {
                width: Math.max(width || DEFAULTS.width, actualMinWidth),
                height: Math.max(height || DEFAULTS.height, actualMinHeight),
                minWidth: actualMinWidth,
                minHeight: actualMinHeight
            };
        }

        const win = new BrowserWindow({
            ...windowConfig,
            fullscreen: fullscreen || false,
            resizable: resizable !== false,
            title: windowTitle || label,
            webPreferences
        });

        // uncomment line below if you want to open dev tools at app start
        // win.webContents.openDevTools();

        // Track window state for Phoenix windows (not extensions)
        if (!isExtension) {
            trackWindowState(win);
        }

        registerWindow(win, label);
        await win.loadURL(resolvedUrl);

        return label;
    });

    // Close current window
    ipcMain.handle('close-window', async (event) => {
        assertTrusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            win.close();
        }
    });

    // Close a window by its label
    ipcMain.handle('close-window-by-label', async (event, label) => {
        assertTrusted(event);
        const win = windowRegistry.get(label);
        if (win && !win.isDestroyed()) {
            win.close();
            return true;
        }
        return false;
    });

    // Focus current window and bring to front
    ipcMain.handle('focus-window', (event) => {
        assertTrusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            if (win.isMinimized()) {
                win.restore();
            }
            win.moveTop();
            win.show();
            win.focus();
        }
    });

    // Inter-window event system (mirrors Tauri's event system)
    // Send event to a specific window by label
    ipcMain.handle('emit-to-window', (event, targetLabel, eventName, payload) => {
        assertTrusted(event);
        const targetWin = windowRegistry.get(targetLabel);
        if (targetWin && !targetWin.isDestroyed()) {
            targetWin.webContents.send('window-event', { eventName, payload });
            return true;
        }
        return false;
    });

    // Broadcast event to all windows
    ipcMain.handle('emit-to-all-windows', (event, eventName, payload) => {
        assertTrusted(event);
        const senderLabel = webContentsToLabel.get(event.sender.id);
        for (const [label, win] of windowRegistry) {
            if (!win.isDestroyed() && label !== senderLabel) {
                win.webContents.send('window-event', { eventName, payload });
            }
        }
    });

    // Get process ID
    ipcMain.handle('get-process-id', (event) => {
        assertTrusted(event);
        return process.pid;
    });

    // Get platform architecture
    ipcMain.handle('get-platform-arch', (event) => {
        assertTrusted(event);
        return process.arch;
    });

    // Get current working directory
    ipcMain.handle('get-cwd', (event) => {
        assertTrusted(event);
        return process.cwd();
    });

    // Fullscreen APIs
    ipcMain.handle('is-fullscreen', (event) => {
        assertTrusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        return win ? win.isFullScreen() : false;
    });

    ipcMain.handle('set-fullscreen', (event, enable) => {
        assertTrusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            win.setFullScreen(enable);
        }
    });

    // Window title APIs
    ipcMain.handle('set-window-title', (event, title) => {
        assertTrusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            win.setTitle(title);
        }
    });

    ipcMain.handle('get-window-title', (event) => {
        assertTrusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        return win ? win.getTitle() : '';
    });

    // Clipboard APIs
    ipcMain.handle('clipboard-read-text', (event) => {
        assertTrusted(event);
        return clipboard.readText();
    });

    ipcMain.handle('clipboard-write-text', (event, text) => {
        assertTrusted(event);
        clipboard.writeText(text);
    });

    // Read file paths from clipboard (platform-specific)
    ipcMain.handle('clipboard-read-files', (event) => {
        assertTrusted(event);
        const formats = clipboard.availableFormats();

        // Windows: FileNameW format contains file paths
        if (process.platform === 'win32' && formats.includes('FileNameW')) {
            const buffer = clipboard.readBuffer('FileNameW');
            // FileNameW is null-terminated UTF-16LE string
            const paths = buffer.toString('utf16le').split('\0').filter(p => p.length > 0);
            return paths;
        }

        // macOS: public.file-url format
        if (process.platform === 'darwin') {
            // Try reading as file URLs
            const text = clipboard.read('public.file-url');
            if (text) {
                // Convert file:// URLs to paths (handle both \n and \r\n line endings)
                const paths = text.split(/\r?\n/)
                    .filter(url => url.startsWith('file://'))
                    .map(url => decodeURIComponent(url.replace('file://', '')));
                if (paths.length > 0) {
                    return paths;
                }
            }
        }

        // Linux: text/uri-list format (uses \r\n line endings per RFC 2483)
        if (process.platform === 'linux' && formats.includes('text/uri-list')) {
            const text = clipboard.read('text/uri-list');
            if (text) {
                const paths = text.split(/\r?\n/)
                    .filter(url => url.startsWith('file://'))
                    .map(url => decodeURIComponent(url.replace('file://', '')));
                if (paths.length > 0) {
                    return paths;
                }
            }
        }

        return null;
    });

    // Shell APIs
    ipcMain.handle('move-to-trash', async (event, platformPath) => {
        assertTrusted(event);
        await shell.trashItem(platformPath);
    });

    ipcMain.handle('show-in-folder', (event, platformPath) => {
        assertTrusted(event);
        shell.showItemInFolder(platformPath);
    });

    ipcMain.handle('open-external', async (event, url) => {
        assertTrusted(event);
        await shell.openExternal(url);
    });

    // Windows-only: open URL in specific browser (fire and forget)
    ipcMain.handle('open-url-in-browser-win', (event, url, browser) => {
        assertTrusted(event);
        if (process.platform !== 'win32') {
            throw new Error('open-url-in-browser-win is only supported on Windows');
        }
        spawn('cmd', ['/c', 'start', browser, url], { shell: true, detached: true, stdio: 'ignore' });
    });

    // Register close handler for current window
    ipcMain.handle('register-close-handler', (event) => {
        assertTrusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            windowCloseHandlers.set(win.webContents.id, true);
            setupCloseHandler(win);
        }
    });

    // Allow close after handler approves
    ipcMain.handle('allow-close', (event) => {
        assertTrusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            win.forceClose = true;
            win.close();
        }
    });
}

function getWindowLabel(webContentsId) {
    return webContentsToLabel.get(webContentsId) || 'unknown';
}

function setOnAllWindowsClosed(callback) {
    onAllWindowsClosedCallback = callback;
}

module.exports = { registerWindowIpcHandlers, registerWindow, getWindowLabel, setOnAllWindowsClosed };
