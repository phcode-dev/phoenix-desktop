const { ipcMain } = require('electron');
const crypto = require('crypto');
const { assertTrusted } = require('./ipc-security');

// Per-window AES trust map (mirrors Tauri's WindowAesTrust)
// Uses webContents.id which persists across page reloads but changes when window is destroyed
const windowTrustMap = new Map(); // webContentsId -> { key, iv }

// Keytar for system keychain (libsecret on Linux, Keychain on macOS, Credential Vault on Windows)
let keytar = null;
try {
    keytar = require('keytar');
} catch (e) {
    console.warn('keytar not available, credential storage will not work');
}

const PHOENIX_CRED_PREFIX = 'phcode_electron_';

function registerCredIpcHandlers() {
    // Trust window AES key - can only be called once per page load
    ipcMain.handle('trust-window-aes-key', (event, key, iv) => {
        assertTrusted(event);
        const webContentsId = event.sender.id;

        if (windowTrustMap.has(webContentsId)) {
            throw new Error('Trust has already been established for this window.');
        }

        // Validate key (64 hex chars = 32 bytes for AES-256)
        if (!/^[0-9a-fA-F]{64}$/.test(key)) {
            throw new Error('Invalid AES key. Must be 64 hex characters.');
        }
        // Validate IV (24 hex chars = 12 bytes for AES-GCM)
        if (!/^[0-9a-fA-F]{24}$/.test(iv)) {
            throw new Error('Invalid IV. Must be 24 hex characters.');
        }

        windowTrustMap.set(webContentsId, { key, iv });
        // Lazy require to avoid circular dependency
        const { getWindowLabel } = require('./main-window-ipc');
        console.log(`AES trust established for window: ${getWindowLabel(webContentsId)} (webContentsId: ${webContentsId})`);
    });

    // Remove trust - requires matching key/iv
    ipcMain.handle('remove-trust-window-aes-key', (event, key, iv) => {
        assertTrusted(event);
        const webContentsId = event.sender.id;
        const stored = windowTrustMap.get(webContentsId);

        if (!stored) {
            // Match Tauri's error message
            throw new Error('No trust association found for this window.');
        }
        if (stored.key !== key || stored.iv !== iv) {
            throw new Error('Provided key and IV do not match.');
        }

        windowTrustMap.delete(webContentsId);
        const { getWindowLabel } = require('./main-window-ipc');
        console.log(`AES trust removed for window: ${getWindowLabel(webContentsId)} (webContentsId: ${webContentsId})`);
    });

    // Special marker for empty string credentials (keytar doesn't allow empty passwords)
    // Using a unique string that's unlikely to be a real credential value
    const EMPTY_CREDENTIAL_MARKER = '___PHCODE_EMPTY_CREDENTIAL_MARKER___';

    // Store credential in system keychain
    ipcMain.handle('store-credential', async (event, scopeName, secretVal) => {
        assertTrusted(event);
        if (!keytar) {
            throw new Error('keytar module not available.');
        }
        const service = PHOENIX_CRED_PREFIX + scopeName;
        // Handle empty strings by storing a special marker (keytar requires non-empty passwords)
        // Check for empty string, null, or undefined - all become the marker
        const isEmpty = secretVal === '' || secretVal === null || secretVal === undefined;
        const valueToStore = isEmpty ? EMPTY_CREDENTIAL_MARKER : secretVal;
        await keytar.setPassword(service, process.env.USER || 'user', valueToStore);
    });

    // Get credential (encrypted with window's AES key)
    ipcMain.handle('get-credential', async (event, scopeName) => {
        assertTrusted(event);
        if (!keytar) {
            throw new Error('keytar module not available.');
        }

        const webContentsId = event.sender.id;
        const trustData = windowTrustMap.get(webContentsId);
        if (!trustData) {
            // Match Tauri's error message
            throw new Error('Trust needs to be first established for this window to get or set credentials.');
        }

        const service = PHOENIX_CRED_PREFIX + scopeName;
        const account = process.env.USER || 'user';
        let credential = await keytar.getPassword(service, account);
        if (credential === null || credential === undefined) {
            return null;
        }

        // Convert empty credential marker back to empty string
        if (credential === EMPTY_CREDENTIAL_MARKER) {
            credential = '';
        }

        // Encrypt with AES-256-GCM (same as Tauri)
        const keyBytes = Buffer.from(trustData.key, 'hex');
        const ivBytes = Buffer.from(trustData.iv, 'hex');
        const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes, ivBytes);
        let encrypted = cipher.update(credential, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');

        // For empty credentials, encrypted will be empty string, but authTag will still be present
        const result = encrypted + authTag;
        return result;
    });

    // Delete credential from system keychain
    ipcMain.handle('delete-credential', async (event, scopeName) => {
        assertTrusted(event);
        if (!keytar) {
            throw new Error('keytar module not available.');
        }
        const service = PHOENIX_CRED_PREFIX + scopeName;
        const deleted = await keytar.deletePassword(service, process.env.USER || 'user');
        // Match Tauri's behavior: throw if credential didn't exist
        if (!deleted) {
            throw new Error('No matching entry found in secure storage');
        }
    });
}

// Clean up trust when window closes
function cleanupWindowTrust(webContentsId, windowLabel) {
    if (windowTrustMap.has(webContentsId)) {
        windowTrustMap.delete(webContentsId);
        console.log(`AES trust auto-removed for closed window: ${windowLabel} (webContentsId: ${webContentsId})`);
    }
}

// Clear trust on navigation (page reload) - allows fresh trust to be established after reload
function clearTrustOnNavigation(webContentsId, windowLabel) {
    if (windowTrustMap.has(webContentsId)) {
        windowTrustMap.delete(webContentsId);
        console.log(`AES trust cleared for navigation in window: ${windowLabel} (webContentsId: ${webContentsId})`);
    }
}

module.exports = { registerCredIpcHandlers, cleanupWindowTrust, clearTrustOnNavigation };
