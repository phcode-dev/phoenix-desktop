const fs = require('fs');
const path = require('path');

// Read config-effective.json for productName and version
const configPath = path.join(__dirname, 'config-effective.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const productName = config.productName;
const version = config.version;

// Transform "Phoenix Code Experimental Build" → "phoenix-code-experimental-build"
const artifactBaseName = productName.toLowerCase().replace(/\s+/g, '-');

// Find the built AppImage in dist/ folder
const distDir = path.join(__dirname, 'dist');
const files = fs.readdirSync(distDir);
const appImageFile = files.find(f => f.endsWith('.AppImage'));

if (!appImageFile) {
    console.error('No AppImage found in dist/');
    process.exit(1);
}

const oldPath = path.join(distDir, appImageFile);
const newName = `${artifactBaseName}_${version}.AppImage`;
const newPath = path.join(distDir, newName);

console.log(`Renaming: ${appImageFile} → ${newName}`);
fs.renameSync(oldPath, newPath);
console.log(`Done: ${newPath}`);
