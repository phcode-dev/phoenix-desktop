Unicode true
; Set the compression algorithm. Default is LZMA.
!if "{{compression}}" == ""
  SetCompressor /SOLID lzma
!else
  SetCompressor /SOLID "{{compression}}"
!endif

!include MUI2.nsh
!include FileFunc.nsh
!include x64.nsh
!include WordFunc.nsh
!include "StrFunc.nsh"
${StrCase}
${StrLoc}

!define MANUFACTURER "{{manufacturer}}"
!define PRODUCTNAME "{{product_name}}"
!define VERSION "{{version}}"
!define VERSIONWITHBUILD "{{version_with_build}}"
!define SHORTDESCRIPTION "{{short_description}}"
!define INSTALLMODE "{{install_mode}}"
!define LICENSE "{{license}}"
!define INSTALLERICON "{{installer_icon}}"
!define SIDEBARIMAGE "{{sidebar_image}}"
!define HEADERIMAGE "{{header_image}}"
!define MAINBINARYNAME "{{main_binary_name}}"
!define MAINBINARYSRCPATH "{{main_binary_path}}"
!define BUNDLEID "{{bundle_id}}"
!define COPYRIGHT "{{copyright}}"
!define OUTFILE "{{out_file}}"
!define ARCH "{{arch}}"
!define PLUGINSPATH "{{additional_plugins_path}}"
!define ALLOWDOWNGRADES "{{allow_downgrades}}"
!define DISPLAYLANGUAGESELECTOR "{{display_language_selector}}"
!define INSTALLWEBVIEW2MODE "{{install_webview2_mode}}"
!define WEBVIEW2INSTALLERARGS "{{webview2_installer_args}}"
!define WEBVIEW2BOOTSTRAPPERPATH "{{webview2_bootstrapper_path}}"
!define WEBVIEW2INSTALLERPATH "{{webview2_installer_path}}"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}"
!define MANUPRODUCTKEY "Software\${MANUFACTURER}\${PRODUCTNAME}"
!define UNINSTALLERSIGNCOMMAND "{{uninstaller_sign_cmd}}"
!define ESTIMATEDSIZE "{{estimated_size}}"

Name "${PRODUCTNAME}"
BrandingText "${COPYRIGHT}"
OutFile "${OUTFILE}"

VIProductVersion "${VERSIONWITHBUILD}"
VIAddVersionKey "ProductName" "${PRODUCTNAME}"
VIAddVersionKey "FileDescription" "${SHORTDESCRIPTION}"
VIAddVersionKey "LegalCopyright" "${COPYRIGHT}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

; Plugins path, currently exists for linux only
!if "${PLUGINSPATH}" != ""
    !addplugindir "${PLUGINSPATH}"
!endif

!if "${UNINSTALLERSIGNCOMMAND}" != ""
  !uninstfinalize '${UNINSTALLERSIGNCOMMAND}'
!endif

; Handle install mode, `perUser`, `perMachine` or `both`
!if "${INSTALLMODE}" == "perMachine"
  RequestExecutionLevel highest
!endif

!if "${INSTALLMODE}" == "currentUser"
  RequestExecutionLevel user
!endif

!if "${INSTALLMODE}" == "both"
  !define MULTIUSER_MUI
  !define MULTIUSER_INSTALLMODE_INSTDIR "${PRODUCTNAME}"
  !define MULTIUSER_INSTALLMODE_COMMANDLINE
  !if "${ARCH}" == "x64"
    !define MULTIUSER_USE_PROGRAMFILES64
  !else if "${ARCH}" == "arm64"
    !define MULTIUSER_USE_PROGRAMFILES64
  !endif
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_KEY "${UNINSTKEY}"
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_VALUENAME "CurrentUser"
  !define MULTIUSER_INSTALLMODEPAGE_SHOWUSERNAME
  !define MULTIUSER_INSTALLMODE_FUNCTION RestorePreviousInstallLocation
  !define MULTIUSER_EXECUTIONLEVEL Highest
  !include MultiUser.nsh
!endif

; installer icon
!if "${INSTALLERICON}" != ""
  !define MUI_ICON "${INSTALLERICON}"
!endif

; installer sidebar image
!if "${SIDEBARIMAGE}" != ""
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${SIDEBARIMAGE}"
!endif

; installer header image
!if "${HEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE_BITMAP  "${HEADERIMAGE}"
!endif

; Define registry key to store installer language
!define MUI_LANGDLL_REGISTRY_ROOT "HKCU"
!define MUI_LANGDLL_REGISTRY_KEY "${MANUPRODUCTKEY}"
!define MUI_LANGDLL_REGISTRY_VALUENAME "Installer Language"

; Installer pages, must be ordered as they appear
; 1. Welcome Page
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_WELCOME

; 2. License Page (if defined)
!if "${LICENSE}" != ""
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !insertmacro MUI_PAGE_LICENSE "${LICENSE}"
!endif

; 3. Install mode (if it is set to `both`)
!if "${INSTALLMODE}" == "both"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !insertmacro MULTIUSER_PAGE_INSTALLMODE
!endif


; 4. Custom page to ask user if he wants to reinstall/uninstall
;    only if a previous installtion was detected
Var ReinstallPageCheck
Page custom PageReinstall PageLeaveReinstall
Function PageReinstall
  ; Uninstall previous WiX installation if exists.
  ;
  ; A WiX installer stores the isntallation info in registry
  ; using a UUID and so we have to loop through all keys under
  ; `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`
  ; and check if `DisplayName` and `Publisher` keys match ${PRODUCTNAME} and ${MANUFACTURER}
  ;
  ; This has a potentional issue that there maybe another installation that matches
  ; our ${PRODUCTNAME} and ${MANUFACTURER} but wasn't installed by our WiX installer,
  ; however, this should be fine since the user will have to confirm the uninstallation
  ; and they can chose to abort it if doesn't make sense.
  StrCpy $0 0
  wix_loop:
    EnumRegKey $1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" $0
    StrCmp $1 "" wix_done ; Exit loop if there is no more keys to loop on
    IntOp $0 $0 + 1
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
    ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "Publisher"
    StrCmp "$R0$R1" "${PRODUCTNAME}${MANUFACTURER}" 0 wix_loop
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "UninstallString"
    ${StrCase} $R1 $R0 "L"
    ${StrLoc} $R0 $R1 "msiexec" ">"
    StrCmp $R0 0 0 wix_done
    StrCpy $R7 "wix"
    StrCpy $R6 "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1"
    Goto compare_version
  wix_done:

  ; Check if there is an existing installation, if not, abort the reinstall page
  ReadRegStr $R0 SHCTX "${UNINSTKEY}" ""
  ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
  ${IfThen} "$R0$R1" == "" ${|} Abort ${|}

  ; Compare this installar version with the existing installation
  ; and modify the messages presented to the user accordingly
  compare_version:
  StrCpy $R4 "$(older)"
  ${If} $R7 == "wix"
    ReadRegStr $R0 HKLM "$R6" "DisplayVersion"
  ${Else}
    ReadRegStr $R0 SHCTX "${UNINSTKEY}" "DisplayVersion"
  ${EndIf}
  ${IfThen} $R0 == "" ${|} StrCpy $R4 "$(unknown)" ${|}

  nsis_tauri_utils::SemverCompare "${VERSION}" $R0
  Pop $R0
  ; Reinstalling the same version
  ${If} $R0 == 0
    StrCpy $R1 "$(alreadyInstalledLong)"
    StrCpy $R2 "$(addOrReinstall)"
    StrCpy $R3 "$(uninstallApp)"
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$(chooseMaintenanceOption)"
    StrCpy $R5 "2"
  ; Upgrading
  ${ElseIf} $R0 == 1
    StrCpy $R1 "$(olderOrUnknownVersionInstalled)"
    StrCpy $R2 "$(uninstallBeforeInstalling)"
    StrCpy $R3 "$(dontUninstall)"
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$(choowHowToInstall)"
    StrCpy $R5 "1"
  ; Downgrading
  ${ElseIf} $R0 == -1
    StrCpy $R1 "$(newerVersionInstalled)"
    StrCpy $R2 "$(uninstallBeforeInstalling)"
    !if "${ALLOWDOWNGRADES}" == "true"
      StrCpy $R3 "$(dontUninstall)"
    !else
      StrCpy $R3 "$(dontUninstallDowngrade)"
    !endif
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$(choowHowToInstall)"
    StrCpy $R5 "1"
  ${Else}
    Abort
  ${EndIf}

  Call SkipIfPassive

  nsDialogs::Create 1018
  Pop $R4
  ${IfThen} $(^RTL) == 1 ${|} nsDialogs::SetRTL $(^RTL) ${|}

  ${NSD_CreateLabel} 0 0 100% 24u $R1
  Pop $R1

  ${NSD_CreateRadioButton} 30u 50u -30u 8u $R2
  Pop $R2
  ${NSD_OnClick} $R2 PageReinstallUpdateSelection

  ${NSD_CreateRadioButton} 30u 70u -30u 8u $R3
  Pop $R3
  ; disable this radio button if downgrading and downgrades are disabled
  !if "${ALLOWDOWNGRADES}" == "false"
    ${IfThen} $R0 == -1 ${|} EnableWindow $R3 0 ${|}
  !endif
  ${NSD_OnClick} $R3 PageReinstallUpdateSelection

  ; Check the first radio button if this the first time
  ; we enter this page or if the second button wasn't
  ; selected the last time we were on this page
  ${If} $ReinstallPageCheck != 2
    SendMessage $R2 ${BM_SETCHECK} ${BST_CHECKED} 0
  ${Else}
    SendMessage $R3 ${BM_SETCHECK} ${BST_CHECKED} 0
  ${EndIf}

  ${NSD_SetFocus} $R2
  nsDialogs::Show
