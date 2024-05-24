#!/bin/bash
set -euo pipefail # Exit immediately if a command exits with a non-zero status.
# Define common variables
DESKTOP_DIR=$HOME/.local/share/applications  # Directory for desktop entries
GITHUB_REPO="phcode-dev/phoenix-desktop"
API_URL="https://api.github.com/repos/$GITHUB_REPO/releases/latest"
ICON_URL="https://updates.phcode.io/icons/phoenix_icon.png"
INSTALL_DIR="$HOME/.phoenix-code"
LINK_DIR="$HOME/.local/bin"
DESKTOP_ENTRY_NAME="PhoenixCode.desktop"
DESKTOP_APP_NAME="Phoenix Code"
DESKTOP_ENTRY="$DESKTOP_DIR/$DESKTOP_ENTRY_NAME"
SCRIPT_NAME="phcode"  # Name of the script to invoke the binary
BINARY_NAME="phoenix-code"

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
    "inode/directory"  # Added to include directory handling
)


# Define color variables for easy reference
GREEN="\e[32m"
YELLOW="\e[33m"
RED="\e[31m"
RESET="\e[0m"

# Cleanup Function
#
# Purpose:
#   The cleanup function is designed to ensure that the script cleans up any temporary
#   resources it used during its execution. Specifically, it removes the temporary directory
#   created at the beginning of the script, along with all its contents. This is crucial for
#   maintaining a clean file system and avoiding the accumulation of unused files.
#
# Behavior:
#   - The function targets a temporary directory specified by the `$TMP_DIR` variable.
#   - It uses `rm -rf` to recursively and forcefully remove this directory and all its contents.
#     This includes any temporary files, downloaded assets, or other data generated during the script's execution.
#   - The cleanup is registered with a `trap` command on the `EXIT` signal, ensuring it executes
#     automatically when the script exits, regardless of the exit point. This includes normal completion,
#     errors, or manual termination via signals like SIGINT (Ctrl+C).
#
# Considerations:
#   - The function assumes that `$TMP_DIR` is correctly set to the path of the temporary directory.
#     If `$TMP_DIR` is unset or incorrectly set, the function may not perform as intended.
#   - Using `rm -rf` carries the risk of deleting significant data if misused. It's crucial that `$TMP_DIR`
#     is always a temporary directory intended for deletion and does not overlap with any critical system or user directories.
#   - The function does not provide a confirmation prompt before deletion, so it's assumed that any data within
#     `$TMP_DIR` is expendable and safe to delete.
#
# Usage:
#   This function is not intended to be called directly by the user. It's automatically triggered by the `trap`
#   command set up at the beginning of the script. However, if manual cleanup is necessary, ensure that `$TMP_DIR`
#   is correctly set to the temporary directory path before invoking the function.
#
cleanup() {
    rm -rf "$TMP_DIR"  # Command to remove the temporary directory and its contents.
}

trap cleanup EXIT  # Register the cleanup function to be called on script exit.


TMP_DIR=$(mktemp -d)

