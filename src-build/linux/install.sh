#!/bin/bash
set -x
# Define the directory to store the AppImage
APPIMAGE_DIR=$HOME/.local/bin

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Find the first AppImage file in the script's directory with the 'phoenix-code' prefix
APPIMAGE=$(find "$SCRIPT_DIR" -maxdepth 1 -name 'phoenix-code*.AppImage' -print -quit)

# If no AppImage file is found, exit the script
if [ -z "$APPIMAGE" ]; then
    echo "No 'phoenix-code' AppImage file found in the script directory."
    exit 1
fi

# Extract filename from the full path
APPIMAGE_NAME=$(basename "$APPIMAGE")
NEW_APPIMAGE=phcode.AppImage
ICON=phoenix_icon.png # Ensure this icon file is in the script's directory

# Create the AppImage directory if it doesn't exist
mkdir -p $APPIMAGE_DIR

# Create the applications directory if it doesn't exist
DESKTOP_DIR=$HOME/.local/share/applications
mkdir -p $DESKTOP_DIR

# Copy and rename the AppImage, and copy the icon to the AppImage directory
echo "Installing Phoenix..."
cp "$APPIMAGE" $APPIMAGE_DIR/$NEW_APPIMAGE
cp "$SCRIPT_DIR/$ICON" $APPIMAGE_DIR

# Make the new AppImage executable
chmod +x $APPIMAGE_DIR/$NEW_APPIMAGE

# Define MIME types for file extensions
MIME_TYPES="text/html;application/atom+xml;application/x-coldfusion;text/x-clojure;text/coffeescript;application/json;text/css;text/html;text/x-diff;text/jsx;text/markdown;application/mathml+xml;application/rdf+xml;application/rss+xml;text/css;application/sql;image/svg+xml;text/html;text/x-python;application/xml;application/vnd.mozilla.xul+xml;application/x-yaml;text/typescript;"

# Add directory association
MIME_TYPES+="inode/directory;"

# Create a desktop entry for the AppImage with MIME type associations
echo "[Desktop Entry]
Type=Application
Name=Phoenix Code
Exec=$APPIMAGE_DIR/$NEW_APPIMAGE %F
Icon=$APPIMAGE_DIR/$ICON
Terminal=false
MimeType=$MIME_TYPES
" > $DESKTOP_DIR/PhoenixCode.desktop

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
