#!/bin/bash
set -euo pipefail

# Phoenix Code Linux installer.
#
# Downloads the latest Phoenix Code AppImage from the update JSON, then probes
# the downloaded AppImage with `--version` (early-exit handler at
# src-electron/main.js:23-26). If the probe succeeds, no apt/dnf/pacman install
# is attempted — the system already has every shared library Phoenix Code
# needs at startup, regardless of which package name provides it.
#
# Beyond the --version probe, the installer also checks for the gnome-keyring
# daemon binary — libsecret needs the daemon for keytar credential storage,
# and --version exits before keytar is require()d. Sudo is only requested if
# libs or the keyring daemon are actually missing.
#
# On Ubuntu 24.04+ / Debian 13+, Chromium's unprivileged userns sandbox can
# be blocked by the kernel sysctl. The app still launches because the wrapper
# script falls back to --no-sandbox; we no longer install an AppArmor profile
# to keep the kernel sandbox enabled (the renderer-RCE-to-syscall threat the
# kernel sandbox guards against is narrow, and Phoenix Code's actual attack
# surface flows through the IPC bridge which the kernel sandbox doesn't gate).
#
# Also wires up a desktop entry + `phcode` wrapper script that handles
# AppImage launch fallbacks.

DESKTOP_DIR=$HOME/.local/share/applications
UPDATE_JSON_URL="https://updates.phcode.io/tauri/update-latest-stable-prod.json"
ICON_URL="https://updates.phcode.io/icons/phoenix_icon.png"
INSTALL_DIR="$HOME/.phoenix-code"
LINK_DIR="$HOME/.local/bin"
DESKTOP_ENTRY_NAME="PhoenixCode.desktop"
DESKTOP_APP_NAME="Phoenix Code"
DESKTOP_ENTRY="$DESKTOP_DIR/$DESKTOP_ENTRY_NAME"
SCRIPT_NAME="phcode"
BINARY_NAME="phoenix-code"
APPIMAGE_NAME="phoenix-code.AppImage"
MIN_GLIBC_VERSION="2.35"

declare -a MIME_TYPES=(
    "text/html"
    "application/atom+xml"
    "application/x-coldfusion"
    "text/x-clojure"
    "text/coffeescript"
    "application/json"
    "text/css"
    "text/x-diff"
    "text/jsx"
    "text/markdown"
    "application/mathml+xml"
    "application/rdf+xml"
    "application/rss+xml"
    "application/sql"
    "image/svg+xml"
    "text/x-python"
    "application/xml"
    "application/vnd.mozilla.xul+xml"
    "application/x-yaml"
    "text/javascript"
    "application/javascript"
    "text/mjs"
    "application/mjs"
    "text/cjs"
)

GREEN="\e[32m"
YELLOW="\e[33m"
RED="\e[31m"
RESET="\e[0m"

cleanup() {
    rm -rf "$TMP_DIR"
}
# Surface user interrupts (Ctrl+C / kill) with a clear message and exit 130,
# while still running cleanup. Without this, dpkg unpacks and sudo prompts can
# make the script look unresponsive to SIGINT for a beat.
on_interrupt() {
  echo
  echo -e "${RED}Interrupted by user. Cleaning up...${RESET}"
  cleanup
  exit 130
}
trap cleanup EXIT
trap on_interrupt INT TERM

TMP_DIR=$(mktemp -d)

configure_wget_options() {
  local wget_version
  wget_version=$(wget --version | head -n1 | awk '{print $3}')
  local major_version
  major_version=$(echo "$wget_version" | cut -d. -f1)

  if [[ "$major_version" -ge 2 ]]; then
    echo "-c --tries=10 --timeout=30 --waitretry=5 --progress=bar --retry-connrefused -O"
  else
    echo "-c -N --tries=10 --timeout=30 --waitretry=5 --retry-connrefused --show-progress -qO"
  fi
}

check_architecture() {
    local arch
    arch=$(uname -m)
    if [ "$arch" != "x86_64" ]; then
      echo -e "${RED}This installer only supports 64-bit x86 (x86_64). Detected: $arch.${RESET}"
      exit 1
    fi
}

