#!/bin/bash

# Define the directory where the AppImage and icon are stored
APPIMAGE_DIR=$HOME/.local/bin

# Name of the installed AppImage and icon file
NEW_APPIMAGE=phcode.AppImage
ICON=phoenix_icon.png

# Define the desktop directory
DESKTOP_DIR=$HOME/.local/share/applications

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