check_ubuntu_version() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        if [[ "$ID" = "ubuntu" && "$VERSION_ID" = "24.04" ]]; then
            local latestFileUrl
            latestFileUrl=$(grep -oP 'https://[^"]*latest\.json'  "$TMP_DIR/latest_release.json")
            WGET_OPTS=$(configure_wget_options)

            wget $WGET_OPTS "$TMP_DIR/latest.json" "$latestFileUrl" || {
                echo -e "${RED}Failed to download the latestFile. Please check your internet connection and try again.${RESET}"
            }
            echo -e "${RED}Ubuntu 24.04 LTS is not currently supported by this installation script.${RESET}"
            echo -e "${YELLOW}Please use an earlier version of Ubuntu for the time being. Check back later for updates.${RESET}"
            exit 1
        fi
    fi
}
# Create Invocation Script Function
#
# Purpose:
#   Generates a Bash script that serves as a wrapper for invoking the installed binary of Phoenix Code.
#   This script is intended to simplify the execution of Phoenix Code by providing a more accessible
#   command interface. The generated script is placed in a user-accessible binary directory, making it
#   possible to run Phoenix Code from anywhere in the system without needing to specify the full path
#   to the binary.
#
# Parameters:
#   - binary_path: The absolute path to the directory where the Phoenix Code binary is located.
#   - script_name: The name to be given to the invocation script. This name is used both for the
#                  script file itself and for the symlink created in the user's binary directory.
#   - link_dir: The directory where a symlink to the invocation script will be placed, typically
#               a location in the user's PATH, such as ~/.local/bin, for easy access.
#
# Behavior:
#   1. Creates a new Bash script in the specified 'binary_path' with the 'script_name'.
#   2. Writes a shebang line, a warning comment indicating the script is auto-generated, and a
#      command to execute the Phoenix Code binary with any passed arguments ("$@").
#   3. Sets executable permissions on the newly created script.
#   4. Copies the script to the specified 'link_dir', creating a symlink in a user-accessible location.
#
# Considerations:
#   - It's crucial that 'binary_path' and 'link_dir' are valid directories and that 'script_name'
#     does not conflict with existing files in these directories to prevent unintended overwrites.
#   - The function does not check for the existence of 'binary_path' or 'link_dir'; it assumes
#     these directories are already created and accessible.
#   - The generated script includes a warning comment advising against deletion, as it is
#     essential for the proper functioning of Phoenix Code when invoked through this script.
#
# Usage:
#   This function is intended to be called during the installation or upgrade process of Phoenix Code,
#   after the binary has been placed in its final location. It should not be called arbitrarily, as it
#     assumes a specific setup and context established by the installer script.
#
create_invocation_script() {
  local binary_path="$1"
  local script_name="$2"
  local link_dir="$3"

  echo "Creating an invocation script for the binary..."
  # Start of the generated script
  echo "#!/bin/bash" > "$binary_path/$script_name.sh"
  # Add a warning comment about the script being auto-generated
  echo "# DO NOT DELETE: This script is generated by the Phoenix Code installer." >> "$binary_path/$script_name"
  echo "$binary_path/$BINARY_NAME \"\$@\"" >> "$binary_path/$script_name"
  chmod +x "$binary_path/$script_name"

  echo "Copying the invocation script to $link_dir..."
  mkdir -p "$link_dir"  # Ensure the directory exists
  cp "$binary_path/$script_name" "$link_dir/$script_name"

  echo -e "Invocation script created at: $link_dir/$script_name"
}
# Install Dependencies Function
#
# Purpose:
#   Installs the necessary dependencies for Phoenix Code to run properly on the user's system.
#   This function identifies the user's Linux distribution and installs the appropriate packages
#   using the distribution's package manager. It supports Ubuntu/Debian, Fedora/RHEL/CentOS, and
#   Arch Linux distributions.
#
# Behavior:
#   1. Checks for administrative privileges by attempting a non-interactive `sudo` command.
#      If the command fails, it prompts the user to enter their password for `sudo` access.
#   2. Determines the Linux distribution by examining the contents of `/etc/os-release`.
#   3. Based on the identified distribution, executes the appropriate package manager command
#      with the required packages. Supported package managers are `apt` for Debian-based systems,
#      `dnf` for Fedora/RHEL/CentOS, and `pacman` for Arch Linux.
#   4. Updates the package index (if applicable) and installs the packages.
#
# Considerations:
#   - The function requires internet access to fetch package information and install packages.
#   - It assumes that the user has `sudo` privileges to install packages system-wide.
#   - The list of dependencies is hardcoded within the function. If Phoenix Code's dependencies change,
#     this function must be updated accordingly.
#   - Unsupported distributions will result in an error message and termination of the script,
#     as the required dependencies cannot be installed automatically.
#   - This function does not handle potential errors from package installation commands. It's
#     recommended to monitor the output for any issues that may require manual intervention.
#
# Usage:
#   This function is intended to be called during the Phoenix Code installation process, typically
#   before attempting to run or configure the Phoenix Code binary. It ensures that all prerequisites
#   are met for a successful Phoenix Code execution.
#
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
    ubuntu|debian|linuxmint|kali)
      echo "Detected an Ubuntu/Debian based distribution."
      sudo apt update
      yes | sudo apt install libgtk-3-0 libwebkit2gtk-4.0-37 \
                       gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
                       gstreamer1.0-tools
      ;;
    fedora|rhel|centos)
      echo "Detected a Fedora/Red Hat based distribution."
      yes | sudo dnf install webkit2gtk3 gtk3 \
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
# Verify and Install Dependencies Function
#
# Purpose:
#   This function is responsible for verifying if the Phoenix Code application can be successfully
#   launched with the current set of installed dependencies. If the initial verification fails, it
#   attempts to install the necessary dependencies and then re-verifies the application launch.
#
# Behavior:
#   1. Changes the current directory to the temporary directory where Phoenix Code is located.
#   2. Sets the executable permission for the Phoenix Code binary and attempts to run it with a
#      verification-specific command (e.g., `--runVerify`). This step is intended to check if the
#      application can start without installing additional dependencies.
#   3. If the initial verification succeeds, the function exits with a success status (0), indicating
#      no further action is needed.
#   4. If the initial verification fails, the function proceeds to invoke `install_dependencies` to
#      install any missing dependencies specific to the user's Linux distribution.
#   5. After installing dependencies, it attempts to verify the application launch again. If this
#      second attempt succeeds, the function exits with a success status (0).
#   6. If the verification fails even after installing dependencies, the function prints an error
#      message advising the user to check the application requirements or contact support, and
#      exits with an error status (1).
#   7. Finally, the function ensures to change back to the original directory where the script was
#      invoked, preserving the user's shell environment.
#
# Considerations:
#   - The function assumes that the Phoenix Code binary is located in a temporary directory and
#     that this directory is correctly set in the `$TMP_DIR` variable.
#   - It relies on the Phoenix Code binary supporting a `--runVerify` command or equivalent for
#     verification purposes. If such a command is not available, this part of the function needs
#     adjustment.
#   - Dependency installation requires administrative privileges; hence, the user might be prompted
#     for a password to allow `sudo` operations.
#   - The function does not handle all possible error scenarios during dependency installation.
#     Users should monitor the output for potential issues that might need manual intervention.
#
# Usage:
#   This function is intended to be called during the installation or upgrade process of Phoenix Code,
#   before finalizing the installation, to ensure that all system requirements are met for the
#   application to run properly.
#
verify_and_install_dependencies() {
  cd "$TMP_DIR/phoenix-code"
  # Ensure the binary is executable
  chmod +x "./phoenix-code"
  # First attempt to verify the application launch
  if ./phoenix-code --runVerify; then
    echo "Application launch verification successful."
    return 0  # Exit the function successfully if verification succeeds
  else
    # Check Ubuntu version for compatibility
    check_ubuntu_version
    echo "Initial verification failed. Attempting to install dependencies..."
    install_dependencies  # Function to install required dependencies
  fi

  # Second attempt to verify the application launch after installing dependencies
  if ./phoenix-code --runVerify; then
    echo "Application launch verification successful after installing dependencies."
    cd -
    return 0  # Exit the function successfully if verification succeeds
  else
    echo "Verification failed even after installing dependencies. Please check the application requirements or contact support."
    cd -
    return 1  # Return an error code to indicate failure
  fi
}
# Set Phoenix Code as the default application for specified MIME types
set_default_application() {
  local desktop_file="$DESKTOP_ENTRY_NAME"  # Name of the Phoenix Code desktop entry file

  for mime_type in "${MIME_TYPES[@]}"; do
      # Skip setting default application for inode/directory and text/html
      if [ "$mime_type" = "inode/directory" ] || [ "$mime_type" = "text/html" ]; then
          continue  # Skip to the next iteration
      fi

      xdg-mime default "$desktop_file" "$mime_type"
  done
  echo -e "${GREEN}Success! You can now right-click on files in your file manager and choose Phoenix Code to edit them.${RESET}"
}