# Runtime-library probe: ask the AppImage to print its version and exit. This
# is handled at src-electron/main.js:23-26, but `require('electron')` runs
# before that handler — which means Chromium initializes its sandbox bits even
# for --version. On Ubuntu 24.04+ / Debian 13+ where unprivileged user
# namespaces are restricted, that init can SIGTRAP. Pass --no-sandbox so the
# probe isolates to "are the system shared libraries present and loadable?"
# regardless of the kernel's userns policy.
#
# The `{ … } 2>/dev/null` wrapper suppresses bash's own "Trace/breakpoint trap
# (core dumped)" report when the subprocess dies on signal — those messages
# look alarming but are harmless: we already detect failure via the exit code.
verify_appimage_launches() {
  { "$1" --no-sandbox --version >/dev/null 2>&1; } 2>/dev/null
}

# Returns 0 if the gnome-keyring secret-service daemon binary is on PATH.
# `--version` can't test this because keytar is only require()d at first use,
# so we need an independent presence check.
gnome_keyring_present() {
  command -v gnome-keyring-daemon >/dev/null 2>&1
}

downloadLatestReleaseInfo() {
  local release_info_file="$TMP_DIR/latest_release.json"
  if [ ! -f "$release_info_file" ]; then
    >&2 echo -e "${GREEN}Fetching the latest release information...${RESET}"
    wget -qO "$release_info_file" "$UPDATE_JSON_URL" || {
      >&2 echo -e "${RED}Failed to fetch release info from $UPDATE_JSON_URL. Check your internet connection.${RESET}"
      exit 1
    }
  fi
  grep -Po '"version"\s*:\s*"\K[^"]+' "$release_info_file" | head -n1
}

# Parses the linux-x86_64 download URL out of the update JSON without needing jq.
getLinuxAppImageUrl() {
  awk '
    /"linux-x86_64"[[:space:]]*:/ { in_linux=1 }
    in_linux && /"url"[[:space:]]*:/ {
      if (match($0, /"url"[[:space:]]*:[[:space:]]*"[^"]+"/)) {
        s = substr($0, RSTART, RLENGTH)
        sub(/^"url"[[:space:]]*:[[:space:]]*"/, "", s)
        sub(/"$/, "", s)
        print s
        exit
      }
    }
  ' "$TMP_DIR/latest_release.json"
}

# Generates the `phcode` wrapper script. The wrapper runs the AppImage directly,
# falling back to --appimage-extract-and-run on FUSE failure or to --no-sandbox
# on userns/AppArmor failure (Ubuntu 24.04+ / Debian 13+ blocks Chromium's
# unprivileged user namespace sandbox unless our AppArmor profile is loaded).
create_invocation_script() {
  local install_dir="$1"
  local script_name="$2"
  local link_dir="$3"

  echo "Creating an invocation script for the AppImage..."
  cat > "$install_dir/$script_name" <<EOF
#!/bin/bash
# DO NOT DELETE: This script is generated by the Phoenix Code installer.
APPIMAGE="$install_dir/$APPIMAGE_NAME"
ERR=\$(mktemp)
if ! "\$APPIMAGE" "\$@" 2>"\$ERR"; then
  if grep -qiE 'fuse|libfuse|fusermount|/dev/fuse' "\$ERR"; then
    rm -f "\$ERR"
    exec "\$APPIMAGE" --appimage-extract-and-run "\$@"
  fi
  if grep -qiE 'userns|apparmor|sandbox|setuid|namespace|Check failed' "\$ERR"; then
    rm -f "\$ERR"
    exec "\$APPIMAGE" --no-sandbox "\$@"
  fi
  cat "\$ERR" >&2
  rm -f "\$ERR"
  exit 1
fi
rm -f "\$ERR"
EOF
  chmod +x "$install_dir/$script_name"

  mkdir -p "$link_dir"
  cp "$install_dir/$script_name" "$link_dir/$script_name"
  echo -e "Invocation script created at: $link_dir/$script_name"
}

# Returns "gnome-keyring" unless the current session is KDE.
# On KDE, kwallet implements the Secret Service interface (KF 5.97+ / ksecretd
# in 2026), and installing gnome-keyring causes a D-Bus activation race for
# org.freedesktop.secrets — see VSCode issue #189672.
gnome_keyring_pkg_if_needed() {
  if [[ "${XDG_CURRENT_DESKTOP:-}" =~ KDE ]]; then
    echo ""
  else
    echo "gnome-keyring"
  fi
}

# Picks the libfuse2 package name for whatever Ubuntu/Debian release we're on.
# Ubuntu 24.04 Noble+ / Debian 13 Trixie+ / Kali rolling / Mint 22+ / Neon 24+
# ship libfuse2t64 (the post-y2038 rename); older releases (Ubuntu 20.04 Focal
# / 22.04 Jammy, Debian 11/12, Mint 20/21, Neon 22) ship the pre-rename
# libfuse2. Both provide the same libfuse.so.2 SONAME, so picking by repo
# availability is correct.
choose_fuse_package_apt() {
  if apt-cache show libfuse2t64 >/dev/null 2>&1; then
    echo libfuse2t64
  else
    echo libfuse2
  fi
}

# Per-distro package install. Only called when verify_appimage_launches failed
# OR the keyring daemon is missing — i.e., we've already decided we need sudo.
install_packages_for_distro() {
  local distro="$1" keyring="$2"
  # RHEL 10 does not ship libXScrnSaver in any default channel — left off the
  # dnf list intentionally; Electron's XScreenSaver calls no-op on Wayland.
  # libxss + libnotify are listed for Arch because gtk3 does NOT pull them in
  # transitively but Electron dlopen's them at runtime.
  local -a pkgs=()
  case "$distro" in
    ubuntu|debian|linuxmint|kali|neon) pkgs=("$(choose_fuse_package_apt)" libsecret-1-0) ;;
    fedora|rhel|centos)                pkgs=(fuse-libs fuse3-libs libsecret) ;;
    arch|manjaro|cachyos)              pkgs=(fuse2 libsecret libxss libnotify) ;;
  esac
  [ -n "$keyring" ] && pkgs+=("$keyring")

  case "$distro" in
    ubuntu|debian|linuxmint|kali|neon)
      # No `yes |` pipeline: under `set -o pipefail`, `yes` dies of SIGPIPE
      # after apt exits and the pipeline returns 141, silently aborting the
      # installer. Use apt-get -y, and keep user /etc config files via the
      # force-conf* options so an unrelated pending upgrade can't prompt.
      echo "Detected an Ubuntu/Debian-based distribution."
      sudo apt-get update
      # shellcheck disable=SC2068
      sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
        -o Dpkg::Options::="--force-confdef" \
        -o Dpkg::Options::="--force-confold" \
        ${pkgs[@]}
      ;;
    fedora|rhel|centos)
      echo "Detected a Fedora/Red Hat-based distribution."
      # shellcheck disable=SC2068
      sudo dnf install -y ${pkgs[@]}
      ;;
    arch|manjaro|cachyos)
      echo "Detected an Arch-based distribution."
      sudo pacman -Sy
      # shellcheck disable=SC2068
      sudo pacman -S --noconfirm --needed ${pkgs[@]}
      ;;
  esac
}

