# Domain Search GUI

A beautiful, premium cross-platform desktop interface for the `ds` (Domain Search) tool, built using **Electron**, **React**, **TypeScript**, and **Vite**.

---

## 🚀 For End-Users (How to use it)

If you are a general user and just want to run the application:
1. Download **`Domain Search Setup 1.0.0.exe`** from the project's Releases page.
2. Double-click the installer and follow the prompt to install the application.
3. Open **Domain Search** from your desktop or start menu. It will work out-of-the-box without any manual configuration or setup.

---

## 🛠️ For Developers (Local Setup & Dev)

Follow these steps to run the GUI application locally or package it yourself.

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed.

### 1. Compile the Rust CLI
The GUI relies on the Rust `ds` CLI executable. You must compile it first:
```bash
# From the root directory of the project, compile the release build
cargo build --release
```
After building, make sure the `ds.exe` (or `ds` on Mac/Linux) is placed at the root of the project workspace. 
On Windows, copy the compiled binary:
```bash
copy target\release\ds.exe .\ds.exe
```

### 2. Install GUI Dependencies
Navigate to the `gui` folder and install NPM packages:
```bash
cd gui
npm install
```

### 3. Run in Development Mode
Start the development server with hot-reload:
```bash
npm run dev
```
This runs the Vite development server and launches the Electron application. The GUI will automatically detect `..\ds.exe` and let you test searches.

### 4. Build and Package
To compile and package the app into a standalone Windows installer (`.exe`) and portable zip archive:
```bash
npm run package
```
- The build outputs will be generated in the **`gui/dist-app/`** directory.
- `electron-builder` will automatically bundle the root `ds.exe` binary inside the installer so it works out-of-the-box for end-users.
