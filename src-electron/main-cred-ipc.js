const { ipcMain } = require('electron');
const crypto = require('crypto');

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
    // Trust window AES key - can only be called once per window
    ipcMain.handle('trust-window-aes-key', (event, key, iv) => {
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
        console.log(`AES trust established for webContents: ${webContentsId}`);
    });

    // Remove trust - requires matching key/iv
    ipcMain.handle('remove-trust-window-aes-key', (event, key, iv) => {
        const webContentsId = event.sender.id;
        const stored = windowTrustMap.get(webContentsId);

        if (!stored) {
            throw new Error('No trust established for this window.');
        }
        if (stored.key !== key || stored.iv !== iv) {
            throw new Error('Provided key and IV do not match.');
        }

        windowTrustMap.delete(webContentsId);
        console.log(`AES trust removed for webContents: ${webContentsId}`);
    });

    // Store credential in system keychain
    ipcMain.handle('store-credential', async (event, scopeName, secretVal) => {
        if (!keytar) {
            throw new Error('keytar module not available.');
        }
        const service = PHOENIX_CRED_PREFIX + scopeName;
        await keytar.setPassword(service, process.env.USER || 'user', secretVal);
    });

    // Get credential (encrypted with window's AES key)
    ipcMain.handle('get-credential', async (event, scopeName) => {
        if (!keytar) {
            throw new Error('keytar module not available.');
        }

        const webContentsId = event.sender.id;
        const trustData = windowTrustMap.get(webContentsId);
        if (!trustData) {
            throw new Error('Trust needs to be established first.');
        }

        const service = PHOENIX_CRED_PREFIX + scopeName;
        const credential = await keytar.getPassword(service, process.env.USER || 'user');
        if (!credential) {
            return null;
        }

        // Encrypt with AES-256-GCM (same as Tauri)
        const keyBytes = Buffer.from(trustData.key, 'hex');
        const ivBytes = Buffer.from(trustData.iv, 'hex');
        const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes, ivBytes);
        let encrypted = cipher.update(credential, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');

        return encrypted + authTag; // Return ciphertext + authTag as hex string
    });

    // Delete credential from system keychain
    ipcMain.handle('delete-credential', async (event, scopeName) => {
        if (!keytar) {
            throw new Error('keytar module not available.');
        }
        const service = PHOENIX_CRED_PREFIX + scopeName;
        await keytar.deletePassword(service, process.env.USER || 'user');
    });
}

// Clean up trust when window closes
function cleanupWindowTrust(webContentsId) {
    if (windowTrustMap.has(webContentsId)) {
        windowTrustMap.delete(webContentsId);
        console.log(`AES trust auto-removed for closed webContents: ${webContentsId}`);
    }
}

module.exports = { registerCredIpcHandlers, cleanupWindowTrust };