# Resolves the running distro to one of the package-manager families the
# installer knows how to drive: ubuntu/debian (apt), fedora/rhel (dnf), or arch
# (pacman). Directly-named IDs map to themselves; derivative distros that aren't
# listed explicitly — TUXEDO OS (tuxedo), Pop!_OS (pop), Zorin, elementary,
# EndeavourOS, Nobara, Raspbian, … — resolve through their ID_LIKE chain, and
# as a last resort we key off whichever package manager is actually installed.
# Echoes the family on success; returns 1 only for a truly unknown system.
resolve_distro_family() {
  local id="$1" id_like="$2" token
  # 1. IDs the per-distro install logic already handles by name.
  case "$id" in
    ubuntu|debian|linuxmint|kali|neon|fedora|rhel|centos|arch|manjaro|cachyos)
      echo "$id"; return 0 ;;
  esac
  # 2. Walk ID_LIKE (space-separated, most-derived first) for a known base.
  #    e.g. TUXEDO OS ships ID_LIKE="ubuntu debian" -> ubuntu.
  # shellcheck disable=SC2086
  for token in $id_like; do
    case "$token" in
      ubuntu|debian|fedora|rhel|centos|arch) echo "$token"; return 0 ;;
    esac
  done
  # 3. Fall back to the installed package manager. Package *names* differ
  #    between families but are identical within one (the apt branch picks
  #    libfuse2 vs libfuse2t64 by repo query), so any apt host can be driven as
  #    debian, any dnf host as fedora, any pacman host as arch.
  if command -v apt-get >/dev/null 2>&1; then echo debian; return 0; fi
  if command -v dnf     >/dev/null 2>&1; then echo fedora; return 0; fi
  if command -v pacman  >/dev/null 2>&1; then echo arch;   return 0; fi
  return 1
}

