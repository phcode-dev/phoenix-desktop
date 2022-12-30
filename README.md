# Phoenix Desktop
This repo deals with Windows, Mac and Linux Desktop builds of [Phoenix IDE](https://github.com/phcode-dev/phoenix).

Please see https://github.com/phcode-dev/phoenix on how to Contribute or get in touch with the community. 

## Status
Experimental development- Work in progress, Track status here: https://github.com/orgs/phcode-dev/projects/1/views/1

# Development Setup
 We use [Tauri](https://tauri.app/) as our app shell. Follow the below
 instructions to set up development environment.  

## Prerequisites

1. Setup [node and npm 16+](https://nodejs.org/en/download/).
2. Setup [tauri prerequisites]( https://tauri.app/v1/guides/getting-started/prerequisites/) for your platform.
3. Setup Install gulp globally once with `npm install -g gulp-cli` (use `sudo npm install -g gulp-cli` in *nix systems)

## Get the code for development
Get [phoenix](https://github.com/phcode-dev/phoenix) and [phoenix-desktop](https://github.com/phcode-dev/phoenix-desktop) into two folders in your computer.
```bash
git clone https://github.com/phcode-dev/phoenix-desktop.git
git clone https://github.com/phcode-dev/phoenix.git
```

## Running Phoenix Desktop Development Builds

1. Setup and run `phoenix` by following the steps.
   ```bash
   cd phoenix
   npm install
   npm run build
   npm run serve
   ```
   > Detailed instructions on how to setup and run phoenix are available [here](https://github.com/phcode-dev/phoenix#running-phoenix)
2. To build desktop development build after starting phoenix server:
   ```bash
   cd phoenix-desktop
   npm install
   npm run serve
   ``` 
   Phoenix Desktop will start compiling and the editor window should appear after the build is done.
3. Now you can make changes to [phoenix](https://github.com/phcode-dev/phoenix) and [phoenix-desktop](https://github.com/phcode-dev/phoenix-desktop) independently and see changes live.
   * Changes in `phoenix-desktop` folder built with Tauri will be auto compiled and live patched on save.
   * To load changes in `phoenix` folder, just reload Phoenix by pressing `f5` in the Phoenix window just like you would do on the browser versions of Phoenix.  

## Building release binaries
wip: hyperlink to the wiki for release generation

## Creating Installers
wip: hyperlink to the wiki for installer generation

# License
Discussion: #184

GNU AGPL-3.0 License

Copyright (c) 2022 - present Core.ai

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.