# Copy Files to Destination Function
#
# Purpose:
#   This function is responsible for setting up the final installation directory for Phoenix Code,
#   moving the necessary files into place, creating the invocation script, and setting up the desktop
#   entry for the application. It ensures that all components of Phoenix Code are correctly installed
#   and configured in the user's environment.
#
# Behavior:
#   1. Creates the installation directory at `$INSTALL_DIR`, where Phoenix Code and its related files
#      will reside.
#   2. Similarly, ensures the desktop entry directory `$DESKTOP_DIR` exists for application launchers.
#   3. Moves the downloaded and possibly compiled Phoenix Code binary and other necessary files from
#      the temporary directory (`$TMP_DIR`) to the installation directory.
#   4. Downloads and moves the application icon to the installation directory for use in the desktop entry.
#   5. Sets the correct executable permissions for the Phoenix Code binary to ensure it can be run by the user.
#   6. Calls `create_invocation_script` to generate a wrapper script for easier execution of Phoenix Code.
#   7. Constructs a `.desktop` file for Phoenix Code, defining how it should appear in application menus and
#      launchers, and places this file in the desktop entry directory.
#   8. Updates the system's desktop database to ensure the new application entry is recognized and available
#      in application menus and launchers. This step might involve commands like `update-desktop-database`
#      or `kbuildsycoca5`, depending on the desktop environment.
#
# Considerations:
#   - The function assumes that the necessary files for Phoenix Code are already present in `$TMP_DIR` and
#     that this directory is correctly set.
#   - It relies on specific directory paths (`$INSTALL_DIR`, `$DESKTOP_DIR`, `$LINK_DIR`) being set and
#     accessible. If these variables are unset or incorrect, the function may not perform as intended.
#   - Administrative privileges may be required for certain operations, such as updating the desktop database
#     or setting permissions, depending on the system's configuration.
#   - Care is taken to avoid overwriting existing files or directories without confirmation, but this function
#     does perform significant file system operations that could potentially conflict with existing user data
#     or system settings.
#
# Usage:
#   This function is intended to be called as part of the Phoenix Code installation process, after the
#   application's binary and other necessary files have been prepared in a temporary location. It finalizes
#   the installation by placing all components in their appropriate locations within the user's system.
#
copyFilesToDestination(){
  echo "Setting up the installation directory at $INSTALL_DIR..."
  mkdir -p "$INSTALL_DIR"
  mkdir -p "$DESKTOP_DIR"
  echo -e "${YELLOW}Installation directory set up at: $INSTALL_DIR${RESET}"

  echo "Moving the necessary files to the installation directory..."
  echo -e "Phoenix Code files moved to: $INSTALL_DIR"
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
  echo -e "Executable permissions set for: $INSTALL_DIR/$BINARY_NAME"

  mkdir -p "$LINK_DIR"  # Ensure the directory exists
  # Call the function to create and copy the invocation script
  create_invocation_script "$INSTALL_DIR" "$SCRIPT_NAME" "$LINK_DIR"
  # Convert MIME types array to semicolon-separated string for the desktop entry
  MIME_TYPES_STRING=$(IFS=";"; echo "${MIME_TYPES[*]}")
  echo "Creating desktop entry..."
  cat > "$DESKTOP_ENTRY" <<EOF
[Desktop Entry]
Type=Application
Name=$DESKTOP_APP_NAME
GenericName=Code Editor
Comment=Code editor
Keywords=Programming;Development;IDE;Editor;Code;
Exec=$INSTALL_DIR/phoenix-code %F
Icon=$INSTALL_DIR/icon.png
Terminal=false
MimeType=$MIME_TYPES_STRING;
Categories=Development;IDE;Utility;TextEditor;
StartupNotify=true
StartupWMClass=phoenix-code
EOF
  echo -e "${YELLOW}Desktop entry created at: $DESKTOP_ENTRY${RESET}"
  # Update the desktop database for GNOME, Unity, XFCE, etc.
  echo "Updating desktop database..."
  if command -v update-desktop-database &> /dev/null; then
      update-desktop-database "$DESKTOP_DIR"
      echo -e "Desktop database updated in: $DESKTOP_DIR"
  fi

  # Update the KDE desktop database if KDE is in use
  if [ "$XDG_CURRENT_DESKTOP" = "KDE" ]; then
    if command -v kbuildsycoca5 &> /dev/null; then
        kbuildsycoca5
    fi
  fi

  if [[ "$XDG_CURRENT_DESKTOP" =~ LXQt ]]; then
    if command -v xdg-desktop-menu &> /dev/null; then
        xdg-desktop-menu forceupdate
        echo -e "${YELLOW}Please log out and log back in to see Phoenix Code in the panel.${RESET}"
    else
        echo -e "${RED}Failed to update LXQt menu. Please log out and log back in to see Phoenix Code in the panel.${RESET}"
    fi
  fi
  # Set Phoenix Code as the default application for the MIME types
  set_default_application
  echo -e "${GREEN}Installation completed successfully. Phoenix Code is now installed.${RESET}"

}

