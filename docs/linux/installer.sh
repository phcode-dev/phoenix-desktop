#!/bin/bash
set -euo pipefail # Exit immediately if a command exits with a non-zero status.
# Define common variables
DESKTOP_DIR=$HOME/.local/share/applications
GITHUB_REPO="charlypa/phoenix-desktop"
API_URL="https://api.github.com/repos/$GITHUB_REPO/releases/latest"
ICON_URL="https://updates.phcode.io/icons/phoenix_icon.png"
INSTALL_DIR="$HOME/.phoenix-code"
LINK_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"  # Directory for desktop entries
DESKTOP_ENTRY="$DESKTOP_DIR/PhoenixCode.desktop"
SCRIPT_NAME="phoenix-code"  # Name of the script to invoke the binary

# Define color variables for easy reference
GREEN="\e[32m"
YELLOW="\e[33m"
RED="\e[31m"
RESET="\e[0m"

cleanup() {
      rm -rf "$TMP_DIR"  # This will delete the temporary directory and all its contents, including latest_release.json
}
trap cleanup EXIT

TMP_DIR=$(mktemp -d)

create_invocation_script() {
  local binary_path="$1"
  local script_name="$2"
  local link_dir="$3"

  echo "Creating an invocation script for the binary..."
  echo "#!/bin/bash" > "$binary_path/$script_name.sh"
  echo "$binary_path/$script_name \"\$@\"" >> "$binary_path/$script_name.sh"
  chmod +x "$binary_path/$script_name.sh"

  echo "Copying the invocation script to $link_dir..."
  mkdir -p "$link_dir"  # Ensure the directory exists
  cp "$binary_path/$script_name.sh" "$link_dir/$script_name"
}
install_dependencies() {
  echo "Attempting to install required dependencies..."

  # Inform the user that the next steps require administrative access
  echo "The installation of dependencies requires administrative access. You may be prompted to enter your password."

  # Check if the script can execute sudo commands without interaction
  if ! sudo -n true 2>/dev/null; then
      echo "Please enter your password to proceed with the installation of dependencies."
  fi

  # Attempt to identify the Linux distribution
  if [ -f /etc/os-release ]; then
      . /etc/os-release
      DISTRO=$ID
  else
      echo "Unable to identify the operating system."
      exit 1
  fi

  # Install dependencies based on the distribution
  case "$DISTRO" in
    ubuntu|debian|linuxmint)
      echo "Detected an Ubuntu/Debian based distribution."
      sudo apt update
      sudo apt install libgtk-3-0 libwebkit2gtk-4.0-37 \
                       gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
                       gstreamer1.0-tools
      ;;
    fedora|rhel|centos)
        echo "Detected a Fedora/Red Hat based distribution."
        sudo dnf install webkit2gtk3 gtk3 \
                         gstreamer1-plugins-base gstreamer1-plugins-good
        ;;
    arch|manjaro)
        echo "Detected an Arch Linux based distribution."
        sudo pacman -Syu
        sudo pacman -S webkit2gtk gtk3
        ;;
    *)
        echo "Unsupported distribution. Please manually install the required dependencies."
        exit 1
        ;;
  esac
}
verify_and_install_dependencies() {
  cd "$TMP_DIR/phoenix-code"
  # Ensure the binary is executable
  chmod +x "./phoenix-code"
  # First attempt to verify the application launch
  if ./phoenix-code --runVerify; then
    echo "Application launch verification successful."
    return 0  # Exit the function successfully if verification succeeds
  else
    echo "Initial verification failed. Attempting to install dependencies..."
    install_dependencies  # Function to install required dependencies
  fi

  # Second attempt to verify the application launch after installing dependencies
  if ./phoenix-code --runVerify; then
    echo "Application launch verification successful after installing dependencies."
    return 0  # Exit the function successfully if verification succeeds
  else
    echo "Verification failed even after installing dependencies. Please check the application requirements or contact support."
    return 1  # Return an error code to indicate failure
  fi
  cd -
}
copyFilesToDestination(){
  echo "Setting up the installation directory at $INSTALL_DIR..."
  mkdir -p "$INSTALL_DIR"
  mkdir -p "$DESKTOP_DIR"

  echo "Moving the necessary files to the installation directory..."
  mv "$TMP_DIR"/phoenix-code/* "$INSTALL_DIR/" || {
    echo -e "${RED}Failed to move the files to the installation directory. Please check the permissions and try again.${RESET}"
    exit 1
  }
  # Move the icon to the installation directory
  mv "$TMP_DIR/icon.png" "$INSTALL_DIR/"

  echo "Setting the correct permissions for the executable..."
  chmod +x "$INSTALL_DIR/phoenix-code" || {
    echo -e "${RED}Failed to set executable permissions. Please check the file path and permissions.${RESET}"
    exit 1
  }

  mkdir -p "$LINK_DIR"  # Ensure the directory exists
  # Call the function to create and copy the invocation script
  create_invocation_script "$INSTALL_DIR" "$SCRIPT_NAME" "$LINK_DIR"
  # Define MIME types for file extensions
  MIME_TYPES="text/html;application/atom+xml;application/x-coldfusion;text/x-clojure;text/coffeescript;application/json;text/css;text/html;text/x-diff;text/jsx;text/markdown;application/mathml+xml;application/rdf+xml;application/rss+xml;text/css;application/sql;image/svg+xml;text/html;text/x-python;application/xml;application/vnd.mozilla.xul+xml;application/x-yaml;text/typescript;"
  # Add directory association
  MIME_TYPES+="inode/directory;"
  # Create a desktop entry for the application
  echo "Creating desktop entry..."
  cat > "$DESKTOP_ENTRY" <<EOF
[Desktop Entry]
Type=Application
Name=Phoenix Code
Exec=$INSTALL_DIR/phoenix-code %F
Icon=$INSTALL_DIR/icon.png
Terminal=false
MimeType=$MIME_TYPES
EOF
  # Update the desktop database for GNOME, Unity, XFCE, etc.
  echo "Updating desktop database..."
  if command -v update-desktop-database &> /dev/null; then
      update-desktop-database "$DESKTOP_DIR"
  fi

  # Update the KDE desktop database if KDE is in use
  if [ "$XDG_CURRENT_DESKTOP" = "KDE" ]; then
    if command -v kbuildsycoca5 &> /dev/null; then
        kbuildsycoca5
    fi
  fi
  echo -e "${GREEN}Installation completed successfully. Phoenix Code is now installed.${RESET}"

}
downloadLatestReleaseInfo() {
  local release_info_file="$TMP_DIR/latest_release.json"

  if [ -f "$release_info_file" ]; then
    # Only extract and echo the version number, without any additional messages
    grep -Po '"tag_name": "prod-app-v\K[\d.]+(?=")' "$release_info_file"
    return
  fi

  # Direct informational messages to stderr to avoid them being captured or displayed unexpectedly
  >&2 echo -e "${GREEN}Fetching the latest release information from $GITHUB_REPO...${RESET}"
  wget -qO "$release_info_file" "$API_URL" || {
    >&2 echo -e "${RED}Failed to fetch the latest release information. Please check your internet connection and try again.${RESET}"
    exit 1
  }

  # Only extract and echo the version number after successful download
  grep -Po '"tag_name": "prod-app-v\K[\d.]+(?=")' "$release_info_file"
}

downloadAndInstall(){
  echo "Using temporary directory $TMP_DIR for processing"
  downloadLatestReleaseInfo > /dev/null
  CURRENT_GLIBC_VERSION=$(ldd --version | grep "ldd" | awk '{print $NF}')
  echo "Current GLIBC version: $CURRENT_GLIBC_VERSION"

  BEST_MATCH_URL=""
  BEST_MATCH_VERSION=0
  echo "Searching for a compatible binary..."

  while read -r BINARY_URL; do
    BINARY_GLIBC_VERSION=$(echo "$BINARY_URL" | grep -oP 'GLIBC-\K[\d\.]+(?=\.tar\.gz)')
    if awk -v bin_ver="$BINARY_GLIBC_VERSION" -v cur_ver="$CURRENT_GLIBC_VERSION" -v best_ver="$BEST_MATCH_VERSION" 'BEGIN { bin_ver += 0; cur_ver += 0; best_ver += 0; exit !(bin_ver <= cur_ver && bin_ver > best_ver) }'; then
        BEST_MATCH_URL="$BINARY_URL"
        BEST_MATCH_VERSION="$BINARY_GLIBC_VERSION"
        echo "Found a new best match: $BEST_MATCH_URL with GLIBC version $BEST_MATCH_VERSION"
    fi
  done < <(grep -oP '"browser_download_url": "\K(.*_linux_bin-GLIBC-[\d\.]+\.tar\.gz)(?=")' "$TMP_DIR/latest_release.json")

  if [ -z "$BEST_MATCH_URL" ]; then
    echo -e "${RED}No compatible binary found for the current GLIBC version ($CURRENT_GLIBC_VERSION). Exiting installation.${RESET}"
    exit 1
  fi

  echo -e "${YELLOW}Downloading the compatible binary from $BEST_MATCH_URL...${RESET}"
  wget -c -N --tries=10 --timeout=30 --waitretry=5 --retry-connrefused --show-progress -qO "$TMP_DIR/phoenix-code.tar.gz" "$BEST_MATCH_URL"  || {
    echo -e "${RED}Failed to download the binary. Please check your internet connection and try again.${RESET}"
    exit 1
  }
  echo -e "${YELLOW}Downloading the icon...${RESET}"
  wget -c -N --tries=10 --timeout=30 --waitretry=5 --retry-connrefused --show-progress -qO "$TMP_DIR/icon.png" "$ICON_URL" || {
    echo -e  "${RED}Failed to download Icon${RESET}";
    exit 1;
  }
  echo "Extracting the binary to $TMP_DIR..."
  tar -xzf "$TMP_DIR/phoenix-code.tar.gz" -C "$TMP_DIR" || {
    echo -e "${RED}Failed to extract the binary. The downloaded file might be corrupt.${RESET}"
    exit 1
  }

  # Verify binary execution and install dependencies if necessary
  if ! verify_and_install_dependencies; then
    echo -e "${RED}Unable to successfully verify application launch. Exiting installation.${RESET}"
    exit 1
  fi
}
install() {
  # Check if the application is already installed
  if [ -f "$LINK_DIR/$SCRIPT_NAME" ] || [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Phoenix Code appears to be already installed.${RESET}"

    # Update the prompt to inform the user about the repair behavior with color
    echo -e "${YELLOW}The repair option will download and install the latest version available, replacing the current version.${RESET}"
    read -r -p "Would you like to proceed with the repair? (y/N): " response
    case "$response" in
      [Yy]* )
          echo -e "${GREEN}Proceeding with the repair by installing the latest version...${RESET}"
          uninstall
          downloadAndInstall
          copyFilesToDestination
          ;;
      * )
          echo -e "${RED}Repair aborted by the user.${RESET}"
          exit 0
          ;;
    esac
  else
    downloadAndInstall
    copyFilesToDestination
  fi
}

upgrade() {
  echo -e "${YELLOW}Checking for upgrades to Phoenix Code...${RESET}"

  # Ensure Phoenix Code is installed
  if [ ! -f "$LINK_DIR/$SCRIPT_NAME" ] && [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${RED}Phoenix Code is not installed. Please install it first.${RESET}"
    exit 1
  fi
  # Get the current installed version
  CURRENT_VERSION=$("$INSTALL_DIR/phoenix-code" --version)
  echo "Current installed version: $CURRENT_VERSION"

  LATEST_VERSION=$(downloadLatestReleaseInfo)
  # Now LATEST_VERSION should only contain the version number without extra messages
  echo "Latest available version: $LATEST_VERSION"

  # Compare versions and upgrade if the latest version is greater
  if [ "$(printf '%s\n' "$LATEST_VERSION" "$CURRENT_VERSION" | sort -V | tail -n1)" = "$LATEST_VERSION" ] && [ "$LATEST_VERSION" != "$CURRENT_VERSION" ]; then
    echo -e "${YELLOW}A newer version of Phoenix Code is available. Proceeding with the upgrade...${RESET}"
    # Proceed with upgrade logic here
  else
    echo "Your Phoenix Code installation is up-to-date."
  fi

}

uninstall() {
  echo -e "${YELLOW}Starting uninstallation of Phoenix Code...${RESET}"

  # Remove the invocation script from ~/.local/bin
  if [ -f "$LINK_DIR/$SCRIPT_NAME" ]; then
    echo -e "${YELLOW}Removing invocation script from $LINK_DIR...${RESET}"
    rm "$LINK_DIR/$SCRIPT_NAME"
  else
    echo -e "${RED}Invocation script not found in $LINK_DIR. Skipping...${RESET}"
  fi

  # Delete the desktop entry
  if [ -f "$DESKTOP_ENTRY" ]; then
    echo -e "${YELLOW}Removing desktop entry...${RESET}"
    rm "$DESKTOP_ENTRY"

    # Update the desktop database for GNOME, Unity, XFCE, etc.
    echo -e "${YELLOW}Updating desktop database...${RESET}"
    if command -v update-desktop-database &> /dev/null; then
        update-desktop-database "$DESKTOP_DIR"
    fi

    # Update the KDE desktop database if KDE is in use
    if [ "$XDG_CURRENT_DESKTOP" = "KDE" ]; then
        if command -v kbuildsycoca5 &> /dev/null; then
            kbuildsycoca5
        fi
    fi
  else
      echo -e "${RED}Desktop entry not found. Skipping...${RESET}"
  fi

  # Remove the installation directory and its contents
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
case "${1-}" in
  -h|--help)
    show_help  # Function to show help
    ;;
  --uninstall)
    uninstall  # Function to uninstall
    ;;
  --upgrade)
    upgrade  # Function to upgrade
    ;;
  "")
    # This case handles when $1 is unset (acts as a default action)
    install  # Function to install
    ;;
  *)
    # This case handles unexpected arguments
    echo "Invalid option: $1" >&2
    show_help  # Assuming you have a function to show usage information
    exit 1
    ;;
esac

