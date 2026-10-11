// Builds NSIS language files for Tauri's installer strings from Phoenix's translated `INSTALLER_*` strings,
// since Tauri v1 only translates them for a few languages.

import fs from "fs";
import path from "path";
import vm from "vm";

// NSIS LangString name -> [strings.js key, NSIS value for {1}]
const INSTALLER_STRINGS = {
    addOrReinstall: ["INSTALLER_ADD_OR_REINSTALL"],
    alreadyInstalled: ["INSTALLER_ALREADY_INSTALLED"],
    alreadyInstalledLong: ["INSTALLER_ALREADY_INSTALLED_LONG", "${VERSION}"],
    appRunning: ["INSTALLER_APP_RUNNING"],
    appRunningOkKill: ["INSTALLER_APP_RUNNING_OK_KILL"],
    chooseMaintenanceOption: ["INSTALLER_CHOOSE_MAINTENANCE_OPTION"],
    choowHowToInstall: ["INSTALLER_CHOOSE_HOW_TO_INSTALL"],
    createDesktop: ["INSTALLER_CREATE_DESKTOP_SHORTCUT"],
    dontUninstall: ["INSTALLER_DONT_UNINSTALL"],
    dontUninstallDowngrade: ["INSTALLER_DONT_UNINSTALL_DOWNGRADE"],
    failedToKillApp: ["INSTALLER_FAILED_TO_KILL_APP"],
    installingWebview2: ["INSTALLER_INSTALLING_WEBVIEW2"],
    newerVersionInstalled: ["INSTALLER_NEWER_VERSION_INSTALLED"],
    older: ["INSTALLER_OLDER"],
    olderOrUnknownVersionInstalled: ["INSTALLER_OLDER_OR_UNKNOWN_VERSION_INSTALLED", "$R4"],
    silentDowngrades: ["INSTALLER_SILENT_DOWNGRADES"],
    unableToUninstall: ["INSTALLER_UNABLE_TO_UNINSTALL"],
    uninstallApp: ["INSTALLER_UNINSTALL_APP"],
    uninstallBeforeInstalling: ["INSTALLER_UNINSTALL_BEFORE_INSTALLING"],
    unknown: ["INSTALLER_UNKNOWN"],
    webview2AbortError: ["INSTALLER_WEBVIEW2_ABORT_ERROR"],
    webview2DownloadError: ["INSTALLER_WEBVIEW2_DOWNLOAD_ERROR", "$0"],
    webview2DownloadSuccess: ["INSTALLER_WEBVIEW2_DOWNLOAD_SUCCESS"],
    webview2Downloading: ["INSTALLER_WEBVIEW2_DOWNLOADING"],
    webview2InstallError: ["INSTALLER_WEBVIEW2_INSTALL_ERROR", "$1"],
    webview2InstallSuccess: ["INSTALLER_WEBVIEW2_INSTALL_SUCCESS"],
    deleteAppData: ["INSTALLER_DELETE_APP_DATA"]
};

// English stays with Tauri: installer.nsi falls back to Tauri's English.nsh, which Tauri only writes when
// English has no custom file.
const LOCALE_TO_NSIS_LANGUAGES = {
    "ar": ["Arabic"],
    "bg": ["Bulgarian"],
    "cs": ["Czech"],
    "da": ["Danish"],
    "de": ["German"],
    "el": ["Greek"],
    "es": ["Spanish", "SpanishInternational"],
    "fa-ir": ["Farsi"],
    "fi": ["Finnish"],
    "fr": ["French"],
    "gl": ["Galician"],
    "hi": ["Hindi"],
    "hr": ["Croatian"],
    "hu": ["Hungarian"],
    "id": ["Indonesian"],
    "it": ["Italian"],
    "ja": ["Japanese"],
    "ko": ["Korean"],
    "lv": ["Latvian"],
    "nb": ["Norwegian"],
    "nl": ["Dutch"],
    "pl": ["Polish"],
    "pt-br": ["PortugueseBR"],
    "pt-pt": ["Portuguese"],
    "ro": ["Romanian"],
    "ru": ["Russian"],
    "sk": ["Slovak"],
    "sr": ["Serbian"],
    "sv": ["Swedish"],
    "tr": ["Turkish"],
    "uk": ["Ukrainian"],
    "zh-cn": ["SimpChinese"],
    "zh-tw": ["TradChinese"]
};

