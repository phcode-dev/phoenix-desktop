Phoenix Code Installation Guide
================================

Before installing Phoenix Code, ensure you have the correct binary for the GLIBC version present in your system.
 Determine your system's GLIBC version with the following command:

$ ldd --version

Example output: ldd (Ubuntu GLIBC 2.35-0ubuntu3.6) 2.35

Choosing the Correct Binary:
---------------------------------
If your GLIBC version is 2.35 or higher, download the binary compiled for GLIBC 2.35. For GLIBC versions lower than
 2.35, use the binary compiled for GLIBC 2.31. This ensures compatibility with your system's library version.

If your GLIBC version does not match the Phoenix Code binary you have
---------------------------------------------------------------------
download the appropriate version from our releases page:

https://github.com/phcode-dev/phoenix-desktop/releases

Available binaries:
- phoenix-code_3.3.5_amd64_linux_bin-GLIBC-2.31.tar.gz
- phoenix-code_3.3.5_amd64_linux_bin-GLIBC-2.35.tar.gz

Download the binary that matches or exceeds your system's GLIBC version for optimal compatibility.

Installation Prerequisites
==========================

Ubuntu/Debian Based Distributions
---------------------------------
1. Update your package list:
   $ sudo apt update

2. Install WebKitGTK and GTK:
   $ sudo apt install libgtk-3-0 libwebkit2gtk-4.0-37
   Note: In Ubuntu 22+ versions, WebKitGTK may be pre-installed.

3. Install GStreamer plugins for media playback:
   $ sudo apt install gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-tools gstreamer1.0-libav

Fedora/Red Hat
--------------
1. Update your package list:
   $ sudo dnf update

2. Install WebKitGTK and GTK:
   $ sudo dnf install webkit2gtk3 gtk3

3. Install GStreamer plugins for media playback:
   $ sudo dnf install gstreamer1-plugins-base gstreamer1-plugins-good gstreamer1-plugins-bad-free gstreamer1-plugins-bad-freeworld gstreamer1-plugins-ugly gstreamer1-libav

Arch Linux
----------
1. Ensure your system is up to date:
   $ sudo pacman -Syu

2. Install WebKitGTK and GTK:
   $ sudo pacman -S webkit2gtk gtk3

3. Install GStreamer plugins for media playback:
   $ sudo pacman -S gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav

After installing the prerequisites for your respective distribution, you can just launch the binary in this folder
$ ./phoenix-code

For any issues or further assistance, please refer to our support forum or contact us directly at:
https://github.com/orgs/phcode-dev/discussions

Thank you for choosing Phoenix Code.