# Decides what (if anything) the user's system is missing for Phoenix Code to
# run, then installs only the missing piece(s). Three independent probes:
#
#   1. System shared libraries — probed by running the downloaded AppImage
#      with `--version`. main.js exits immediately on this flag, AFTER libfuse
#      mounts the AppImage and AFTER the Electron binary loads its NEEDED libs.
#   2. gnome-keyring daemon — binary-presence check; `--version` doesn't
#      exercise keytar so it can't verify libsecret/Secret Service end-to-end.
#
# Sudo is requested ONLY if at least one of the probes fails.
ensure_runtime_dependencies() {
  local appimage="$1"
  if [ ! -f /etc/os-release ]; then
    echo -e "${RED}Unable to identify the operating system (no /etc/os-release).${RESET}"
    exit 1
  fi
  . /etc/os-release
  local distro="${ID:-}"
  local family
  if ! family=$(resolve_distro_family "$distro" "${ID_LIKE:-}"); then
    echo -e "${RED}Unsupported distribution: ${distro:-unknown}. Please install libfuse2/fuse2, libsecret, and (on non-KDE) gnome-keyring manually.${RESET}"
    exit 1
  fi
  if [ "$family" != "$distro" ]; then
    echo -e "${GREEN}Detected '$distro'; installing dependencies as '$family'-compatible.${RESET}"
  fi
  local keyring; keyring=$(gnome_keyring_pkg_if_needed)

  local libs_ok=1 keyring_ok=1
  verify_appimage_launches "$appimage" || libs_ok=0
  if [ -n "$keyring" ] && ! gnome_keyring_present; then keyring_ok=0; fi

  if [ "$libs_ok" = 1 ] && [ "$keyring_ok" = 1 ]; then
    echo -e "${GREEN}All runtime dependencies already present.${RESET}"
    return 0
  fi

  if [ "$libs_ok" = 0 ]; then
    echo "Installing missing runtime libraries..."
  else
    echo "Installing system keychain daemon..."
  fi
  echo "This step requires administrative access."
  if ! sudo -n true 2>/dev/null; then
    echo "Please enter your password to proceed."
  fi

  install_packages_for_distro "$family" "$keyring"
  # Re-probe libraries; if still failing, surface a clear warning but don't
  # abort — the AppImage may have a runtime-specific issue we can't fix here.
  if [ "$libs_ok" = 0 ] && ! verify_appimage_launches "$appimage"; then
    echo -e "${YELLOW}WARN: AppImage still fails --version after dep install.${RESET}"
  fi
}