const NSIS_ESCAPES = {"$": "$$", "\"": "$\\\"", "\n": "$\\n", "\r": "$\\r", "\t": "$\\t"};

function _readStrings(stringsPath) {
    if (!fs.existsSync(stringsPath)) {
        return null;
    }
    let strings = null;
    vm.runInNewContext(fs.readFileSync(stringsPath, "utf8"), {
        define: (obj) => { strings = obj; }
    }, {filename: stringsPath});
    return strings;
}

function _placeholders(text) {
    return (text.match(/\{\d+\}/g) || []).sort().join();
}

function _toNsisString(text, extraValue) {
    return text.replace(/[$"\r\n\t]/g, (c) => NSIS_ESCAPES[c])
        .replace(/\{([01])\}/g, (match, index) => (index === "0" ? "${PRODUCTNAME}" : extraValue));
}

// A language only gets a file when all its strings are translated with the right placeholders, otherwise it
// keeps Tauri's built-in file or the English fallback.
export function patchTauriConfigWithInstallerTranslations(tauriConf, phoenixDir, outDir) {
    const nsisConf = tauriConf.tauri.bundle.windows.nsis;
    const nlsDir = path.join(phoenixDir, "src", "nls");
    const englishStrings = _readStrings(path.join(nlsDir, "root", "strings.js"));
    const missingInEnglish = Object.values(INSTALLER_STRINGS)
        .map(([key]) => key)
        .filter((key) => !englishStrings || typeof englishStrings[key] !== "string");
    if (missingInEnglish.length) {
        console.warn(`Installer translations skipped, phoenix at ${phoenixDir} has no ${missingInEnglish.join(", ")}`);
        return;
    }

    fs.rmSync(outDir, {recursive: true, force: true});
    fs.mkdirSync(outDir, {recursive: true});
    const configuredLanguages = new Set(nsisConf.languages);
    const generatedFiles = {};
    for (const [locale, nsisLanguages] of Object.entries(LOCALE_TO_NSIS_LANGUAGES)) {
        const languages = nsisLanguages.filter((language) => configuredLanguages.has(language));
        if (!languages.length) {
            continue;
        }
        const localeStrings = _readStrings(path.join(nlsDir, locale, "strings.js")) || {};
        const problems = [];
        for (const [key] of Object.values(INSTALLER_STRINGS)) {
            const text = localeStrings[key];
            if (typeof text !== "string" || !text.trim()) {
                problems.push(`${key} is not translated`);
            } else if (_placeholders(text) !== _placeholders(englishStrings[key])) {
                problems.push(`${key} has placeholders "${_placeholders(text)}", expected "${_placeholders(englishStrings[key])}"`);
            }
        }
        if (problems.length) {
            console.warn(`Installer translation for ${locale} skipped: ${problems.join("; ")}`);
            continue;
        }
        for (const language of languages) {
            const lines = Object.entries(INSTALLER_STRINGS).map(([nsisName, [key, extraValue]]) =>
                `LangString ${nsisName} \${LANG_${language.toUpperCase()}} "${_toNsisString(localeStrings[key], extraValue)}"`);
            const filePath = path.join(outDir, `${language}.nsh`);
            // UTF-16LE with BOM, like Tauri's own language files
            fs.writeFileSync(filePath, Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(lines.join("\r\n") + "\r\n", "utf16le")]));
            generatedFiles[language] = filePath;
        }
    }
    nsisConf.customLanguageFiles = {...generatedFiles, ...nsisConf.customLanguageFiles};
    console.log(`Installer translations generated for: ${Object.keys(generatedFiles).join(", ") || "none"}`);
}
