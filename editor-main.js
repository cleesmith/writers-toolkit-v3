const { app, BrowserWindow, dialog, ipcMain, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Define the restricted directory
const WRITING_DIR = path.join(os.homedir(), 'writing');

// Ensure the writing directory exists
if (!fs.existsSync(WRITING_DIR)) {
  fs.mkdirSync(WRITING_DIR, { recursive: true });
}

let mainWindow;

function createWindow() {
  // Get the primary display's work area dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  console.log('*** Screen dimensions:', screen.getPrimaryDisplay().workAreaSize);  

  // Use 90% of the available width and height
  const windowWidth = Math.floor(width * 0.95);
  const windowHeight = Math.floor(height * 0.95);

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'editor-preload.js')
    },
    title: 'Writer\'s Toolkit - Editor',
    backgroundColor: '#121212', // Dark background for better appearance during load
    autoHideMenuBar: true // Hide the menu bar but keep shortcuts accessible
  });

  // Explicitly hide the menu bar
  mainWindow.setMenuBarVisibility(false);
  
  // Set null menu to completely remove it
  Menu.setApplicationMenu(null);

  // Center the window
  mainWindow.center();

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'editor', 'index.html'));
  
  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// File opening function
async function openFile() {
  if (!mainWindow) return;

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open File',
    defaultPath: WRITING_DIR,
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (canceled || filePaths.length === 0) return;

  const filePath = filePaths[0];
  
  // Verify file is within the allowed directory
  if (!filePath.startsWith(WRITING_DIR)) {
    dialog.showErrorBox(
      'Access Denied',
      `Files can only be opened from the ${WRITING_DIR} directory.`
    );
    return;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    mainWindow.webContents.send('file-opened', { filePath, content });
  } catch (error) {
    dialog.showErrorBox('Error', `Failed to open file: ${error.message}`);
  }
}

// File saving function
async function saveFile(event, { filePath, content, saveAs = false }) {
  let finalPath = filePath;

  // If no path or saveAs is true, show save dialog
  if (!finalPath || saveAs) {
    const { canceled, filePath: newPath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save File',
      defaultPath: WRITING_DIR,
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (canceled || !newPath) return { success: false };
    finalPath = newPath;
  }

  // Verify file is within the allowed directory
  if (!finalPath.startsWith(WRITING_DIR)) {
    dialog.showErrorBox(
      'Access Denied',
      `Files can only be saved to the ${WRITING_DIR} directory.`
    );
    return { success: false };
  }

  try {
    fs.writeFileSync(finalPath, content, 'utf8');
    return { success: true, filePath: finalPath };
  } catch (error) {
    dialog.showErrorBox('Error', `Failed to save file: ${error.message}`);
    return { success: false };
  }
}

// Handle IPC events
function setupIPC() {
  ipcMain.handle('save-file', saveFile);
  
  ipcMain.handle('open-file-dialog', async () => {
    return await openFile();
  });

  // Fix for the Quit button - make sure it's properly registered
  ipcMain.on('app-quit', () => {
    console.log('Quit requested from renderer process');
    app.quit();
  });
}

// App lifecycle events
app.whenReady().then(() => {
  createWindow();
  setupIPC();
  
  // Log all command line arguments for debugging
  console.log('Command line arguments:', process.argv);
  
  // Improved file argument detection for .txt files only
  let fileArg = null;
  for (const arg of process.argv) {
    // Clean up the argument to handle potential quotes or spaces
    const cleanArg = arg.replace(/^["']|["']$/g, '');
    
    console.log('Checking argument:', cleanArg);
    
    // Check if it's a .txt file that exists
    if (cleanArg.endsWith('.txt') && fs.existsSync(cleanArg)) {
      fileArg = cleanArg;
      console.log('Found valid .txt file:', fileArg);
      break;
    }
  }
  
  if (fileArg) {
    const filePath = path.resolve(fileArg);
    console.log('Resolved file path:', filePath);
    
    // Only open if in allowed directory
    if (filePath.startsWith(WRITING_DIR)) {
      try {
        console.log('Reading file contents from:', filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Wait for window to be ready
        if (mainWindow.webContents.isLoading()) {
          console.log('Window still loading, waiting to send file content...');
          mainWindow.webContents.once('did-finish-load', () => {
            console.log('Window loaded, sending file content now');
            mainWindow.webContents.send('file-opened', { filePath, content });
          });
        } else {
          console.log('Window ready, sending file content immediately');
          mainWindow.webContents.send('file-opened', { filePath, content });
        }
      } catch (error) {
        console.error('Error reading file:', error);
      }
    } else {
      console.warn('File is outside the allowed directory:', filePath);
    }
  } else {
    console.log('No valid .txt file argument found');
  }
  
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});