# Returns 0 if any of the common display managers is configured to autologin
# the current user. All probed files are world-readable; no sudo, no prompts.
# Used only to enrich the post-install keyring hint with a probable cause.
autologin_detected() {
  local user="${USER:-$(id -un)}"
  local f
  for f in /etc/gdm3/custom.conf /etc/gdm3/daemon.conf /etc/gdm/custom.conf; do
    [ -r "$f" ] && grep -qE '^[[:space:]]*AutomaticLoginEnable[[:space:]]*=[[:space:]]*[Tt]rue' "$f" && return 0
  done
  for f in /etc/lightdm/lightdm.conf /etc/lightdm/lightdm.conf.d/*.conf; do
    [ -r "$f" ] && grep -qE "^[[:space:]]*autologin-user[[:space:]]*=[[:space:]]*${user}([[:space:]]|$)" "$f" && return 0
  done
  for f in /etc/sddm.conf /etc/sddm.conf.d/*.conf; do
    [ -r "$f" ] && grep -qE "^[[:space:]]*User[[:space:]]*=[[:space:]]*${user}([[:space:]]|$)" "$f" && return 0
  done
  return 1
}

# If the user's login keyring is currently locked, print a one-time hint so
# the first-launch unlock dialog isn't a surprise. Uses the side-effect-free
# Locked property on org.freedesktop.Secret.Collection — querying it does NOT
# trigger a prompt. Silently no-ops when busctl is missing, when no Secret
# Service is on the bus (e.g., kwallet-only setups where this message would be
# wrong), or when the keyring is already unlocked.
print_keyring_hint_if_locked() {
  command -v busctl >/dev/null 2>&1 || return 0
  local locked
  locked=$(busctl --user --no-pager call org.freedesktop.secrets \
    /org/freedesktop/secrets/collection/login \
    org.freedesktop.DBus.Properties Get \
    ss org.freedesktop.Secret.Collection Locked 2>/dev/null \
    | awk '/^b /{print $NF}')
  [ "$locked" = "true" ] || return 0

  echo
  echo -e "${YELLOW}Note: your system keychain is currently locked.${RESET}"
  echo -e "${YELLOW}The first time Phoenix Code stores or reads a credential, gnome-keyring${RESET}"
  echo -e "${YELLOW}will ask once for your login password to unlock it. This is a one-time${RESET}"
  echo -e "${YELLOW}per-session Linux behavior — not a Phoenix Code prompt.${RESET}"
  if autologin_detected; then
    echo -e "${YELLOW}(Autologin is enabled on this machine, which is why PAM did not${RESET}"
    echo -e "${YELLOW} auto-unlock the keyring at session start.)${RESET}"
  fi
}

set_default_application() {
  local desktop_file="$DESKTOP_ENTRY_NAME"

  # `xdg-mime default` sets the system default opener by writing [Default
  # Applications] to ~/.config/mimeapps.list (its generic backend), which works on
  # every desktop. On KDE it ALSO runs a qtpaths-based backend that is redundant
  # for us; on Qt6-only systems (TUXEDO OS, Ubuntu 24.04 KDE, Fedora KDE) the
  # `qtpaths` CLI is absent, so that backend prints a harmless "qtpaths: not found"
  # per mimetype while the default is still set correctly. Collect stderr and drop
  # only that cosmetic line, letting any genuine error through.
  local mime_err
  mime_err=$(mktemp)
  for mime_type in "${MIME_TYPES[@]}"; do
    if [ "$mime_type" = "text/html" ]; then
      continue
    fi
    xdg-mime default "$desktop_file" "$mime_type" 2>>"$mime_err"
  done
  grep -vE 'qtpaths.*not found' "$mime_err" >&2 || true
  rm -f "$mime_err"

  echo -e "${GREEN}Success! You can now right-click on files in your file manager and choose Phoenix Code to edit them.${RESET}"
}

copyFilesToDestination() {
  echo "Setting up the installation directory at $INSTALL_DIR..."
  mkdir -p "$INSTALL_DIR"
  mkdir -p "$DESKTOP_DIR"

  mv "$TMP_DIR/$APPIMAGE_NAME" "$INSTALL_DIR/$APPIMAGE_NAME" || {
    echo -e "${RED}Failed to move the AppImage to the installation directory. Please check the permissions and try again.${RESET}"
    exit 1
  }
  mv "$TMP_DIR/icon.png" "$INSTALL_DIR/"

  chmod +x "$INSTALL_DIR/$APPIMAGE_NAME" || {
    echo -e "${RED}Failed to set executable permissions on the AppImage.${RESET}"
    exit 1
  }
  echo -e "AppImage installed at: $INSTALL_DIR/$APPIMAGE_NAME"

  mkdir -p "$LINK_DIR"
  create_invocation_script "$INSTALL_DIR" "$SCRIPT_NAME" "$LINK_DIR"

  local mime_types_string
  mime_types_string=$(IFS=";"; echo "${MIME_TYPES[*]}")
  echo "Creating desktop entry..."
  cat > "$DESKTOP_ENTRY" <<EOF
[Desktop Entry]
Type=Application
Name=$DESKTOP_APP_NAME
GenericName=Code Editor
Comment=Code editor
Keywords=Programming;Development;IDE;Editor;Code;
Exec=$LINK_DIR/$SCRIPT_NAME %F
Icon=$INSTALL_DIR/icon.png
Terminal=false
MimeType=$mime_types_string;
Categories=Development;IDE;Utility;TextEditor;
StartupNotify=true
StartupWMClass=$BINARY_NAME
EOF
  echo -e "${YELLOW}Desktop entry created at: $DESKTOP_ENTRY${RESET}"

  echo "Updating desktop database..."
  if command -v update-desktop-database &> /dev/null; then
    update-desktop-database "$DESKTOP_DIR"
  fi
  if [ "${XDG_CURRENT_DESKTOP:-}" = "KDE" ]; then
    if command -v kbuildsycoca5 &> /dev/null; then
      kbuildsycoca5
    fi
  fi
  if [[ "${XDG_CURRENT_DESKTOP:-}" =~ LXQt ]]; then
    if command -v xdg-desktop-menu &> /dev/null; then
      xdg-desktop-menu forceupdate
      echo -e "${YELLOW}Please log out and log back in to see Phoenix Code in the panel.${RESET}"
    else
      echo -e "${RED}Failed to update LXQt menu. Please log out and log back in to see Phoenix Code in the panel.${RESET}"
    fi
  fi

  set_default_application
  echo -e "${GREEN}Installation completed successfully. Phoenix Code is now installed.${RESET}"
  print_keyring_hint_if_locked
}

downloadAndVerifyDeps() {
  echo "Using temporary directory $TMP_DIR for processing"
  downloadLatestReleaseInfo > /dev/null
  check_architecture

  local appimage_url
  appimage_url=$(getLinuxAppImageUrl)
  if [ -z "$appimage_url" ]; then
    echo -e "${RED}Could not find a linux-x86_64 AppImage URL in the release info.${RESET}"
    exit 1
  fi

  echo -e "${YELLOW}Downloading the AppImage from $appimage_url...${RESET}"
  local wget_opts
  wget_opts=$(configure_wget_options)
  # shellcheck disable=SC2086
  wget $wget_opts "$TMP_DIR/$APPIMAGE_NAME" "$appimage_url" || {
    echo -e "${RED}Failed to download the AppImage. Please check your internet connection and try again.${RESET}"
    exit 1
  }

  echo "Downloading the icon..."
  # shellcheck disable=SC2086
  wget $wget_opts "$TMP_DIR/icon.png" "$ICON_URL" || {
    echo -e "${RED}Failed to download the icon.${RESET}"
    exit 1
  }

  chmod +x "$TMP_DIR/$APPIMAGE_NAME"

  ensure_runtime_dependencies "$TMP_DIR/$APPIMAGE_NAME"
}

# Returns 0 if the system GLIBC is >= MIN_GLIBC_VERSION, 1 otherwise.
# Uses the same ldd + awk pattern the old GLIBC-matched installer used.
glibc_compatible() {
  local cur_ver
  cur_ver=$(ldd --version | grep "ldd" | awk '{print $NF}')
  echo "Current GLIBC version: $cur_ver"
  awk -v min="$MIN_GLIBC_VERSION" -v cur="$cur_ver" \
    'BEGIN { min += 0; cur += 0; exit !(min <= cur) }'
}

# On systems whose GLIBC is too old for the new AppImage, disable auto-update
# in the old installation's config so it stops trying to upgrade to a binary
# that cannot run here.
disable_auto_update_old_version() {
  local config_path=""
  local primary="$HOME/.local/share/io.phcode/phcode.json"
  local xdg="${XDG_DATA_HOME:-$HOME/.local/share}/io.phcode/phcode.json"

  if [ -f "$primary" ]; then
    config_path="$primary"
  elif [ "$xdg" != "$primary" ] && [ -f "$xdg" ]; then
    config_path="$xdg"
  fi

  if [ -z "$config_path" ]; then
    config_path="$primary"
    echo "Creating $config_path..."
    mkdir -p "$(dirname "$config_path")"
    echo '{"autoUpdate": false}' > "$config_path"
    echo -e "${GREEN}Auto-update disabled in $config_path${RESET}"
    return 0
  fi

  echo "Disabling auto-update in $config_path..."
  if grep -q '"autoUpdate"' "$config_path"; then
    sed -i 's/"autoUpdate"[[:space:]]*:[[:space:]]*[^,}]*/"autoUpdate": false/' "$config_path"
  elif grep -q '"' "$config_path"; then
    sed -i '0,/{/ s/{/{\n    "autoUpdate": false,/' "$config_path"
  else
    echo '{"autoUpdate": false}' > "$config_path"
  fi
  echo -e "${GREEN}Auto-update disabled in $config_path${RESET}"
}

