#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.
# Define common variables
APPIMAGE_DIR=$HOME/.local/bin
DESKTOP_DIR=$HOME/.local/share/applications
NEW_APPIMAGE=phcode
ICON=phoenix_icon.png
GITHUB_REPO="phcode-dev/phoenix-desktop"
API_URL="https://api.github.com/repos/$GITHUB_REPO/releases/latest"
ICON_URL="https://updates.phcode.io/icons/phoenix_icon.png"
check_and_install_libfuse() {
    # Identify the Linux distribution
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO=$ID
    else
        echo "Cannot identify the operating system."
        exit 1
    fi

    echo "Checking for FUSE library..."

    if [ "$DISTRO" = "ubuntu" ]; then
        # Check and install libfuse2 on Ubuntu
        if ! dpkg -s libfuse2 &> /dev/null; then
            echo "libfuse2 not found, installing..."
            sudo apt-get update && sudo apt-get install -y libfuse2 || { echo "Failed to install libfuse2"; exit 1; }
        else
            echo "libfuse2 is already installed."
        fi
    elif [ "$DISTRO" = "fedora" ]; then
        # Check and install fuse-libs on Fedora
        if [ "$DISTRO" = "fedora" ]; then
            # Check and install fuse-libs on Fedora
            if ! rpm -q fuse-libs &> /dev/null; then
                echo "fuse-libs not found, installing..."
                sudo dnf install -y fuse-libs || { echo "Failed to install fuse-libs"; exit 1; }
            else
                echo "fuse-libs is already installed."
            fi
        fi

    else
        echo "Unsupported distribution: $DISTRO"
        exit 1
    fi
}

install() {
    check_and_install_libfuse
    # Fetch the latest release data from GitHub
    echo "Fetching latest release from $GITHUB_REPO..."
    wget -qO- $API_URL > latest_release.json || { echo "Failed to fetch latest release info"; exit 1; }

    # Extract the download URL for the AppImage
    APPIMAGE_URL=$(grep -oP '"browser_download_url": "\K(.*phoenix-desktop.*\.AppImage)(?=")' latest_release.json) || { echo "Failed to extract AppImage URL"; exit 1; }

    # If no AppImage URL is found, exit the script
    if [ -z "$APPIMAGE_URL" ]; then
        echo "No AppImage URL found in the latest release."
        rm latest_release.json
        exit 1
    fi

    # Download the AppImage
    echo "Downloading AppImage from $APPIMAGE_URL..."
    wget -c -N --tries=10 --timeout=30 --waitretry=5 --retry-connrefused  --show-progress -qO $NEW_APPIMAGE $APPIMAGE_URL || { echo "Failed to download AppImage"; exit 1; }
    wget  -c -N --tries=10 --timeout=30 --waitretry=5 --retry-connrefused --show-progress -qO $ICON $ICON_URL  || { echo "Failed to download Icon"; exit 1; }
    # Remove the temporary JSON file
    rm latest_release.json


    # Proceed with installation steps as before...
    # Create necessary directories
    mkdir -p $APPIMAGE_DIR
    mkdir -p $DESKTOP_DIR

    # Copy and rename the AppImage, and copy the icon to the AppImage directory
    echo "Installing Phoenix..."
    mv $NEW_APPIMAGE $APPIMAGE_DIR/$NEW_APPIMAGE
    mv "$ICON" $APPIMAGE_DIR  # Ensure this icon file is in the current directory

    # Make the new AppImage executable
    chmod +x $APPIMAGE_DIR/$NEW_APPIMAGE


    # Define MIME types for file extensions
    MIME_TYPES="text/html;application/atom+xml;application/x-coldfusion;text/x-clojure;text/coffeescript;application/json;text/css;text/html;text/x-diff;text/jsx;text/markdown;application/mathml+xml;application/rdf+xml;application/rss+xml;text/css;application/sql;image/svg+xml;text/html;text/x-python;application/xml;application/vnd.mozilla.xul+xml;application/x-yaml;text/typescript;"

    # Add directory association
    MIME_TYPES+="inode/directory;"

    # Create a desktop entry for the AppImage with MIME type associations
cat > $DESKTOP_DIR/PhoenixCode.desktop <<EOF
[Desktop Entry]
Type=Application
Name=Phoenix Code
Exec=$APPIMAGE_DIR/$NEW_APPIMAGE %F
Icon=$APPIMAGE_DIR/$ICON
Terminal=false
MimeType=$MIME_TYPES
EOF

    # Update the desktop database for GNOME, Unity, XFCE, etc.
    if command -v update-desktop-database &> /dev/null
    then
        update-desktop-database $DESKTOP_DIR
    fi

    # Update the KDE desktop database if KDE is in use
    if [ "$XDG_CURRENT_DESKTOP" = "KDE" ]; then
        if command -v kbuildsycoca5 &> /dev/null
        then
            kbuildsycoca5
        fi
    fi

    echo "Phoenix Code installed successfully."
}

uninstall() {
    # Remove the AppImage and the icon
    echo "Uninstalling Phoenix..."
    rm -f $APPIMAGE_DIR/$NEW_APPIMAGE
    rm -f $APPIMAGE_DIR/$ICON

    # Remove the desktop entry
    rm -f $DESKTOP_DIR/PhoenixCode.desktop

    # Update the desktop database for GNOME, Unity, XFCE, etc. (if available)
    if command -v update-desktop-database &> /dev/null
    then
        update-desktop-database $DESKTOP_DIR
    fi

    # Update the KDE desktop database if KDE is in use
    if [ "$XDG_CURRENT_DESKTOP" = "KDE" ]; then
        if command -v kbuildsycoca5 &> /dev/null
        then
            kbuildsycoca5
        fi
    fi

    echo "Phoenix uninstalled successfully."
}

# Check for command-line arguments
if [[ "$1" == "--uninstall" ]]; then
    uninstall
else
    install
fi