downloadLatestReleaseInfo() {
  local release_info_file="$TMP_DIR/latest_release.json"

  if [ -f "$release_info_file" ]; then
    # Only extract and echo the version number, without any additional messages
    grep -Po '"tag_name":\s*"prod-app-v\K[\d.]+(?=")' "$release_info_file"
    return
  fi

  # Direct informational messages to stderr to avoid them being captured or displayed unexpectedly
  >&2 echo -e "${GREEN}Fetching the latest release information from $GITHUB_REPO...${RESET}"
  wget -qO "$release_info_file" "$API_URL" || {
    >&2 echo -e "${RED}Failed to fetch the latest release information. Please check your internet connection and try again.${RESET}"
    exit 1
  }

  # Only extract and echo the version number after successful download
  grep -Po '"tag_name":\s*"prod-app-v\K[\d.]+(?=")' "$release_info_file"
}

# Download Latest Release Information Function
#
# Purpose:
#   Retrieves the latest release information for Phoenix Code from its GitHub repository. This function
#   is designed to fetch the JSON data of the latest release using GitHub's API, allowing the script to
#   determine the most recent version of Phoenix Code and any associated assets like binaries or icons.
#
# Behavior:
#   1. Checks if the release information file (`latest_release.json`) already exists in the temporary
#      directory (`$TMP_DIR`). If it does, the function assumes the latest release information has already
#      been fetched and proceeds to extract the version number from this file without re-downloading.
#   2. If the release information file does not exist, the function uses `wget` to download the JSON data
#      from the GitHub API URL specified by `$API_URL`, which should point to the latest release endpoint
#      of the Phoenix Code GitHub repository.
#   3. The JSON data is saved to `latest_release.json` in the temporary directory.
#   4. Extracts the version number from the downloaded JSON data using `grep` with a Perl-compatible regular
#      expression (PCRE) that looks for the `tag_name` field. This field is expected to contain the version
#      number prefixed by `prod-app-v` (e.g., `prod-app-v1.2.3`), and the function extracts the version number
#      portion.
#   5. Echoes the extracted version number for use by the calling context.
#
# Considerations:
#   - This function relies on external utilities `wget` and `grep` with PCRE support, which must be available
#     in the execution environment.
#   - The GitHub API URL (`$API_URL`) must be correctly set to the latest release endpoint of the Phoenix Code
#     repository for this function to work as intended.
#   - The function assumes a specific version naming convention (`prod-app-vX.Y.Z`). If this convention changes,
#     the `grep` pattern used to extract the version number may need to be updated.
#   - Network connectivity is required to fetch the release information from GitHub. If the script is run in an
#     environment without internet access, or if GitHub is unreachable, this function will fail to retrieve the
#     latest release information.
#   - The function does not perform error handling for the `wget` command. If the download fails, the script may
#     exit or behave unexpectedly depending on the `set -e` setting.
#
# Usage:
#   This function is intended to be called during the installation or upgrade process to determine the latest
#   version of Phoenix Code. The extracted version number can be used to compare with the currently installed
#   version and decide whether an upgrade is necessary.
#
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
  done < <(grep -oP '"browser_download_url"\s*:\s*"\K[^"]*_linux_bin-GLIBC-[\d\.]+\.tar\.gz(?=")' "$TMP_DIR/latest_release.json")

  if [ -z "$BEST_MATCH_URL" ]; then
    echo -e "${RED}No compatible binary found for the current GLIBC version ($CURRENT_GLIBC_VERSION). Exiting installation.${RESET}"
    exit 1
  fi

  echo -e "${YELLOW}Downloading the compatible binary from $BEST_MATCH_URL...${RESET}"
  # Set options based on wget version
  WGET_OPTS=$(configure_wget_options)

  wget $WGET_OPTS "$TMP_DIR/phoenix-code.tar.gz" "$BEST_MATCH_URL" || {
    echo -e "${RED}Failed to download the binary. Please check your internet connection and try again.${RESET}"
    exit 1
  }

  # Download the icon
  echo -e "Downloading the icon..."
  wget $WGET_OPTS "$TMP_DIR/icon.png" "$ICON_URL" || {
    echo -e  "${RED}Failed to download the icon${RESET}"
    exit 1
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
# Function to check wget version and configure options
configure_wget_options() {
  local wget_version=$(wget --version | head -n1 | awk '{print $3}')
  local major_version=$(echo "$wget_version" | cut -d. -f1)

  if [[ "$major_version" -ge 2 ]]; then
    echo "-c --tries=10 --timeout=30 --waitretry=5 --progress=bar --retry-connrefused -O"
  else
    echo "-c -N --tries=10 --timeout=30 --waitretry=5 --retry-connrefused --show-progress -qO"
  fi
}
# Install Function
#
# Purpose:
#   Facilitates the entire installation process of Phoenix Code on the user's system. This includes
#   checking for previous installations, downloading and installing the latest version, setting up
#   necessary directories, and ensuring that all dependencies are met. It also handles user prompts
#   for repair or reinstallation options if Phoenix Code is already installed.
#
# Behavior:
#   1. Checks if Phoenix Code is already installed by looking for specific files or directories
#      associated with the installation (e.g., the invocation script in `$LINK_DIR` or the main
#      directory in `$INSTALL_DIR`). If found, prompts the user with an option to repair (reinstall).
#   2. If the user opts for repair, the function proceeds to uninstall the existing installation and
#      then reinstalls the application, ensuring the user ends up with the latest version.
#   3. For a fresh installation or repair, the function calls `downloadAndInstall` to fetch the latest
#      release and install it. This step involves downloading the binary, setting permissions, and
#      moving files to their correct locations.
#   4. After installing the binary, `copyFilesToDestination` is invoked to set up the desktop entry,
#      create an invocation script, and perform other necessary post-installation configurations.
#
# Considerations:
#   - The function assumes that the user has sufficient permissions to write to the target directories
#     and install Phoenix Code. Administrative privileges may be required for certain operations.
#   - If the repair option is chosen, all existing Phoenix Code files and configurations in the installation
#     directory will be replaced. Users should ensure that any custom configurations or data are backed up
#     before proceeding.
#   - Network connectivity is required to download the latest version of Phoenix Code from the repository.
#   - The function does not explicitly handle all potential error scenarios, such as download failures or
#     permission issues. It relies on the `set -e` option to halt execution on any unhandled errors.
#
# Usage:
#   This function is intended to be invoked when the script is run without specific options (e.g., not an
#   uninstall or upgrade). It can be directly called from the command line when the user wishes to install
#   Phoenix Code, or it may be triggered by default when the script is executed without arguments.
#
install() {
  # Check if the application is already installed
  if [ -f "$LINK_DIR/$SCRIPT_NAME" ] || [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Phoenix Code appears to be already installed.${RESET}"
    # Checking if the shell has a controlling terminal if its non interactive reinstall phoenix with latest version
    if [ ! -t 0 ]; then
      echo -e "${GREEN}Reinstalling Phoenix Code...${RESET}"
      uninstall
      downloadAndInstall
      copyFilesToDestination
    else
      # Simplified prompt for reinstall without detailed explanation
      read -r -p "Would you like to reinstall it? (y/N): " response
      case "$response" in
        [Yy]* )
            echo -e "${GREEN}Reinstalling Phoenix Code...${RESET}"
            uninstall
            downloadAndInstall
            copyFilesToDestination
            ;;
        * )
            echo -e "${RED}Reinstall aborted by the user.${RESET}"
            exit 0
            ;;
      esac
    fi
  else
    downloadAndInstall
    copyFilesToDestination
  fi
}

