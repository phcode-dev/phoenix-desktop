import {getPlatformDetails} from "./utils.js";
import {execa} from "execa";
import chalk from "chalk";
import {resolve} from "path";

const {platform} = getPlatformDetails();

// Get target from CLI arg, or detect from platform
const cliArg = process.argv[2];
let target;

if (cliArg === 'tauri' || cliArg === 'electron') {
    target = cliArg;
} else if (cliArg) {
    console.error(`Unknown target: ${cliArg}`);
    console.error('Usage: npm run serve [tauri|electron]');
    process.exit(1);
} else {
    // Auto-detect: Linux uses Electron, Windows/Mac use Tauri
    target = (platform === "linux") ? "electron" : "tauri";
}

// Warn about non-standard platform/target combinations
const recommendedTarget = (platform === "linux") ? "electron" : "tauri";
if (target !== recommendedTarget) {
    const y = chalk.yellow;
    const b = chalk.bold.yellow;
    const line1 = `  Running ${target} on ${platform} is not officially supported.`;
    const line2 = `  Recommended: npm run serve (auto-detects ${recommendedTarget} for ${platform})`;
    const width = Math.max(50, line1.length, line2.length) + 2;
    const border = '═'.repeat(width);
    const pad = (str) => str + ' '.repeat(width - str.length);

    console.warn(y(`\n╔${border}╗`));
    console.warn(y('║') + b(pad('  ⚠️  NON-STANDARD PLATFORM CONFIGURATION')) + y('║'));
    console.warn(y(`╠${border}╣`));
    console.warn(y('║') + y(pad(line1)) + y('║'));
    console.warn(y('║') + y(pad(line2)) + y('║'));
    console.warn(y(`╚${border}╝\n`));
}

console.log(`Platform: ${platform}, target: ${target}`);

// Run common setup
console.log('\nEnsure to start phoenix server at http://localhost:8000 for development.');
console.log('Follow https://github.com/phcode-dev/phoenix#running-phoenix for instructions.\n');

// Run platform-specific command
if (target === "tauri") {
    console.log('Setting up src-node...');
    await execa("npm", ["run", "_make_src-node"], {stdio: "inherit"});

    console.log('Starting Tauri dev server...');
    await execa("npx", ["tauri", "dev"], {stdio: "inherit"});
} else {
    const srcNodePath = resolve("../phoenix/src-node");
    console.log(`Running "npm install" in ${srcNodePath}`);
    await execa("npm", ["install"], {cwd: srcNodePath, stdio: "inherit"});

    console.log('Starting Electron...');
    await execa("./src-electron/node_modules/.bin/electron", ["src-electron/main.js"], {stdio: "inherit"});
}