# Temporary cleanup for files from older installer versions.
uninstallBetaAppImage() {
  rm -f "$LINK_DIR"/phoenix_icon.png
}

install() {
  if ! glibc_compatible; then
    echo -e "${RED}This system's GLIBC is older than $MIN_GLIBC_VERSION. The new AppImage cannot run here.${RESET}"
    disable_auto_update_old_version
    exit 1
  fi

  if [ -f "$LINK_DIR/$SCRIPT_NAME" ] || [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Phoenix Code appears to be already installed.${RESET}"
    if [ ! -t 0 ]; then
      echo -e "${GREEN}Reinstalling Phoenix Code...${RESET}"
      downloadAndVerifyDeps
      uninstall
      copyFilesToDestination
    else
      read -r -p "Would you like to reinstall it? (y/N): " response
      case "$response" in
        [Yy]* )
          echo -e "${GREEN}Reinstalling Phoenix Code...${RESET}"
          downloadAndVerifyDeps
          uninstall
          copyFilesToDestination
          ;;
        * )
          echo -e "${RED}Reinstall aborted by the user.${RESET}"
          exit 0
          ;;
      esac
    fi
  else
    downloadAndVerifyDeps
    copyFilesToDestination
  fi
}

upgrade() {
  echo -e "${YELLOW}Checking for upgrades to Phoenix Code...${RESET}"

  if ! glibc_compatible; then
    echo -e "${RED}This system's GLIBC is older than $MIN_GLIBC_VERSION. The new AppImage cannot run here.${RESET}"
    disable_auto_update_old_version
    exit 1
  fi

  if [ ! -f "$LINK_DIR/$SCRIPT_NAME" ] && [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${RED}Phoenix Code is not installed. Please install it first.${RESET}"
    exit 1
  fi

  local current_version
  current_version=$("$INSTALL_DIR/$APPIMAGE_NAME" --version 2>/dev/null || true)
  echo "Current installed version: ${current_version:-unknown}"

  local latest_version
  latest_version=$(downloadLatestReleaseInfo)
  echo "Latest available version: $latest_version"

  if [ -n "$latest_version" ] && [ "$(printf '%s\n' "$latest_version" "$current_version" | sort -V | tail -n1)" = "$latest_version" ] && [ "$latest_version" != "$current_version" ]; then
    echo -e "${YELLOW}A newer version of Phoenix Code is available. Proceeding with the upgrade...${RESET}"
    downloadAndVerifyDeps
    uninstall
    copyFilesToDestination
    echo -e "${GREEN}Upgrade completed successfully. Phoenix Code has been updated to the latest version.${RESET}"
  else
    echo "Your Phoenix Code installation is up-to-date."
  fi
}

uninstall() {
  echo -e "${YELLOW}Starting uninstallation of Phoenix Code...${RESET}"
  uninstallBetaAppImage

  if [ -f "$LINK_DIR/$SCRIPT_NAME" ]; then
    echo -e "${YELLOW}Removing invocation script from $LINK_DIR...${RESET}"
    rm "$LINK_DIR/$SCRIPT_NAME"
  else
    echo -e "${RED}Invocation script not found in $LINK_DIR. Skipping...${RESET}"
  fi

  if [ -f "$DESKTOP_ENTRY" ]; then
    echo -e "${YELLOW}Removing desktop entry...${RESET}"
    rm "$DESKTOP_ENTRY"
    if command -v update-desktop-database &> /dev/null; then
      update-desktop-database "$DESKTOP_DIR"
    fi
    if [ "${XDG_CURRENT_DESKTOP:-}" = "KDE" ]; then
      if command -v kbuildsycoca5 &> /dev/null; then
        kbuildsycoca5
      fi
    fi
    if [[ "${XDG_CURRENT_DESKTOP:-}" =~ LXQt ]]; then
      if command -v xdg-desktop-menu &> /dev/null; then
        xdg-desktop-menu forceupdate
      fi
    fi
  else
    echo -e "${RED}Desktop entry not found. Skipping...${RESET}"
  fi

  if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Removing installation directory and its contents...${RESET}"
    rm -rf "$INSTALL_DIR"
  else
    echo -e "${RED}Installation directory not found. Skipping...${RESET}"
  fi

  echo -e "${GREEN}Uninstallation of Phoenix Code completed.${RESET}"
}

show_help() {
  echo "Usage: $0 [OPTION]"
  echo "Install, upgrade, or uninstall Phoenix Code."
  echo
  echo "Options:"
  echo "  -h, --help      Display this help and exit"
  echo "  --uninstall     Uninstall Phoenix Code"
  echo "  --upgrade       Upgrade Phoenix Code to the latest version"
  echo
  echo "Without any options, the script will install Phoenix Code."
}

if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
  echo "This script should only be run from terminals in GUI sessions."
  exit 1
fi

case "${1-}" in
  -h|--help)
    show_help
    ;;
  --uninstall)
    uninstall
    ;;
  --upgrade)
    upgrade
    ;;
  "")
    install
    ;;
  *)
    echo "Invalid option: $1" >&2
    show_help
    exit 1
    ;;
esac