# Temporary code to clean up earlier beta installations
function uninstallBetaAppImage() {
  rm -f "$LINK_DIR"/phoenix_icon.png
}
# Upgrade Function
#
# Purpose:
#   Manages the upgrade process for Phoenix Code, ensuring that the user's installation is updated
#   to the latest version available. This function checks the currently installed version against
#   the latest version available in the GitHub repository. If a newer version is found, it proceeds
#   to download and install the update, effectively replacing the old version with the new one.
#
# Behavior:
#   1. Verifies that Phoenix Code is already installed by checking for the existence of the installation
#      directory and the invocation script. If not found, it exits with an error message indicating that
#      Phoenix Code must be installed before it can be upgraded.
#   2. Determines the currently installed version of Phoenix Code by invoking the binary with a version
#      check command (e.g., `phoenix-code --version`) and captures the output.
#   3. Fetches the latest release information from the GitHub repository using the `downloadLatestReleaseInfo`
#      function, which retrieves the version number of the latest release.
#   4. Compares the currently installed version with the latest version. If the installed version is older,
#      it initiates the upgrade process by calling `downloadAndInstall`, which handles the download and
#      installation of the new version.
#   5. If the currently installed version is already up to date, it informs the user that no upgrade is necessary.
#
# Considerations:
#   - The function relies on the correct implementation of version checking in the Phoenix Code binary.
#     The binary must support a command-line option to output its version, and the output format must be
#     consistent for correct parsing and comparison.
#   - Network connectivity is required to fetch the latest release information from the GitHub repository.
#     The upgrade process will fail if the script cannot connect to GitHub.
#   - The user must have sufficient permissions to overwrite the existing installation files and to
#     execute network requests (e.g., downloading the latest release).
#   - The upgrade process replaces the existing installation files. Users should ensure that any
#     necessary backups or custom configurations are saved before proceeding with the upgrade.
#
# Usage:
#   This function is intended to be called when the user explicitly wants to upgrade their installation
#   of Phoenix Code to the latest version. It can be triggered by passing an `--upgrade` option to the
#   script, as defined in the script's main case statement handling command-line arguments.
#
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
    downloadAndInstall
    uninstall
    copyFilesToDestination
    echo -e "${GREEN}Upgrade completed successfully. Phoenix Code has been updated to the latest version.${RESET}"
  else
    echo "Your Phoenix Code installation is up-to-date."
  fi

}
# Uninstall Function
#
# Purpose:
#   Handles the removal of Phoenix Code from the user's system. This function is responsible for
#   cleaning up all files, directories, and links created during the installation process, effectively
#   reverting any changes made by the installer script. It ensures that Phoenix Code and its components
#   are uninstalled cleanly, leaving no residual files or configurations.
#
# Behavior:
#   1. Checks for and removes the invocation script located in the user's binary directory (`$LINK_DIR`).
#      This step prevents the Phoenix Code command from being accessible after uninstallation.
#   2. Deletes the desktop entry file (`$DESKTOP_ENTRY`) to remove Phoenix Code from application menus
#      and launchers. This step is crucial for desktop environments to recognize that the application has been uninstalled.
#   3. Updates the desktop database, if necessary, to reflect the removal of the Phoenix Code desktop entry.
#      This may involve commands like `update-desktop-database` or `kbuildsycoca5`, depending on the desktop environment.
#   4. Removes the Phoenix Code installation directory (`$INSTALL_DIR`) and all its contents, including
#      the main binary, configuration files, and any other related files placed during installation.
#   5. Prints a confirmation message indicating that the uninstallation process has been completed successfully.
#
# Considerations:
#   - The function assumes that the paths stored in `$LINK_DIR`, `$DESKTOP_ENTRY`, and `$INSTALL_DIR` accurately
#     reflect the locations used during the installation. If these variables are incorrect, the uninstallation
#     process may not remove all components.
#   - Administrative privileges may be required for some operations, especially if Phoenix Code was installed
#     in system-wide directories.
#   - Users should be advised to back up any important data or configurations related to Phoenix Code before
#     initiating the uninstallation process, as this function will remove all associated files without recovery options.
#   - The function does not provide a rollback mechanism. Once the uninstallation is initiated, the process cannot
#     be reversed through this script.
#
# Usage:
#   This function is intended to be invoked when the user wishes to completely remove Phoenix Code from their system.
#   It can be triggered by passing an `--uninstall` option to the script, as defined in the script's main case statement
#   handling command-line arguments. Users should be prompted to confirm their intention to uninstall before this
#   function is executed to prevent accidental data loss.
#
uninstall() {
  echo -e "${YELLOW}Starting uninstallation of Phoenix Code...${RESET}"
  uninstallBetaAppImage
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

    if [[ "$XDG_CURRENT_DESKTOP" =~ LXQt ]]; then
      if command -v xdg-desktop-menu &> /dev/null; then
          xdg-desktop-menu forceupdate
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

# Check for GUI session by looking for DISPLAY or WAYLAND_DISPLAY variables
if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
  echo "This script should only be run from terminals in GUI sessions."
  exit 1
fi

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