FunctionEnd
Function PageReinstallUpdateSelection
  ${NSD_GetState} $R2 $R1
  ${If} $R1 == ${BST_CHECKED}
    StrCpy $ReinstallPageCheck 1
  ${Else}
    StrCpy $ReinstallPageCheck 2
  ${EndIf}
FunctionEnd
Function PageLeaveReinstall
  ${NSD_GetState} $R2 $R1

  ; $R5 holds whether we are reinstalling the same version or not
  ; $R5 == "1" -> different versions
  ; $R5 == "2" -> same version
  ;
  ; $R1 holds the radio buttons state. its meaning is dependant on the context
  StrCmp $R5 "1" 0 +2 ; Existing install is not the same version?
    StrCmp $R1 "1" reinst_uninstall reinst_done ; $R1 == "1", then user chose to uninstall existing version, otherwise skip uninstalling
  StrCmp $R1 "1" reinst_done ; Same version? skip uninstalling

  reinst_uninstall:
    HideWindow
    ClearErrors

    ${If} $R7 == "wix"
      ReadRegStr $R1 HKLM "$R6" "UninstallString"
      ExecWait '$R1' $0
    ${Else}
      ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
      ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
      ExecWait '$R1 /P _?=$4' $0
    ${EndIf}

    BringToFront

    ${IfThen} ${Errors} ${|} StrCpy $0 2 ${|} ; ExecWait failed, set fake exit code

    ${If} $0 <> 0
    ${OrIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
      ${If} $0 = 1 ; User aborted uninstaller?
        StrCmp $R5 "2" 0 +2 ; Is the existing install the same version?
          Quit ; ...yes, already installed, we are done
        Abort
      ${EndIf}
      MessageBox MB_ICONEXCLAMATION "$(unableToUninstall)"
      Abort
    ${Else}
      StrCpy $0 $R1 1
      ${IfThen} $0 == '"' ${|} StrCpy $R1 $R1 -1 1 ${|} ; Strip quotes from UninstallString
      Delete $R1
      RMDir $INSTDIR
    ${EndIf}
  reinst_done:
FunctionEnd

; 5. Choose install directoy page
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_DIRECTORY

; 6. Start menu shortcut page
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
Var AppStartMenuFolder
!insertmacro MUI_PAGE_STARTMENU Application $AppStartMenuFolder

; 7. Installation page
!insertmacro MUI_PAGE_INSTFILES

; 8. Finish page
;
; Don't auto jump to finish page after installation page,
; because the installation page has useful info that can be used debug any issues with the installer.
!define MUI_FINISHPAGE_NOAUTOCLOSE
; Use show readme button in the finish page as a button create a desktop shortcut
!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "$(createDesktop)"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION CreateDesktopShortcut
; Show run app after installation.
!define MUI_FINISHPAGE_RUN "$INSTDIR\${MAINBINARYNAME}.exe"
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_FINISH

; Uninstaller Pages
; 1. Confirm uninstall page
Var DeleteAppDataCheckbox
Var DeleteAppDataCheckboxState
!define /ifndef WS_EX_LAYOUTRTL         0x00400000
!define MUI_PAGE_CUSTOMFUNCTION_SHOW un.ConfirmShow
Function un.ConfirmShow
    FindWindow $1 "#32770" "" $HWNDPARENT ; Find inner dialog
    ${If} $(^RTL) == 1
      System::Call 'USER32::CreateWindowEx(i${__NSD_CheckBox_EXSTYLE}|${WS_EX_LAYOUTRTL},t"${__NSD_CheckBox_CLASS}",t "$(deleteAppData)",i${__NSD_CheckBox_STYLE},i 50,i 100,i 400, i 25,i$1,i0,i0,i0)i.s'
    ${Else}
      System::Call 'USER32::CreateWindowEx(i${__NSD_CheckBox_EXSTYLE},t"${__NSD_CheckBox_CLASS}",t "$(deleteAppData)",i${__NSD_CheckBox_STYLE},i 0,i 100,i 400, i 25,i$1,i0,i0,i0)i.s'
    ${EndIf}
    Pop $DeleteAppDataCheckbox
    SendMessage $HWNDPARENT ${WM_GETFONT} 0 0 $1
    SendMessage $DeleteAppDataCheckbox ${WM_SETFONT} $1 1
FunctionEnd
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.ConfirmLeave
Function un.ConfirmLeave
    SendMessage $DeleteAppDataCheckbox ${BM_GETCHECK} 0 0 $DeleteAppDataCheckboxState
FunctionEnd
!insertmacro MUI_UNPAGE_CONFIRM

; 2. Uninstalling Page
!insertmacro MUI_UNPAGE_INSTFILES

;Languages
{{#each languages}}
!insertmacro MUI_LANGUAGE "{{this}}"
{{/each}}
!insertmacro MUI_RESERVEFILE_LANGDLL
{{#each language_files}}
  !include "{{this}}"
{{/each}}

!macro SetContext
  !if "${INSTALLMODE}" == "currentUser"
    SetShellVarContext current
  !else if "${INSTALLMODE}" == "perMachine"
    SetShellVarContext all
  !endif

  ${If} ${RunningX64}
    !if "${ARCH}" == "x64"
      SetRegView 64
    !else if "${ARCH}" == "arm64"
      SetRegView 64
    !else
      SetRegView 32
    !endif
  ${EndIf}
!macroend

Var PassiveMode
Function .onInit
  ${GetOptions} $CMDLINE "/P" $PassiveMode
  IfErrors +2 0
    StrCpy $PassiveMode 1

  !if "${DISPLAYLANGUAGESELECTOR}" == "true"
    !insertmacro MUI_LANGDLL_DISPLAY
  !endif

  !insertmacro SetContext

  ${If} $INSTDIR == ""
    ; Set default install location
    !if "${INSTALLMODE}" == "perMachine"
      ${If} ${RunningX64}
        !if "${ARCH}" == "x64"
          StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
        !else if "${ARCH}" == "arm64"
          StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
        !else
          StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
        !endif
      ${Else}
        StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
      ${EndIf}
    !else if "${INSTALLMODE}" == "currentUser"
      StrCpy $INSTDIR "$LOCALAPPDATA\${PRODUCTNAME}"
    !endif

    Call RestorePreviousInstallLocation
  ${EndIf}


  !if "${INSTALLMODE}" == "both"
    !insertmacro MULTIUSER_INIT
  !endif
FunctionEnd


Section EarlyChecks
  ; Abort silent installer if downgrades is disabled
  !if "${ALLOWDOWNGRADES}" == "false"
  IfSilent 0 silent_downgrades_done
    ; If downgrading
    ${If} $R0 == -1
      System::Call 'kernel32::AttachConsole(i -1)i.r0'
      ${If} $0 != 0
        System::Call 'kernel32::GetStdHandle(i -11)i.r0'
        System::call 'kernel32::SetConsoleTextAttribute(i r0, i 0x0004)' ; set red color
        FileWrite $0 "$(silentDowngrades)"
      ${EndIf}
      Abort
    ${EndIf}
  silent_downgrades_done:
  !endif

SectionEnd

Section WebView2
  ; Check if Webview2 is already installed and skip this section
  ${If} ${RunningX64}
    ReadRegStr $4 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${Else}
    ReadRegStr $4 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
  ReadRegStr $5 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"

  StrCmp $4 "" 0 webview2_done
  StrCmp $5 "" 0 webview2_done

  ; Webview2 install modes
  !if "${INSTALLWEBVIEW2MODE}" == "downloadBootstrapper"
    Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
    DetailPrint "$(webview2Downloading)"
    nsis_tauri_utils::download "https://go.microsoft.com/fwlink/p/?LinkId=2124703" "$TEMP\MicrosoftEdgeWebview2Setup.exe"
    Pop $0
    ${If} $0 == 0
      DetailPrint "$(webview2DownloadSuccess)"
    ${Else}
      DetailPrint "$(webview2DownloadError)"
      Abort "$(webview2AbortError)"
    ${EndIf}
    StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
    Goto install_webview2
  !endif

  !if "${INSTALLWEBVIEW2MODE}" == "embedBootstrapper"
    Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
    File "/oname=$TEMP\MicrosoftEdgeWebview2Setup.exe" "${WEBVIEW2BOOTSTRAPPERPATH}"
    DetailPrint "$(installingWebview2)"
    StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
    Goto install_webview2
  !endif

  !if "${INSTALLWEBVIEW2MODE}" == "offlineInstaller"
    Delete "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
    File "/oname=$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe" "${WEBVIEW2INSTALLERPATH}"
    DetailPrint "$(installingWebview2)"
    StrCpy $6 "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
    Goto install_webview2
  !endif

  Goto webview2_done

  install_webview2:
    DetailPrint "$(installingWebview2)"
    ; $6 holds the path to the webview2 installer
    ExecWait "$6 ${WEBVIEW2INSTALLERARGS} /install" $1
    ${If} $1 == 0
      DetailPrint "$(webview2InstallSuccess)"
    ${Else}
      DetailPrint "$(webview2InstallError)"
      Abort "$(webview2AbortError)"
    ${EndIf}
  webview2_done:
SectionEnd

!macro CheckIfAppIsRunning
  !if "${INSTALLMODE}" == "currentUser"
    nsis_tauri_utils::FindProcessCurrentUser "${MAINBINARYNAME}.exe"
  !else
    nsis_tauri_utils::FindProcess "${MAINBINARYNAME}.exe"
  !endif
  Pop $R0
  ${If} $R0 = 0
      IfSilent kill 0
      ${IfThen} $PassiveMode != 1 ${|} MessageBox MB_OKCANCEL "$(appRunningOkKill)" IDOK kill IDCANCEL cancel ${|}
      kill:
        !if "${INSTALLMODE}" == "currentUser"
          nsis_tauri_utils::KillProcessCurrentUser "${MAINBINARYNAME}.exe"
        !else
          nsis_tauri_utils::KillProcess "${MAINBINARYNAME}.exe"
        !endif
        Pop $R0
        Sleep 500
        ${If} $R0 = 0
          Goto app_check_done
        ${Else}
          IfSilent silent ui
          silent:
            System::Call 'kernel32::AttachConsole(i -1)i.r0'
            ${If} $0 != 0
              System::Call 'kernel32::GetStdHandle(i -11)i.r0'
              System::call 'kernel32::SetConsoleTextAttribute(i r0, i 0x0004)' ; set red color
              FileWrite $0 "$(appRunning)$\n"
            ${EndIf}
            Abort
          ui:
            Abort "$(failedToKillApp)"
        ${EndIf}
      cancel:
        Abort "$(appRunning)"
  ${EndIf}
  app_check_done:
!macroend

Function SetupPhcode

  ; Set file association and context menu for .asax files
  WriteRegStr HKCU "Software\Classes\.asax" "" "phcodeASAX"
  WriteRegStr HKCU "Software\Classes\phcodeASAX" "" "ASAX file"
  WriteRegStr HKCU "Software\Classes\phcodeASAX\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeASAX\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeASAX\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeASAX\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeASAX\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeASAX\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .ashx files
  WriteRegStr HKCU "Software\Classes\.ashx" "" "phcodeASHX"
  WriteRegStr HKCU "Software\Classes\phcodeASHX" "" "ASHX file"
  WriteRegStr HKCU "Software\Classes\phcodeASHX\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeASHX\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeASHX\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeASHX\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeASHX\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeASHX\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .aspx files
  WriteRegStr HKCU "Software\Classes\.aspx" "" "phcodeASPX"
  WriteRegStr HKCU "Software\Classes\phcodeASPX" "" "ASPX file"
  WriteRegStr HKCU "Software\Classes\phcodeASPX\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeASPX\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeASPX\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeASPX\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeASPX\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeASPX\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .atom files
  WriteRegStr HKCU "Software\Classes\.atom" "" "phcodeATOM"
  WriteRegStr HKCU "Software\Classes\phcodeATOM" "" "ATOM file"
  WriteRegStr HKCU "Software\Classes\phcodeATOM\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeATOM\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeATOM\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeATOM\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeATOM\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeATOM\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .cf files
  WriteRegStr HKCU "Software\Classes\.cf" "" "phcodeCF"
  WriteRegStr HKCU "Software\Classes\phcodeCF" "" "CF file"
  WriteRegStr HKCU "Software\Classes\phcodeCF\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCF\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCF\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCF\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeCF\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeCF\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .cfc files
  WriteRegStr HKCU "Software\Classes\.cfc" "" "phcodeCFC"
  WriteRegStr HKCU "Software\Classes\phcodeCFC" "" "CFC file"
  WriteRegStr HKCU "Software\Classes\phcodeCFC\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCFC\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCFC\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCFC\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeCFC\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeCFC\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .cfm files
  WriteRegStr HKCU "Software\Classes\.cfm" "" "phcodeCFM"
  WriteRegStr HKCU "Software\Classes\phcodeCFM" "" "CFM file"
  WriteRegStr HKCU "Software\Classes\phcodeCFM\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCFM\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCFM\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCFM\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeCFM\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeCFM\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .cfm1 files
  WriteRegStr HKCU "Software\Classes\.cfm1" "" "phcodeCFM1"
  WriteRegStr HKCU "Software\Classes\phcodeCFM1" "" "CFM1 file"
  WriteRegStr HKCU "Software\Classes\phcodeCFM1\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCFM1\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCFM1\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCFM1\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeCFM1\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeCFM1\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .clj files
  WriteRegStr HKCU "Software\Classes\.clj" "" "phcodeCLJ"
  WriteRegStr HKCU "Software\Classes\phcodeCLJ" "" "CLJ file"
  WriteRegStr HKCU "Software\Classes\phcodeCLJ\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCLJ\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCLJ\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCLJ\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeCLJ\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeCLJ\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .coffee files
  WriteRegStr HKCU "Software\Classes\.coffee" "" "phcodeCOFFEE"
  WriteRegStr HKCU "Software\Classes\phcodeCOFFEE" "" "COFFEE file"
  WriteRegStr HKCU "Software\Classes\phcodeCOFFEE\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCOFFEE\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCOFFEE\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCOFFEE\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeCOFFEE\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeCOFFEE\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .cshtml files
  WriteRegStr HKCU "Software\Classes\.cshtml" "" "phcodeCSHTML"
  WriteRegStr HKCU "Software\Classes\phcodeCSHTML" "" "CSHTML file"
  WriteRegStr HKCU "Software\Classes\phcodeCSHTML\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCSHTML\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCSHTML\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCSHTML\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeCSHTML\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeCSHTML\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .cson files
  WriteRegStr HKCU "Software\Classes\.cson" "" "phcodeCSON"
  WriteRegStr HKCU "Software\Classes\phcodeCSON" "" "CSON file"
  WriteRegStr HKCU "Software\Classes\phcodeCSON\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCSON\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCSON\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCSON\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeCSON\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeCSON\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .css files
  WriteRegStr HKCU "Software\Classes\.css" "" "phcodeCSS"
  WriteRegStr HKCU "Software\Classes\phcodeCSS" "" "CSS file"
  WriteRegStr HKCU "Software\Classes\phcodeCSS\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCSS\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCSS\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCSS\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeCSS\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeCSS\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .ctp files
  WriteRegStr HKCU "Software\Classes\.ctp" "" "phcodeCTP"
  WriteRegStr HKCU "Software\Classes\phcodeCTP" "" "CTP file"
  WriteRegStr HKCU "Software\Classes\phcodeCTP\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCTP\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCTP\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeCTP\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeCTP\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeCTP\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .dhtml files
  WriteRegStr HKCU "Software\Classes\.dhtml" "" "phcodeDHTML"
  WriteRegStr HKCU "Software\Classes\phcodeDHTML" "" "DHTML file"
  WriteRegStr HKCU "Software\Classes\phcodeDHTML\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeDHTML\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeDHTML\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeDHTML\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeDHTML\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeDHTML\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .diff files
  WriteRegStr HKCU "Software\Classes\.diff" "" "phcodeDIFF"
  WriteRegStr HKCU "Software\Classes\phcodeDIFF" "" "DIFF file"
  WriteRegStr HKCU "Software\Classes\phcodeDIFF\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeDIFF\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeDIFF\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeDIFF\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeDIFF\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeDIFF\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .ejs files
  WriteRegStr HKCU "Software\Classes\.ejs" "" "phcodeEJS"
  WriteRegStr HKCU "Software\Classes\phcodeEJS" "" "EJS file"
  WriteRegStr HKCU "Software\Classes\phcodeEJS\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeEJS\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeEJS\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeEJS\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeEJS\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeEJS\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .handlebars files
  WriteRegStr HKCU "Software\Classes\.handlebars" "" "phcodeHANDLEBARS"
  WriteRegStr HKCU "Software\Classes\phcodeHANDLEBARS" "" "HANDLEBARS file"
  WriteRegStr HKCU "Software\Classes\phcodeHANDLEBARS\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeHANDLEBARS\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeHANDLEBARS\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeHANDLEBARS\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeHANDLEBARS\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeHANDLEBARS\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .hbs files
  WriteRegStr HKCU "Software\Classes\.hbs" "" "phcodeHBS"
  WriteRegStr HKCU "Software\Classes\phcodeHBS" "" "HBS file"
  WriteRegStr HKCU "Software\Classes\phcodeHBS\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeHBS\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeHBS\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeHBS\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeHBS\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeHBS\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .htm files
  WriteRegStr HKCU "Software\Classes\.htm" "" "phcodeHTM"
  WriteRegStr HKCU "Software\Classes\phcodeHTM" "" "HTM file"
  WriteRegStr HKCU "Software\Classes\phcodeHTM\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeHTM\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeHTM\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeHTM\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeHTM\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeHTM\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .html files
  WriteRegStr HKCU "Software\Classes\.html" "" "phcodeHTML"
  WriteRegStr HKCU "Software\Classes\phcodeHTML" "" "HTML file"
  WriteRegStr HKCU "Software\Classes\phcodeHTML\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeHTML\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeHTML\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeHTML\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeHTML\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeHTML\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .hx files
  WriteRegStr HKCU "Software\Classes\.hx" "" "phcodeHX"
  WriteRegStr HKCU "Software\Classes\phcodeHX" "" "HX file"
  WriteRegStr HKCU "Software\Classes\phcodeHX\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeHX\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeHX\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeHX\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeHX\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeHX\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .js files
  WriteRegStr HKCU "Software\Classes\.js" "" "phcodeJS"
  WriteRegStr HKCU "Software\Classes\phcodeJS" "" "JS file"
  WriteRegStr HKCU "Software\Classes\phcodeJS\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeJS\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeJS\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeJS\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeJS\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeJS\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .json files
  WriteRegStr HKCU "Software\Classes\.json" "" "phcodeJSON"
  WriteRegStr HKCU "Software\Classes\phcodeJSON" "" "JSON file"
  WriteRegStr HKCU "Software\Classes\phcodeJSON\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeJSON\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeJSON\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeJSON\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeJSON\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeJSON\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .jsp files
  WriteRegStr HKCU "Software\Classes\.jsp" "" "phcodeJSP"
  WriteRegStr HKCU "Software\Classes\phcodeJSP" "" "JSP file"
  WriteRegStr HKCU "Software\Classes\phcodeJSP\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeJSP\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeJSP\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeJSP\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeJSP\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeJSP\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .jsx files
  WriteRegStr HKCU "Software\Classes\.jsx" "" "phcodeJSX"
  WriteRegStr HKCU "Software\Classes\phcodeJSX" "" "JSX file"
  WriteRegStr HKCU "Software\Classes\phcodeJSX\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeJSX\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeJSX\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeJSX\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeJSX\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeJSX\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .kit files
  WriteRegStr HKCU "Software\Classes\.kit" "" "phcodeKIT"
  WriteRegStr HKCU "Software\Classes\phcodeKIT" "" "KIT file"
  WriteRegStr HKCU "Software\Classes\phcodeKIT\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeKIT\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeKIT\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeKIT\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeKIT\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeKIT\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .less files
  WriteRegStr HKCU "Software\Classes\.less" "" "phcodeLESS"
  WriteRegStr HKCU "Software\Classes\phcodeLESS" "" "LESS file"
  WriteRegStr HKCU "Software\Classes\phcodeLESS\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeLESS\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeLESS\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeLESS\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeLESS\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeLESS\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .markdown files
  WriteRegStr HKCU "Software\Classes\.markdown" "" "phcodeMARKDOWN"
  WriteRegStr HKCU "Software\Classes\phcodeMARKDOWN" "" "MARKDOWN file"
  WriteRegStr HKCU "Software\Classes\phcodeMARKDOWN\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeMARKDOWN\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeMARKDOWN\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeMARKDOWN\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeMARKDOWN\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeMARKDOWN\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .mathml files
  WriteRegStr HKCU "Software\Classes\.mathml" "" "phcodeMATHML"
  WriteRegStr HKCU "Software\Classes\phcodeMATHML" "" "MATHML file"
  WriteRegStr HKCU "Software\Classes\phcodeMATHML\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeMATHML\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeMATHML\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeMATHML\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeMATHML\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeMATHML\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .md files
  WriteRegStr HKCU "Software\Classes\.md" "" "phcodeMD"
  WriteRegStr HKCU "Software\Classes\phcodeMD" "" "MD file"
  WriteRegStr HKCU "Software\Classes\phcodeMD\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeMD\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeMD\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeMD\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeMD\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeMD\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .patch files
  WriteRegStr HKCU "Software\Classes\.patch" "" "phcodePATCH"
  WriteRegStr HKCU "Software\Classes\phcodePATCH" "" "PATCH file"
  WriteRegStr HKCU "Software\Classes\phcodePATCH\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePATCH\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePATCH\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePATCH\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodePATCH\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodePATCH\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .php files
  WriteRegStr HKCU "Software\Classes\.php" "" "phcodePHP"
  WriteRegStr HKCU "Software\Classes\phcodePHP" "" "PHP file"
  WriteRegStr HKCU "Software\Classes\phcodePHP\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHP\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHP\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHP\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodePHP\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodePHP\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .php3 files
  WriteRegStr HKCU "Software\Classes\.php3" "" "phcodePHP3"
  WriteRegStr HKCU "Software\Classes\phcodePHP3" "" "PHP3 file"
  WriteRegStr HKCU "Software\Classes\phcodePHP3\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHP3\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHP3\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHP3\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodePHP3\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodePHP3\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .php4 files
  WriteRegStr HKCU "Software\Classes\.php4" "" "phcodePHP4"
  WriteRegStr HKCU "Software\Classes\phcodePHP4" "" "PHP4 file"
  WriteRegStr HKCU "Software\Classes\phcodePHP4\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHP4\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHP4\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHP4\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodePHP4\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodePHP4\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .php5 files
  WriteRegStr HKCU "Software\Classes\.php5" "" "phcodePHP5"
  WriteRegStr HKCU "Software\Classes\phcodePHP5" "" "PHP5 file"
  WriteRegStr HKCU "Software\Classes\phcodePHP5\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHP5\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHP5\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHP5\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodePHP5\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodePHP5\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .phtm files
  WriteRegStr HKCU "Software\Classes\.phtm" "" "phcodePHTM"
  WriteRegStr HKCU "Software\Classes\phcodePHTM" "" "PHTM file"
  WriteRegStr HKCU "Software\Classes\phcodePHTM\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHTM\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHTM\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHTM\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodePHTM\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodePHTM\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .phtml files
  WriteRegStr HKCU "Software\Classes\.phtml" "" "phcodePHTML"
  WriteRegStr HKCU "Software\Classes\phcodePHTML" "" "PHTML file"
  WriteRegStr HKCU "Software\Classes\phcodePHTML\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHTML\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHTML\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodePHTML\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodePHTML\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodePHTML\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .rdf files
  WriteRegStr HKCU "Software\Classes\.rdf" "" "phcodeRDF"
  WriteRegStr HKCU "Software\Classes\phcodeRDF" "" "RDF file"
  WriteRegStr HKCU "Software\Classes\phcodeRDF\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeRDF\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeRDF\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeRDF\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeRDF\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeRDF\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .rss files
  WriteRegStr HKCU "Software\Classes\.rss" "" "phcodeRSS"
  WriteRegStr HKCU "Software\Classes\phcodeRSS" "" "RSS file"
  WriteRegStr HKCU "Software\Classes\phcodeRSS\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeRSS\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeRSS\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeRSS\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeRSS\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeRSS\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .sass files
  WriteRegStr HKCU "Software\Classes\.sass" "" "phcodeSASS"
  WriteRegStr HKCU "Software\Classes\phcodeSASS" "" "SASS file"
  WriteRegStr HKCU "Software\Classes\phcodeSASS\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSASS\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSASS\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSASS\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeSASS\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeSASS\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .scss files
  WriteRegStr HKCU "Software\Classes\.scss" "" "phcodeSCSS"
  WriteRegStr HKCU "Software\Classes\phcodeSCSS" "" "SCSS file"
  WriteRegStr HKCU "Software\Classes\phcodeSCSS\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSCSS\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSCSS\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSCSS\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeSCSS\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeSCSS\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .shtm files
  WriteRegStr HKCU "Software\Classes\.shtm" "" "phcodeSHTM"
  WriteRegStr HKCU "Software\Classes\phcodeSHTM" "" "SHTM file"
  WriteRegStr HKCU "Software\Classes\phcodeSHTM\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSHTM\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSHTM\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSHTM\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeSHTM\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeSHTM\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .shtml files
  WriteRegStr HKCU "Software\Classes\.shtml" "" "phcodeSHTML"
  WriteRegStr HKCU "Software\Classes\phcodeSHTML" "" "SHTML file"
  WriteRegStr HKCU "Software\Classes\phcodeSHTML\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSHTML\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSHTML\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSHTML\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeSHTML\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeSHTML\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .sql files
  WriteRegStr HKCU "Software\Classes\.sql" "" "phcodeSQL"
  WriteRegStr HKCU "Software\Classes\phcodeSQL" "" "SQL file"
  WriteRegStr HKCU "Software\Classes\phcodeSQL\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSQL\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSQL\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSQL\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeSQL\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeSQL\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .svg files
  WriteRegStr HKCU "Software\Classes\.svg" "" "phcodeSVG"
  WriteRegStr HKCU "Software\Classes\phcodeSVG" "" "SVG file"
  WriteRegStr HKCU "Software\Classes\phcodeSVG\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSVG\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSVG\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeSVG\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeSVG\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeSVG\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .tpl files
  WriteRegStr HKCU "Software\Classes\.tpl" "" "phcodeTPL"
  WriteRegStr HKCU "Software\Classes\phcodeTPL" "" "TPL file"
  WriteRegStr HKCU "Software\Classes\phcodeTPL\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeTPL\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeTPL\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeTPL\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeTPL\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeTPL\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .twig files
  WriteRegStr HKCU "Software\Classes\.twig" "" "phcodeTWIG"
  WriteRegStr HKCU "Software\Classes\phcodeTWIG" "" "TWIG file"
  WriteRegStr HKCU "Software\Classes\phcodeTWIG\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeTWIG\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeTWIG\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeTWIG\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeTWIG\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeTWIG\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .wsgi files
  WriteRegStr HKCU "Software\Classes\.wsgi" "" "phcodeWSGI"
  WriteRegStr HKCU "Software\Classes\phcodeWSGI" "" "WSGI file"
  WriteRegStr HKCU "Software\Classes\phcodeWSGI\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeWSGI\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeWSGI\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeWSGI\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeWSGI\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeWSGI\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .xbl files
  WriteRegStr HKCU "Software\Classes\.xbl" "" "phcodeXBL"
  WriteRegStr HKCU "Software\Classes\phcodeXBL" "" "XBL file"
  WriteRegStr HKCU "Software\Classes\phcodeXBL\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXBL\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXBL\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXBL\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeXBL\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeXBL\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .xht files
  WriteRegStr HKCU "Software\Classes\.xht" "" "phcodeXHT"
  WriteRegStr HKCU "Software\Classes\phcodeXHT" "" "XHT file"
  WriteRegStr HKCU "Software\Classes\phcodeXHT\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXHT\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXHT\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXHT\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeXHT\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeXHT\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .xhtml files
  WriteRegStr HKCU "Software\Classes\.xhtml" "" "phcodeXHTML"
  WriteRegStr HKCU "Software\Classes\phcodeXHTML" "" "XHTML file"
  WriteRegStr HKCU "Software\Classes\phcodeXHTML\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXHTML\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXHTML\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXHTML\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeXHTML\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeXHTML\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .xml files
  WriteRegStr HKCU "Software\Classes\.xml" "" "phcodeXML"
  WriteRegStr HKCU "Software\Classes\phcodeXML" "" "XML file"
  WriteRegStr HKCU "Software\Classes\phcodeXML\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXML\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXML\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXML\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeXML\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeXML\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .xslt files
  WriteRegStr HKCU "Software\Classes\.xslt" "" "phcodeXSLT"
  WriteRegStr HKCU "Software\Classes\phcodeXSLT" "" "XSLT file"
  WriteRegStr HKCU "Software\Classes\phcodeXSLT\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXSLT\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXSLT\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXSLT\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeXSLT\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeXSLT\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .xul files
  WriteRegStr HKCU "Software\Classes\.xul" "" "phcodeXUL"
  WriteRegStr HKCU "Software\Classes\phcodeXUL" "" "XUL file"
  WriteRegStr HKCU "Software\Classes\phcodeXUL\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXUL\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXUL\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeXUL\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeXUL\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeXUL\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .yaml files
  WriteRegStr HKCU "Software\Classes\.yaml" "" "phcodeYAML"
  WriteRegStr HKCU "Software\Classes\phcodeYAML" "" "YAML file"
  WriteRegStr HKCU "Software\Classes\phcodeYAML\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeYAML\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeYAML\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeYAML\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeYAML\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeYAML\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .yml files
  WriteRegStr HKCU "Software\Classes\.yml" "" "phcodeYML"
  WriteRegStr HKCU "Software\Classes\phcodeYML" "" "YML file"
  WriteRegStr HKCU "Software\Classes\phcodeYML\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeYML\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeYML\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeYML\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeYML\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeYML\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .ts files
  WriteRegStr HKCU "Software\Classes\.ts" "" "phcodeTS"
  WriteRegStr HKCU "Software\Classes\phcodeTS" "" "TS file"
  WriteRegStr HKCU "Software\Classes\phcodeTS\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeTS\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeTS\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeTS\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeTS\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeTS\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Set file association and context menu for .tsx files
  WriteRegStr HKCU "Software\Classes\.tsx" "" "phcodeTSX"
  WriteRegStr HKCU "Software\Classes\phcodeTSX" "" "TSX file"
  WriteRegStr HKCU "Software\Classes\phcodeTSX\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeTSX\shell\open\phcode" "" '"Open with phcode" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeTSX\shell\open\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\phcodeTSX\shell\phcode" "Icon" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\phcodeTSX\shell\phcode" "" "Open with Phoenix Code"
  WriteRegStr HKCU "Software\Classes\phcodeTSX\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Add a context menu item for folders
  WriteRegStr HKCU "Software\Classes\Directory\shell\phcode" "" "Open as Phoenix Code project"
  WriteRegStr HKCU "Software\Classes\Directory\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  ; Optional: Set an icon for the context menu item
  WriteRegStr HKCU "Software\Classes\Directory\shell\phcode" "Icon" '"$INSTDIR\${MAINBINARYNAME}.exe",0'
  WriteRegStr HKCU "SOFTWARE\Classes\Directory\background\shell\phcode" "" "Open as phoenix code project"
  WriteRegStr HKCU "SOFTWARE\Classes\Directory\background\shell\phcode" "Icon" '"$INSTDIR\${MAINBINARYNAME}.exe"'
  WriteRegStr HKCU "SOFTWARE\Classes\Directory\background\shell\phcode\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%V"'


FunctionEnd

Section Install
  SetOutPath $INSTDIR

  !insertmacro CheckIfAppIsRunning

  ; Copy main executable
  File "${MAINBINARYSRCPATH}"

  ; Copy resources
  {{#each resources_dirs}}
    CreateDirectory "$INSTDIR\\{{this}}"
  {{/each}}
  {{#each resources}}
    File /a "/oname={{this.[1]}}" "{{@key}}"
  {{/each}}

  ; Copy external binaries
  {{#each binaries}}
    File /a "/oname={{this}}" "{{@key}}"
  {{/each}}

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Save $INSTDIR in registry for future installations
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "" $INSTDIR

  !if "${INSTALLMODE}" == "both"
    ; Save install mode to be selected by default for the next installation such as updating
    ; or when uninstalling
    WriteRegStr SHCTX "${UNINSTKEY}" $MultiUser.InstallMode 1
  !endif

  ; Registry information for add/remove programs
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayIcon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr SHCTX "${UNINSTKEY}" "Publisher" "${MANUFACTURER}"
  WriteRegStr SHCTX "${UNINSTKEY}" "InstallLocation" "$\"$INSTDIR$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoModify" "1"
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoRepair" "1"
  WriteRegDWORD SHCTX "${UNINSTKEY}" "EstimatedSize" "${ESTIMATEDSIZE}"

  ; Create start menu shortcut (GUI)
  !insertmacro MUI_STARTMENU_WRITE_BEGIN Application
    Call CreateStartMenuShortcut
  !insertmacro MUI_STARTMENU_WRITE_END

  ; Create shortcuts for silent and passive installers, which
  ; can be disabled by passing `/NS` flag
  ; GUI installer has buttons for users to control creating them
  IfSilent check_ns_flag 0
  ${IfThen} $PassiveMode == 1 ${|} Goto check_ns_flag ${|}
  Goto shortcuts_done
  check_ns_flag:
    ${GetOptions} $CMDLINE "/NS" $R0
    IfErrors 0 shortcuts_done
      Call CreateDesktopShortcut
      Call CreateStartMenuShortcut
  shortcuts_done:

  ; Auto close this page for passive mode
  ${IfThen} $PassiveMode == 1 ${|} SetAutoClose true ${|}

  Call SetupPhcode
SectionEnd

Function .onInstSuccess
  ; Check for `/R` flag only in silent and passive installers because
  ; GUI installer has a toggle for the user to (re)start the app
  IfSilent check_r_flag 0
  ${IfThen} $PassiveMode == 1 ${|} Goto check_r_flag ${|}
  Goto run_done
  check_r_flag:
    ${GetOptions} $CMDLINE "/R" $R0
    IfErrors run_done 0
      Exec '"$INSTDIR\${MAINBINARYNAME}.exe"'
  run_done:
FunctionEnd

Function un.onInit
  !insertmacro SetContext

  !if "${INSTALLMODE}" == "both"
    !insertmacro MULTIUSER_UNINIT
  !endif

  !insertmacro MUI_UNGETLANGUAGE
FunctionEnd

Function un.CleanPhcode
; NSIS Cleanup Script

  DeleteRegKey HKCU "Software\Classes\.asax"
  DeleteRegKey HKCU "Software\Classes\phcodeASAX"
  DeleteRegKey HKCU "Software\Classes\phcodeASAX\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeASAX\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeASAX\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeASAX\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeASAX\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.ashx"
  DeleteRegKey HKCU "Software\Classes\phcodeASHX"
  DeleteRegKey HKCU "Software\Classes\phcodeASHX\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeASHX\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeASHX\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeASHX\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeASHX\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.aspx"
  DeleteRegKey HKCU "Software\Classes\phcodeASPX"
  DeleteRegKey HKCU "Software\Classes\phcodeASPX\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeASPX\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeASPX\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeASPX\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeASPX\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.atom"
  DeleteRegKey HKCU "Software\Classes\phcodeATOM"
  DeleteRegKey HKCU "Software\Classes\phcodeATOM\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeATOM\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeATOM\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeATOM\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeATOM\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.cf"
  DeleteRegKey HKCU "Software\Classes\phcodeCF"
  DeleteRegKey HKCU "Software\Classes\phcodeCF\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCF\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCF\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCF\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCF\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.cfc"
  DeleteRegKey HKCU "Software\Classes\phcodeCFC"
  DeleteRegKey HKCU "Software\Classes\phcodeCFC\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCFC\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCFC\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCFC\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCFC\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.cfm"
  DeleteRegKey HKCU "Software\Classes\phcodeCFM"
  DeleteRegKey HKCU "Software\Classes\phcodeCFM\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCFM\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCFM\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCFM\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCFM\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.cfm1"
  DeleteRegKey HKCU "Software\Classes\phcodeCFM1"
  DeleteRegKey HKCU "Software\Classes\phcodeCFM1\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCFM1\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCFM1\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCFM1\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCFM1\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.clj"
  DeleteRegKey HKCU "Software\Classes\phcodeCLJ"
  DeleteRegKey HKCU "Software\Classes\phcodeCLJ\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCLJ\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCLJ\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCLJ\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCLJ\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.coffee"
  DeleteRegKey HKCU "Software\Classes\phcodeCOFFEE"
  DeleteRegKey HKCU "Software\Classes\phcodeCOFFEE\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCOFFEE\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCOFFEE\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCOFFEE\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCOFFEE\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.cshtml"
  DeleteRegKey HKCU "Software\Classes\phcodeCSHTML"
  DeleteRegKey HKCU "Software\Classes\phcodeCSHTML\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCSHTML\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCSHTML\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCSHTML\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCSHTML\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.cson"
  DeleteRegKey HKCU "Software\Classes\phcodeCSON"
  DeleteRegKey HKCU "Software\Classes\phcodeCSON\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCSON\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCSON\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCSON\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCSON\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.css"
  DeleteRegKey HKCU "Software\Classes\phcodeCSS"
  DeleteRegKey HKCU "Software\Classes\phcodeCSS\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCSS\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCSS\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCSS\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCSS\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.ctp"
  DeleteRegKey HKCU "Software\Classes\phcodeCTP"
  DeleteRegKey HKCU "Software\Classes\phcodeCTP\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCTP\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCTP\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeCTP\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeCTP\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.dhtml"
  DeleteRegKey HKCU "Software\Classes\phcodeDHTML"
  DeleteRegKey HKCU "Software\Classes\phcodeDHTML\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeDHTML\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeDHTML\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeDHTML\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeDHTML\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.diff"
  DeleteRegKey HKCU "Software\Classes\phcodeDIFF"
  DeleteRegKey HKCU "Software\Classes\phcodeDIFF\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeDIFF\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeDIFF\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeDIFF\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeDIFF\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.ejs"
  DeleteRegKey HKCU "Software\Classes\phcodeEJS"
  DeleteRegKey HKCU "Software\Classes\phcodeEJS\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeEJS\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeEJS\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeEJS\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeEJS\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.handlebars"
  DeleteRegKey HKCU "Software\Classes\phcodeHANDLEBARS"
  DeleteRegKey HKCU "Software\Classes\phcodeHANDLEBARS\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeHANDLEBARS\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeHANDLEBARS\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeHANDLEBARS\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeHANDLEBARS\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.hbs"
  DeleteRegKey HKCU "Software\Classes\phcodeHBS"
  DeleteRegKey HKCU "Software\Classes\phcodeHBS\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeHBS\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeHBS\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeHBS\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeHBS\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.htm"
  DeleteRegKey HKCU "Software\Classes\phcodeHTM"
  DeleteRegKey HKCU "Software\Classes\phcodeHTM\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeHTM\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeHTM\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeHTM\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeHTM\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.html"
  DeleteRegKey HKCU "Software\Classes\phcodeHTML"
  DeleteRegKey HKCU "Software\Classes\phcodeHTML\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeHTML\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeHTML\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeHTML\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeHTML\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.hx"
  DeleteRegKey HKCU "Software\Classes\phcodeHX"
  DeleteRegKey HKCU "Software\Classes\phcodeHX\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeHX\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeHX\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeHX\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeHX\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.js"
  DeleteRegKey HKCU "Software\Classes\phcodeJS"
  DeleteRegKey HKCU "Software\Classes\phcodeJS\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeJS\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeJS\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeJS\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeJS\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.json"
  DeleteRegKey HKCU "Software\Classes\phcodeJSON"
  DeleteRegKey HKCU "Software\Classes\phcodeJSON\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeJSON\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeJSON\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeJSON\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeJSON\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.jsp"
  DeleteRegKey HKCU "Software\Classes\phcodeJSP"
  DeleteRegKey HKCU "Software\Classes\phcodeJSP\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeJSP\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeJSP\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeJSP\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeJSP\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.jsx"
  DeleteRegKey HKCU "Software\Classes\phcodeJSX"
  DeleteRegKey HKCU "Software\Classes\phcodeJSX\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeJSX\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeJSX\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeJSX\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeJSX\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.kit"
  DeleteRegKey HKCU "Software\Classes\phcodeKIT"
  DeleteRegKey HKCU "Software\Classes\phcodeKIT\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeKIT\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeKIT\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeKIT\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeKIT\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.less"
  DeleteRegKey HKCU "Software\Classes\phcodeLESS"
  DeleteRegKey HKCU "Software\Classes\phcodeLESS\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeLESS\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeLESS\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeLESS\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeLESS\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.markdown"
  DeleteRegKey HKCU "Software\Classes\phcodeMARKDOWN"
  DeleteRegKey HKCU "Software\Classes\phcodeMARKDOWN\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeMARKDOWN\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeMARKDOWN\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeMARKDOWN\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeMARKDOWN\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.mathml"
  DeleteRegKey HKCU "Software\Classes\phcodeMATHML"
  DeleteRegKey HKCU "Software\Classes\phcodeMATHML\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeMATHML\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeMATHML\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeMATHML\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeMATHML\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.md"
  DeleteRegKey HKCU "Software\Classes\phcodeMD"
  DeleteRegKey HKCU "Software\Classes\phcodeMD\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeMD\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeMD\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeMD\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeMD\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.patch"
  DeleteRegKey HKCU "Software\Classes\phcodePATCH"
  DeleteRegKey HKCU "Software\Classes\phcodePATCH\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodePATCH\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodePATCH\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodePATCH\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodePATCH\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.php"
  DeleteRegKey HKCU "Software\Classes\phcodePHP"
  DeleteRegKey HKCU "Software\Classes\phcodePHP\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodePHP\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodePHP\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodePHP\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodePHP\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.php3"
  DeleteRegKey HKCU "Software\Classes\phcodePHP3"
  DeleteRegKey HKCU "Software\Classes\phcodePHP3\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodePHP3\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodePHP3\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodePHP3\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodePHP3\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.php4"
  DeleteRegKey HKCU "Software\Classes\phcodePHP4"
  DeleteRegKey HKCU "Software\Classes\phcodePHP4\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodePHP4\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodePHP4\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodePHP4\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodePHP4\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.php5"
  DeleteRegKey HKCU "Software\Classes\phcodePHP5"
  DeleteRegKey HKCU "Software\Classes\phcodePHP5\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodePHP5\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodePHP5\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodePHP5\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodePHP5\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.phtm"
  DeleteRegKey HKCU "Software\Classes\phcodePHTM"
  DeleteRegKey HKCU "Software\Classes\phcodePHTM\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodePHTM\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodePHTM\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodePHTM\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodePHTM\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.phtml"
  DeleteRegKey HKCU "Software\Classes\phcodePHTML"
  DeleteRegKey HKCU "Software\Classes\phcodePHTML\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodePHTML\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodePHTML\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodePHTML\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodePHTML\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.rdf"
  DeleteRegKey HKCU "Software\Classes\phcodeRDF"
  DeleteRegKey HKCU "Software\Classes\phcodeRDF\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeRDF\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeRDF\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeRDF\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeRDF\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.rss"
  DeleteRegKey HKCU "Software\Classes\phcodeRSS"
  DeleteRegKey HKCU "Software\Classes\phcodeRSS\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeRSS\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeRSS\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeRSS\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeRSS\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.sass"
  DeleteRegKey HKCU "Software\Classes\phcodeSASS"
  DeleteRegKey HKCU "Software\Classes\phcodeSASS\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeSASS\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeSASS\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeSASS\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeSASS\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.scss"
  DeleteRegKey HKCU "Software\Classes\phcodeSCSS"
  DeleteRegKey HKCU "Software\Classes\phcodeSCSS\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeSCSS\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeSCSS\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeSCSS\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeSCSS\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.shtm"
  DeleteRegKey HKCU "Software\Classes\phcodeSHTM"
  DeleteRegKey HKCU "Software\Classes\phcodeSHTM\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeSHTM\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeSHTM\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeSHTM\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeSHTM\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.shtml"
  DeleteRegKey HKCU "Software\Classes\phcodeSHTML"
  DeleteRegKey HKCU "Software\Classes\phcodeSHTML\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeSHTML\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeSHTML\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeSHTML\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeSHTML\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.sql"
  DeleteRegKey HKCU "Software\Classes\phcodeSQL"
  DeleteRegKey HKCU "Software\Classes\phcodeSQL\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeSQL\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeSQL\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeSQL\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeSQL\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.svg"
  DeleteRegKey HKCU "Software\Classes\phcodeSVG"
  DeleteRegKey HKCU "Software\Classes\phcodeSVG\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeSVG\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeSVG\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeSVG\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeSVG\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.tpl"
  DeleteRegKey HKCU "Software\Classes\phcodeTPL"
  DeleteRegKey HKCU "Software\Classes\phcodeTPL\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeTPL\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeTPL\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeTPL\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeTPL\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.twig"
  DeleteRegKey HKCU "Software\Classes\phcodeTWIG"
  DeleteRegKey HKCU "Software\Classes\phcodeTWIG\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeTWIG\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeTWIG\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeTWIG\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeTWIG\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.wsgi"
  DeleteRegKey HKCU "Software\Classes\phcodeWSGI"
  DeleteRegKey HKCU "Software\Classes\phcodeWSGI\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeWSGI\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeWSGI\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeWSGI\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeWSGI\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.xbl"
  DeleteRegKey HKCU "Software\Classes\phcodeXBL"
  DeleteRegKey HKCU "Software\Classes\phcodeXBL\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeXBL\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeXBL\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeXBL\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeXBL\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.xht"
  DeleteRegKey HKCU "Software\Classes\phcodeXHT"
  DeleteRegKey HKCU "Software\Classes\phcodeXHT\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeXHT\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeXHT\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeXHT\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeXHT\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.xhtml"
  DeleteRegKey HKCU "Software\Classes\phcodeXHTML"
  DeleteRegKey HKCU "Software\Classes\phcodeXHTML\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeXHTML\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeXHTML\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeXHTML\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeXHTML\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.xml"
  DeleteRegKey HKCU "Software\Classes\phcodeXML"
  DeleteRegKey HKCU "Software\Classes\phcodeXML\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeXML\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeXML\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeXML\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeXML\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.xslt"
  DeleteRegKey HKCU "Software\Classes\phcodeXSLT"
  DeleteRegKey HKCU "Software\Classes\phcodeXSLT\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeXSLT\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeXSLT\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeXSLT\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeXSLT\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.xul"
  DeleteRegKey HKCU "Software\Classes\phcodeXUL"
  DeleteRegKey HKCU "Software\Classes\phcodeXUL\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeXUL\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeXUL\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeXUL\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeXUL\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.yaml"
  DeleteRegKey HKCU "Software\Classes\phcodeYAML"
  DeleteRegKey HKCU "Software\Classes\phcodeYAML\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeYAML\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeYAML\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeYAML\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeYAML\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.yml"
  DeleteRegKey HKCU "Software\Classes\phcodeYML"
  DeleteRegKey HKCU "Software\Classes\phcodeYML\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeYML\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeYML\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeYML\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeYML\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.ts"
  DeleteRegKey HKCU "Software\Classes\phcodeTS"
  DeleteRegKey HKCU "Software\Classes\phcodeTS\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeTS\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeTS\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeTS\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeTS\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\.tsx"
  DeleteRegKey HKCU "Software\Classes\phcodeTSX"
  DeleteRegKey HKCU "Software\Classes\phcodeTSX\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\phcodeTSX\shell\open\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeTSX\shell\open\phcode\command"
  DeleteRegKey HKCU "Software\Classes\phcodeTSX\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\phcodeTSX\shell\phcode\command"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\phcode"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\phcode\command"
  DeleteRegKey HKCU "SOFTWARE\Classes\Directory\background\shell\phcode"
  DeleteRegKey HKCU "SOFTWARE\Classes\Directory\background\shell\phcode\command"
FunctionEnd

Section Uninstall
  !insertmacro CheckIfAppIsRunning

  ; Delete the app directory and its content from disk
  ; Copy main executable
  Delete "$INSTDIR\${MAINBINARYNAME}.exe"

  ; Delete resources
  {{#each resources}}
    Delete "$INSTDIR\\{{this.[1]}}"
  {{/each}}

  ; Delete external binaries
  {{#each binaries}}
    Delete "$INSTDIR\\{{this}}"
  {{/each}}

  ; Delete uninstaller
  Delete "$INSTDIR\uninstall.exe"

  ${If} $DeleteAppDataCheckboxState == 1
    RMDir /R /REBOOTOK "$INSTDIR"
  ${Else}
    {{#each resources_ancestors}}
    RMDir /REBOOTOK "$INSTDIR\\{{this}}"
    {{/each}}
    RMDir "$INSTDIR"
  ${EndIf}
  Call un.CleanPhcode
  !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
  Delete "$SMPROGRAMS\$AppStartMenuFolder\${MAINBINARYNAME}.lnk"
  RMDir "$SMPROGRAMS\$AppStartMenuFolder"

  ; Remove desktop shortcuts
  Delete "$DESKTOP\${MAINBINARYNAME}.lnk"

  ; Remove registry information for add/remove programs
  !if "${INSTALLMODE}" == "both"
    DeleteRegKey SHCTX "${UNINSTKEY}"
  !else if "${INSTALLMODE}" == "perMachine"
    DeleteRegKey HKLM "${UNINSTKEY}"
  !else
    DeleteRegKey HKCU "${UNINSTKEY}"
  !endif

  DeleteRegValue HKCU "${MANUPRODUCTKEY}" "Installer Language"

  ; Delete app data
  ${If} $DeleteAppDataCheckboxState == 1
    SetShellVarContext current
    RmDir /r "$APPDATA\${BUNDLEID}"
    RmDir /r "$LOCALAPPDATA\${BUNDLEID}"
  ${EndIf}

  ${GetOptions} $CMDLINE "/P" $R0
  IfErrors +2 0
    SetAutoClose true
SectionEnd

Function RestorePreviousInstallLocation
  ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
  StrCmp $4 "" +2 0
    StrCpy $INSTDIR $4
FunctionEnd

Function SkipIfPassive
  ${IfThen} $PassiveMode == 1  ${|} Abort ${|}
FunctionEnd

Function CreateDesktopShortcut
  CreateShortcut "$DESKTOP\${MAINBINARYNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  ApplicationID::Set "$DESKTOP\${MAINBINARYNAME}.lnk" "${BUNDLEID}"
FunctionEnd

Function CreateStartMenuShortcut
  CreateDirectory "$SMPROGRAMS\$AppStartMenuFolder"
  CreateShortcut "$SMPROGRAMS\$AppStartMenuFolder\${MAINBINARYNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  ApplicationID::Set "$SMPROGRAMS\$AppStartMenuFolder\${MAINBINARYNAME}.lnk" "${BUNDLEID}"
FunctionEnd
