/**
 * IPC handlers for electronAppAPI
 * Preload location: contextBridge.exposeInMainWorld('electronAppAPI', { ... })
 *
 * NOTE: This file is copied from phoenix-fs library. Do not modify without
 * updating the source library. Only add new Phoenix-specific handlers to main-window-ipc.js.
 */

const { app, ipcMain } = require('electron');
const { spawn } = require('child_process');
const readline = require('readline');
const { productName } = require('./package.json');

let processInstanceId = 0;
// Map of instanceId -> { process, terminated }
const spawnedProcesses = new Map();

function waitForTrue(fn, timeout) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        function check() {
            if (fn()) {
                resolve(true);
            } else if (Date.now() - startTime > timeout) {
                resolve(false);
            } else {
                setTimeout(check, 50);
            }
        }
        check();
    });
}

async function terminateAllProcesses() {
    for (const [, instance] of spawnedProcesses) {
        if (!instance.terminated) {
            try {
                instance.process.kill();
            } catch (e) {
                // Process may already be terminated
            }

            await waitForTrue(() => instance.terminated, 1000);
        }
    }
}

function registerAppIpcHandlers() {
    // Spawn a child process and forward stdio to the calling renderer.
    // Returns an instanceId so the renderer can target the correct process.
    ipcMain.handle('spawn-process', async (event, command, args) => {
        const instanceId = ++processInstanceId;
        const sender = event.sender;
        console.log(`Spawning: ${command} ${args.join(' ')} (instance ${instanceId})`);

        const childProcess = spawn(command, args, {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const instance = { process: childProcess, terminated: false };
        spawnedProcesses.set(instanceId, instance);

        const rl = readline.createInterface({
            input: childProcess.stdout,
            crlfDelay: Infinity
        });

        rl.on('line', (line) => {
            if (!sender.isDestroyed()) {
                sender.send('process-stdout', instanceId, line);
            }
        });

        childProcess.stderr.on('data', (data) => {
            if (!sender.isDestroyed()) {
                sender.send('process-stderr', instanceId, data.toString());
            }
        });

        childProcess.on('close', (code, signal) => {
            instance.terminated = true;
            console.log(`Process (instance ${instanceId}) exited with code ${code} and signal ${signal}`);
            if (!sender.isDestroyed()) {
                sender.send('process-close', instanceId, { code, signal });
            }
        });

        childProcess.on('error', (err) => {
            instance.terminated = true;
            console.error(`Failed to start process (instance ${instanceId}):`, err);
            if (!sender.isDestroyed()) {
                sender.send('process-error', instanceId, { message: err.message, code: err.code });
            }
        });

        return instanceId;
    });

    // Write data to a specific spawned process stdin
    ipcMain.handle('write-to-process', (event, instanceId, data) => {
        const instance = spawnedProcesses.get(instanceId);
        if (instance && !instance.terminated) {
            instance.process.stdin.write(data);
        }
    });

    ipcMain.handle('quit-app', (event, exitCode) => {
        console.log('Quit requested with exit code:', exitCode);
        // This will be handled by the main module's gracefulShutdown
        app.emit('quit-requested', exitCode);
    });

    ipcMain.on('console-log', (event, message) => {
        console.log('Renderer:', message);
    });

    // CLI args (mirrors Tauri's cli.getMatches for --quit-when-done / -q)
    ipcMain.handle('get-cli-args', () => {
        return process.argv;
    });

    // App path (repo root when running from source)
    ipcMain.handle('get-app-path', () => {
        return app.getAppPath();
    });

    // App name from package.json
    ipcMain.handle('get-app-name', () => {
        return productName;
    });
}

module.exports = {
    registerAppIpcHandlers,
    terminateAllProcesses
};
