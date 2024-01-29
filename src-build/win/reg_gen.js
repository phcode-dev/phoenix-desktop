/**
 * This module generates NSIS (Nullsoft Scriptable Install System) scripts for setting file
 * associations and context menus, and a cleanup script to remove these settings.
 */
import fs from 'fs';

const installReg = 'install.txt'; // Replace with your file path
const outputFile = 'cleanup.txt'; // Output file path

/**
 * Creates an NSIS script to set file associations and context menu entries for various file extensions.
 * The script is written to a file specified by `installReg`.
 */
function createInstallRegEntries() {
    const extensions = [
        ".asax", ".ashx", ".aspx", ".atom", ".cf", ".cfc", ".cfm", ".cfm1", ".clj",
        ".coffee", ".cshtml", ".cson", ".css", ".ctp", ".dhtml", ".diff", ".ejs",
        ".handlebars", ".hbs", ".htm", ".html", ".hx", ".js", ".json", ".jsp", ".jsx",
        ".kit", ".less", ".markdown", ".mathml", ".md", ".patch", ".php", ".php3",
        ".php4", ".php5", ".phtm", ".phtml", ".rdf", ".rss", ".sass", ".scss",
        ".shtm", ".shtml", ".sql", ".svg", ".tpl", ".twig", ".wsgi", ".xbl", ".xht",
        ".xhtml", ".xml", ".xslt", ".xul", ".yaml", ".yml", ".ts", ".tsx"
    ];

    let nsisScript = '';

    extensions.forEach(ext => {
        const extName = ext.substring(1); // Remove the dot from the extension
        const typeName = `phcode${extName.toUpperCase()}`; // Create a type name

        nsisScript += `
  ; Set file association and context menu for ${ext} files
  WriteRegStr HKCU "Software\\Classes\\${ext}" "" "${typeName}"
  WriteRegStr HKCU "Software\\Classes\\${typeName}" "" "${extName.toUpperCase()} file"
  WriteRegStr HKCU "Software\\Classes\\${typeName}\\shell\\open\\command" "" '"${'$INSTDIR'}\\${'${MAINBINARYNAME}.exe'}" "%1"'
  WriteRegStr HKCU "Software\\Classes\\${typeName}\\shell\\open\\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\\Classes\\${typeName}\\shell\\open\\phcode\\command" "" '"${'$INSTDIR'}\\${'${MAINBINARYNAME}.exe'}" "%1"'
  WriteRegStr HKCU "Software\\Classes\\${typeName}\\shell\\phcode" "Icon" '${'$INSTDIR'}\\${'${MAINBINARYNAME}.exe,0'}'
  WriteRegStr HKCU "Software\\Classes\\${typeName}\\shell\\phcode" "" "Open with phoenix code"
  WriteRegStr HKCU "Software\\Classes\\${typeName}\\shell\\phcode\\command" "" '"${'$INSTDIR'}\\${'${MAINBINARYNAME}.exe'}" "%1"'
`;
    });

    nsisScript += `
  ; Add a context menu item for folders
  WriteRegStr HKCU "Software\\Classes\\Directory\\shell\\phcode" "" "Open as phoenix code project"
  WriteRegStr HKCU "Software\\Classes\\Directory\\shell\\phcode\\command" "" '"${'$INSTDIR'}\\${'${MAINBINARYNAME}.exe'}" "%1"'
  ; Optional: Set an icon for the context menu item
  WriteRegStr HKCU "Software\\Classes\\Directory\\shell\\phcode" "Icon" '"${'$INSTDIR'}\\${'${MAINBINARYNAME}.exe'}",0'
  WriteRegStr HKCU "SOFTWARE\\Classes\\Directory\\background\\shell\\phcode" "" "Open as phoenix code project"
  WriteRegStr HKCU "SOFTWARE\\Classes\\Directory\\background\\shell\\phcode" "Icon" '"${'$INSTDIR'}\\${'${MAINBINARYNAME}.exe'}"'
  WriteRegStr HKCU "SOFTWARE\\Classes\\Directory\\background\\shell\\phcode\\command" "" '"${'$INSTDIR'}\\${'${MAINBINARYNAME}.exe'}" "%V"'

`;
    fs.writeFileSync(installReg, nsisScript, err => {
        if (err) {
            console.error(err);
            return;
        }
        console.log('NSIS script generated successfully.');
    });
}

/**
 * Parses an NSIS script to extract registry keys and generates a cleanup script to remove these keys.
 * The cleanup script is written to a file specified by `outputFile`.
 */
function createCleanUpEntries() {
    /**
     * Extracts registry keys from the given NSIS script.
     * @param {string} script - NSIS script to parse.
     * @returns {string[]} An array of extracted registry keys.
     */
    function extractRegistryKeys(script) {
        const regKeyPattern = /WriteRegStr\sHKCU\s"([^"]+)"/g;
        const keys = new Set();

        let match;
        while ((match = regKeyPattern.exec(script)) !== null) {
            keys.add(match[1]);
        }

        return Array.from(keys);
    }

    /**
     * Generates an NSIS cleanup script using the provided registry keys.
     * @param {string[]} keys - Array of registry keys to be removed.
     * @returns {string} Generated NSIS cleanup script.
     */
    function generateCleanupScript(keys) {
        const commands = keys.map(key => `DeleteRegKey HKCU "${key}"`).join('\n');
        return `; NSIS Cleanup Script\n\n${commands}`;
    }

// Read the NSIS script, extract keys, generate cleanup script, and write to file
    fs.readFile(installReg, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return;
        }

        const keys = extractRegistryKeys(data);
        const cleanupScript = generateCleanupScript(keys);

        fs.writeFile(outputFile, cleanupScript, err => {
            if (err) {
                console.error('Error writing cleanup script:', err);
            } else {
                console.log('Cleanup script generated successfully:', outputFile);
            }
        });
    });
}

/**
 * Main function to create both install and cleanup NSIS scripts.
 */
function createRegistryEntryForNsis() {
    createInstallRegEntries();
    createCleanUpEntries();
}
// Execute the main function to generate scripts
// Once script this script is executed install.txt will contain nsis code to create registry entire to be created during installation
// cleanup.txt will contain nsis code to delete registry entries during uninstallation
// Copy this code to src-tauri/src/bundle/windows/nsis/installer.nsi Function SetupPhcode and Function un.CleanPhcode sections
createRegistryEntryForNsis();
