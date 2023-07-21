# Phoenix Desktop
This repo deals with Windows, Mac and Linux Desktop builds of [Phoenix IDE](https://github.com/phcode-dev/phoenix).

Please see https://github.com/phcode-dev/phoenix on how to Contribute or get in touch with the community.

## Status
Experimental development- Work in progress, Track status here: https://github.com/orgs/phcode-dev/projects/1/views/1

# Development Setup
We use [Tauri](https://tauri.app/) as our app shell. We maintain the [phcode-tauri-shell](https://github.com/phcode-dev/phoenix-desktop) and
[phcode static website](https://github.com/phcode-dev/phoenix) code in two separate repositories. This 
separation is intended to simplify development by distinctly isolating the shell and phcode. For instance,
if you are solely developing the shell internals, you can always construct an empty tauri app without having to build phoenix.

Follow the below
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
> **_IMPORTANT:_**  `phoenix` and `phoenix-desktop` should be within the same parent directory!!!

## Running Phoenix Desktop Development Builds
For development, tauri will directly load the phcode static
server url "localhost:8000/src" from the phoenix repo. So you
can quickly iterate changes without rebuilding tauri src for each change. Just a simple reload will suffice.

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

## Building release binaries locally for development/testing

> Note: For the majority of development tasks, it's not necessary to build the release artifacts locally,
> as outlined in this section. Most development requirements can be met by simply following the instructions
> provided in the [Running Phoenix Desktop Development Builds](#running-phoenix-desktop-development-builds) section.
> This process is mainly required when you want to test something specific that might behave differently under the `tauri://` protocol.

Tauri development builds load phcode from `https://` url. But the release build uses packaged assets with custom tauri url
`tauri://`. So there may be some cases where the behavior is different between the release builds and development builds.

> **_IMPORTANT:_**  `phoenix` and `phoenix-desktop` projects should be within the same parent directory for the below commands to work!!!

### generate release builds from the `phoenix/src` folder
If you want to generate the release builds locally directly while you are editing the `phoenix/src` folder, run the following command.
```bash
cd phoenix-desktop
# To generate debug builds:
npm run releaseLocalDebug
# OR to generate release builds, just run `npm run releaseLocal`
```
This is the easiest way to quickly debug issues directly from the phoenix source folder.

### generate dev, staging and prod release builds from `phoenix/dist` folder
These builds are faithful to the actual binaries that are generated from the github CI pipelines shipped to users.
If you want to generate the dev, staging and prod builds locally of phcode, run the following command:
```bash
# You should first build the appropriate release build in `phoenix`.
cd phoenix
npm install
npm run build
npm run release:prod
# Other release options are `npm run release:dev` and `npm run release:staging` 

# Now generate the tauri debug builds:
cd ../phoenix-desktop
npm run releaseLocalDistDebug
# OR to generate release builds, just run `npm run releaseLocalDist`
```

## Building release binaries and installers in GitHub actions
The npm commands that begin with `_ci-*` are exclusively designed to execute in a GitHub Actions environment.
These commands are not typically executed on your local machine unless you're actively working on the GitHub
Actions workflows. However, if you need to run these locally for testing, look for `#uncomment_line_for_local_build_1`
in the codebase and uncomment the corresponding line.

> NB: Make sure not to check in any artists created by the build process!!!

### Primary GitHub Actions Targets
There are three primary targets for our GitHub actions:
1. `npm run _ci-release:prod`
2. `npm run _ci-release:dev`
3. `npm run _ci-release:staging`

To run the ci-release script, you can use the following steps:
```bash
# Example on how to run the ci-release script locally.
cd phoenix-desktop
npm install
npm run _ci-release:prod
npm run tauri build --debug
# or if you want the release builds, use `npm run tauri build`
```

### Execution Workflow
The script will begin by cloning the repository identified in the `phoenixRepo` section of the `package.json` file.
Next, it will build the corresponding stage as specified in the `npm run _ci-release:<stage>` command and will
generate the necessary distribution folders in `phoenix/dist`. Following this, it will patch the Tauri configuration files
to use the generated distribution folder for creating the release builds.

The actual release artifacts will then be built by the tauri action `tauri-apps/tauri-action@v0` specified in the
`tauri-build.yml` file. Finally, it will generate a draft release.

Remember, the `npm run _ci-*` commands are designed to execute in the GitHub Actions environment.
They're not typically used for local machine executions unless you're working on or testing the GitHub Actions workflows themselves.

# License

GNU AGPL-3.0 License

Copyright (c) 2022 - present Core.ai

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.