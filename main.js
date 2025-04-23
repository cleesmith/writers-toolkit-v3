// main.js - Writer's Toolkit main process
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

require('dotenv').config({ path: require('os').homedir() + '/.env' });
// console.log('!!! dotenv: process.env=', process.env);
// console.log('!!! dotenv: process.env=', process.env.ANTHROPIC_API_KEY);

const { app, BrowserWindow, Menu, ipcMain, dialog, screen } = require('electron');
const { v4: uuidv4 } = require('uuid');
const appState = require('./state.js');
const toolSystem = require('./tool-system');

// Determine if we're running in packaged mode
const isPackaged = app.isPackaged || !process.defaultApp;

// Configure paths for packaged application
if (isPackaged) {
  console.log('Running in packaged mode');
  
  // Get the Resources path where our app is located
  const resourcesPath = path.join(app.getAppPath(), '..');
  console.log(`Resources path: ${resourcesPath}`);
  
  // Ensure the current working directory is correct
  try {
    // Set working directory to the app's root
    process.chdir(app.getAppPath());
    console.log(`Set working directory to: ${process.cwd()}`);
  } catch (error) {
    console.error('Failed to set working directory:', error);
  }
  
  // Explicitly expose the location of tools to global scope
  global.TOOLS_DIR = app.getAppPath();
  console.log(`Set global TOOLS_DIR to: ${global.TOOLS_DIR}`);
} else {
  console.log('Running in development mode');
  global.TOOLS_DIR = path.join(__dirname);
  console.log(`Set global TOOLS_DIR to: ${global.TOOLS_DIR}`);
}

// In main.js, update the logToFile function to make it globally available
// Simple logging function that writes to a file in the user's home directory
function logToFile(message) {
  const logPath = path.join(os.homedir(), 'writers-toolkit-debug.log');
  const timestamp = new Date().toISOString();
  const logLine = `${timestamp}: ${message}\n`;
  
  try {
    fs.appendFileSync(logPath, logLine);
  } catch (e) {
    // Can't do anything if logging itself fails
  }
}

// Make logToFile available globally so other modules can use it
global.logToFile = logToFile;

// Log startup message
logToFile('=== APPLICATION STARTING ===');

// Catch all uncaught exceptions and log them
process.on('uncaughtException', (error) => {
  logToFile(`CRASH ERROR: ${error.message}`);
  logToFile(`STACK TRACE: ${error.stack}`);
  process.exit(1); // Exit with error code
});

// Log basic environment information
logToFile(`App executable: ${process.execPath}`);
logToFile(`Running in ${isPackaged ? 'packaged' : 'development'} mode`);
logToFile(`Current directory: ${process.cwd()}`);
logToFile(`__dirname: ${__dirname}`);
logToFile(`App path: ${app.getAppPath()}`);

// Log additional paths in packaged mode
if (isPackaged) {
  logToFile(`Resources path: ${path.join(app.getAppPath(), '..')}`);
}

// This is the correct version for main.js that uses toolSystem.toolRegistry
function verifyToolLoading() {
  console.log('Verifying tool classes are accessible...');
  
  try {
    // Try to require a specific tool as a test
    const TokensWordsCounter = require('./tokens-words-counter');
    if (TokensWordsCounter) {
      console.log('Successfully loaded TokensWordsCounter class');
    }
    
    // Try loading from registry - use toolSystem.toolRegistry instead of direct access
    const toolsInRegistry = toolSystem.toolRegistry.getAllToolIds();
    console.log(`Tools in registry: ${toolsInRegistry.length}`, toolsInRegistry);
    
    if (toolsInRegistry.length === 0) {
      throw new Error('No tools found in registry');
    }
    
    const firstTool = toolSystem.toolRegistry.getTool(toolsInRegistry[0]);
    console.log(`First tool details:`, {
      name: firstTool.name,
      hasConfig: !!firstTool.config,
      hasExecute: typeof firstTool.execute === 'function'
    });
    
    return true;
  } catch (error) {
    console.error('Tool loading verification failed:', error);
    throw error; // Re-throw to ensure the app fails if tools can't be loaded
  }
}

// Define Claude API schema globally
const CLAUDE_API_SCHEMA = [
  { name: 'max_retries',            label: 'Max Retries',                       type: 'number', default: 1,       required: true,  description: 'Maximum retry attempts if an API call fails.' },
  { name: 'request_timeout',        label: 'Request Timeout (seconds)',         type: 'number', default: 300,     required: true,  description: 'Seconds to wait for the API to respond.' },
  { name: 'desired_output_tokens',  label: 'Desired Output Tokens',             type: 'number', default: 12000,   required: true,  description: 'Approximate size of the visible reply.' },
  { name: 'context_window',         label: 'Context Window (tokens)',           type: 'number', default: 200000,  required: true,  description: 'Maximum tokens the model can see at once.' },
  { name: 'thinking_budget_tokens', label: 'Thinking Budget (tokens)',          type: 'number', default: 32000,   required: true,  description: 'Private "thinking" tokens before the reply.' },
  { name: 'betas_max_tokens',       label: 'Beta Max Tokens',                   type: 'number', default: 128000,  required: true,  description: 'Upper limit when enabling beta features.' },
  { name: 'model_name',             label: 'Model Name',                        type: 'text',   default: 'claude-3-7-sonnet-20250219', required: true, description: 'Exact model identifier.' },
  { name: 'betas',                  label: 'Beta Features (comma‑separated)',   type: 'text',   default: 'output-128k-2025-02-19',     required: true, description: 'List of beta flags.' },
  { name: 'max_thinking_budget',    label: 'Max Thinking Budget (tokens)',      type: 'number', default: 32000,   required: true,  description: 'Absolute cap for thinking tokens.' }
];

// Global function to get complete settings 
function getCompleteClaudeSettings() {
  // Start with an empty settings object
  const completeSettings = {};
  
  // Add all default values from the schema
  CLAUDE_API_SCHEMA.forEach(setting => {
    completeSettings[setting.name] = setting.default;
  });
  
  // Override with any existing user settings
  if (appState.settings_claude_api_configuration) {
    for (const key in appState.settings_claude_api_configuration) {
      completeSettings[key] = appState.settings_claude_api_configuration[key];
    }
  }
  
  return completeSettings;
}

// // Set fixed working directory regardless of launch method
// app.whenReady().then(() => {
//   try {
//     // Get the Resources directory path
//     const resourcesPath = path.join(path.dirname(app.getPath('exe')), '..', 'Resources');
//     console.log(`Setting working directory to: ${resourcesPath}`);
//     process.chdir(resourcesPath);
//     console.log(`New working directory: ${process.cwd()}`);
    
//     // Create global path to unpacked tools
//     global.TOOLS_DIR = path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'src', 'tools');
//     console.log(`Tools directory: ${global.TOOLS_DIR}`);
//   } catch (error) {
//     console.error('Error setting working directory:', error);
//   }
// });

// Store references to windows
let mainWindow = null;
let projectDialogWindow = null;
let apiSettingsWindow = null;
let toolSetupRunWindow = null;

// Flag to control whether to show the project dialog
let shouldShowProjectDialog = true;

// Store the currently selected tool
let currentTool = null;

// Set application name
app.name = "Writer's Toolkit";

// Define menu template
const menuTemplate = [
  {
    label: 'Writer\'s Toolkit',
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  },
  // File menu
  {
    label: 'File',
    submenu: [
      { label: 'New Project' },
      { label: 'Open Project' },
      { type: 'separator' },
      { label: "Quit Writer's Toolkit", accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
    ]
  },
  // Edit menu with standard operations
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { type: 'separator' },
      { label: 'API Settings', click: () => showApiSettingsDialog() }
    ]
  },
  // Tools menu
  {
    label: 'Tools',
    submenu: [
      { label: 'Text Editor', click: () => launchEditor() }
    ]
  }
  // Add more menus as needed
];

// Set the application menu
const menu = Menu.buildFromTemplate(menuTemplate);
Menu.setApplicationMenu(menu);

// Add global shortcut for DevTools
app.whenReady().then(() => {
  const { globalShortcut } = require('electron');
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      focusedWindow.webContents.openDevTools();
    }
  });
});

// Function to create project selection dialog
function createProjectDialog() {
  // Create the dialog window
  projectDialogWindow = new BrowserWindow({
    width: 600,
    height: 650,
    parent: mainWindow,
    modal: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#121212', // Dark background
    autoHideMenuBar: true,
  });

  // Load the HTML file
  projectDialogWindow.loadFile(path.join(__dirname, 'project-dialog.html'));

  // Show the window when ready
  projectDialogWindow.once('ready-to-show', () => {
    projectDialogWindow.show();
  });

  // Track window destruction
  projectDialogWindow.on('closed', () => {
    projectDialogWindow = null;
  });
  
  return projectDialogWindow;
}

// Show the project dialog
function showProjectDialog() {
  if (!projectDialogWindow || projectDialogWindow.isDestroyed()) {
    createProjectDialog();
    
    // Pass the current theme to the dialog
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript('document.body.classList.contains("light-mode")')
        .then(isLightMode => {
          if (projectDialogWindow && !projectDialogWindow.isDestroyed()) {
            projectDialogWindow.webContents.send('set-theme', isLightMode ? 'light' : 'dark');
          }
        })
        .catch(err => console.error('Error getting theme:', err));
    }
  } else {
    projectDialogWindow.show();
  }
}

function createWindow() {
  // Get the primary display's work area dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  console.log('*** Screen dimensions:', screen.getPrimaryDisplay().workAreaSize);  

  // Use 90% of the available width and height
  const windowWidth = Math.floor(width * 0.95);
  const windowHeight = Math.floor(height * 0.95);
  
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#111111', // Dark background
    autoHideMenuBar: false,
  });

  // Center the window
  mainWindow.center();

  // Load the index.html of the app
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

// Setup handlers for project operations
function setupProjectHandlers() {
  // Get list of projects
  ipcMain.handle('get-projects', async () => {
    try {
      // Ensure projects directory exists
      await fs.promises.mkdir(appState.PROJECTS_DIR, { recursive: true });
      
      // List all directories in the projects folder
      const items = await fs.promises.readdir(appState.PROJECTS_DIR);
      
      // Filter to only include directories and exclude hidden directories
      const projects = [];
      for (const item of items) {
        if (item.startsWith('.')) {
          continue; // Skip hidden items
        }
        
        const itemPath = path.join(appState.PROJECTS_DIR, item);
        const stats = await fs.promises.stat(itemPath);
        if (stats.isDirectory()) {
          projects.push(item);
        }
      }
      
      return projects.sort(); // Sort alphabetically
    } catch (error) {
      console.error('Error listing projects:', error);
      return [];
    }
  });
  
  // Open an existing project
  ipcMain.handle('open-project', async (event, projectName) => {
    try {
      const projectPath = path.join(appState.PROJECTS_DIR, projectName);
      
      // Check if the project directory exists
      if (!fs.existsSync(projectPath)) {
        return {
          success: false,
          message: `Project directory does not exist: ${projectPath}`
        };
      }
      
      // Update application state
      appState.CURRENT_PROJECT = projectName;
      appState.CURRENT_PROJECT_PATH = projectPath;
      appState.DEFAULT_SAVE_DIR = projectPath;
      
      // Save to electron-store
      if (appState.store) {
        appState.store.set('settings', {
          default_save_dir: projectPath,
          current_project: projectName,
          current_project_path: projectPath
        });
      }
      
      return {
        success: true,
        projectPath
      };
    } catch (error) {
      console.error('Error opening project:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });
  
  // Create a new project
  ipcMain.handle('create-project', async (event, projectName) => {
    try {
      const projectPath = path.join(appState.PROJECTS_DIR, projectName);
      
      // Check if the project already exists
      if (fs.existsSync(projectPath)) {
        return {
          success: false,
          message: `Project '${projectName}' already exists`
        };
      }
      
      // Create the project directory
      await fs.promises.mkdir(projectPath, { recursive: true });
      
      // Update application state
      appState.CURRENT_PROJECT = projectName;
      appState.CURRENT_PROJECT_PATH = projectPath;
      appState.DEFAULT_SAVE_DIR = projectPath;
      
      // Save to electron-store
      if (appState.store) {
        appState.store.set('settings', {
          default_save_dir: projectPath,
          current_project: projectName,
          current_project_path: projectPath
        });
      }

      return {
        success: true,
        projectPath
      };
    } catch (error) {
      console.error('Error creating project:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });
}

// Function to create the tool setup and run dialog
function createToolSetupRunDialog(toolName) {
  // Create the dialog window
  toolSetupRunWindow = new BrowserWindow({
    width: mainWindow.getSize()[0],
    height: mainWindow.getSize()[1],
    x: mainWindow.getPosition()[0],
    y: mainWindow.getPosition()[1],
    parent: mainWindow,
    modal: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#121212', // Dark background
    autoHideMenuBar: true,
  });

  // Load the HTML file
  toolSetupRunWindow.loadFile(path.join(__dirname, 'tool-setup-run.html'));

  // Show the window when ready
  toolSetupRunWindow.once('ready-to-show', () => {
    toolSetupRunWindow.show();
    
    // Send the current theme as soon as the window is ready
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript('document.body.classList.contains("light-mode")')
        .then(isLightMode => {
          if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
            toolSetupRunWindow.webContents.send('set-theme', isLightMode ? 'light' : 'dark');
          }
        })
        .catch(err => console.error('Error getting theme:', err));
    }
  });

  // Track window destruction
  toolSetupRunWindow.on('closed', () => {
    toolSetupRunWindow = null;
  });
  
  // Prevent the tool window from being resized or moved
  toolSetupRunWindow.setResizable(false);
  toolSetupRunWindow.setMovable(false);
  
  return toolSetupRunWindow;
}

// Show the tool setup dialog - MODIFIED: always recreate the window
function showToolSetupRunDialog(toolName) {
  // Always close any existing tool window first
  if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
    toolSetupRunWindow.destroy();
    toolSetupRunWindow = null;
  }
  
  // Store the selected tool
  currentTool = toolName;
  console.log(`Creating new tool setup dialog for: ${toolName}`);
  
  // Create a new dialog window with the current tool
  createToolSetupRunDialog(toolName);
}

// function launchEditor() {
//   return new Promise((resolve) => {
//     try {
//       // Launch the editor as a detached process
//       const editorProcess = spawn(
//         process.execPath, // Current Electron executable
//         [path.join(__dirname, 'editor-main.js')], // Path to editor-main.js 
//         {
//           detached: true,  // Run independently from parent
//           stdio: 'ignore', // Don't pipe stdio
//           env: process.env // Pass environment variables
//         }
//       );
      
//       // Allow the editor to run independently
//       editorProcess.unref();
      
//       resolve(true);
//     } catch (error) {
//       console.error('Error launching editor:', error);
//       resolve(false);
//     }
//   });
// }
// New approach: Launch editor in a new window within same app process
function launchEditor() {
  return new Promise((resolve) => {
    try {
      // Log start of editor launch process
      global.logToFile('=== EDITOR LAUNCH ATTEMPT (NEW WINDOW APPROACH) ===');
      global.logToFile(`App packaged: ${app.isPackaged}`);
      global.logToFile(`App path: ${app.getAppPath()}`);
      
      // Get important directories
      const appDir = app.getAppPath();
      const resourcesDir = path.join(path.dirname(app.getPath('exe')), '..', 'Resources');
      
      global.logToFile(`App directory: ${appDir}`);
      global.logToFile(`Resources directory: ${resourcesDir}`);
      
      // Find editor resources (HTML file and preload script)
      const possibleEditorHtmlPaths = [
        path.join(appDir, 'renderer', 'editor', 'index.html'),
        path.join(resourcesDir, 'app', 'renderer', 'editor', 'index.html')
      ];
      
      const possiblePreloadPaths = [
        path.join(appDir, 'editor-preload.js'),
        path.join(resourcesDir, 'app', 'editor-preload.js')
      ];
      
      // Find HTML path
      let editorHtmlPath = null;
      for (const p of possibleEditorHtmlPaths) {
        global.logToFile(`Checking editor HTML at: ${p}`);
        if (fs.existsSync(p)) {
          editorHtmlPath = p;
          global.logToFile(`✓ Found editor HTML at: ${p}`);
          break;
        }
      }
      
      if (!editorHtmlPath) {
        global.logToFile('❌ Could not find editor HTML file');
        throw new Error('Editor HTML file not found');
      }
      
      // Find preload script
      let preloadPath = null;
      for (const p of possiblePreloadPaths) {
        global.logToFile(`Checking preload script at: ${p}`);
        if (fs.existsSync(p)) {
          preloadPath = p;
          global.logToFile(`✓ Found preload script at: ${p}`);
          break;
        }
      }
      
      if (!preloadPath) {
        global.logToFile('❌ Could not find preload script');
        // We'll proceed without preload if necessary
      }
      
      // Define writing directory
      const WRITING_DIR = path.join(os.homedir(), 'writing');
      
      // Create a new browser window for the editor
      const editorWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: preloadPath || undefined
        },
        backgroundColor: '#121212',
        title: "Writer's Toolkit - Editor"
      });
      
      global.logToFile(`Created editor window with ID: ${editorWindow.id}`);
      
      // Set up application menu specifically for the editor window
      const menuTemplate = [
        {
          label: 'File',
          submenu: [
            {
              label: 'New',
              accelerator: 'CmdOrCtrl+N',
              click: () => {
                editorWindow.webContents.send('file-new');
              }
            },
            {
              label: 'Open',
              accelerator: 'CmdOrCtrl+O',
              click: async () => {
                await openFile(editorWindow);
              }
            },
            {
              label: 'Save',
              accelerator: 'CmdOrCtrl+S',
              click: () => {
                editorWindow.webContents.send('file-save-request');
              }
            },
            {
              label: 'Save As',
              accelerator: 'CmdOrCtrl+Shift+S',
              click: () => {
                editorWindow.webContents.send('file-save-as-request');
              }
            },
            { type: 'separator' },
            {
              label: 'Close Editor',
              accelerator: 'CmdOrCtrl+W',
              click: () => {
                editorWindow.close();
              }
            }
          ]
        },
        {
          label: 'Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'delete' },
            { type: 'separator' },
            { role: 'selectAll' }
          ]
        },
        {
          label: 'View',
          submenu: [
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            {
              label: 'Toggle Developer Tools',
              accelerator: 'CmdOrCtrl+Shift+I',
              click: () => {
                editorWindow.webContents.toggleDevTools();
              }
            },
            { type: 'separator' },
            { role: 'togglefullscreen' }
          ]
        }
      ];
      
      const editorMenu = Menu.buildFromTemplate(menuTemplate);
      
      // Set up IPC handlers specific to this window
      // Define a namespace for handlers to avoid conflicts
      const editorHandlers = {
        // File opening function
        openFile: async function(targetWindow) {
          if (!targetWindow) return;
          
          const { canceled, filePaths } = await dialog.showOpenDialog(targetWindow, {
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
            targetWindow.webContents.send('file-opened', { filePath, content });
          } catch (error) {
            dialog.showErrorBox('Error', `Failed to open file: ${error.message}`);
          }
        },
        
        // Create a unique handler ID for this window
        handleId: `editor-${Date.now()}`,
        
        // Set up all handlers
        setupHandlers: function() {
          const handlerId = this.handleId;
          global.logToFile(`Setting up IPC handlers with ID: ${handlerId}`);
          
          // Save handler
          ipcMain.handle(`save-file-${handlerId}`, async (event, data) => {
            const { filePath, content, saveAs } = data;
            let finalPath = filePath;
            
            // If no path or saveAs is true, show save dialog
            if (!finalPath || saveAs) {
              const { canceled, filePath: newPath } = await dialog.showSaveDialog(editorWindow, {
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
          });
          
          // Open file dialog handler
          ipcMain.handle(`open-file-dialog-${handlerId}`, async () => {
            await this.openFile(editorWindow);
          });
          
          // Quit handler
          ipcMain.on(`app-quit-${handlerId}`, () => {
            editorWindow.close();
          });
          
          return handlerId;
        },
        
        // Clean up handlers when window is closed
        removeHandlers: function() {
          const handlerId = this.handleId;
          global.logToFile(`Removing IPC handlers with ID: ${handlerId}`);
          
          ipcMain.removeHandler(`save-file-${handlerId}`);
          ipcMain.removeHandler(`open-file-dialog-${handlerId}`);
          
          // No need to remove 'on' handlers as they're automatically garbage collected
        }
      };
      
      // Set up the handlers
      const handlerId = editorHandlers.setupHandlers();
      
      // Create a script to inject into the page to map the handlers
      const injectionScript = `
        if (window.api) {
          console.log('Mapping API functions to window.api');
          
          // Store original functions
          const originalSaveFile = window.api.saveFile;
          const originalOpenFileDialog = window.api.openFileDialog;
          const originalQuitApp = window.api.quitApp;
          
          // Override with namespaced versions
          window.api.saveFile = function(data) {
            console.log('Intercepted saveFile call, redirecting to namespaced handler');
            return originalSaveFile ? 
              window.electron.ipcRenderer.invoke('save-file-${handlerId}', data) : 
              Promise.reject(new Error('Original saveFile not available'));
          };
          
          window.api.openFileDialog = function() {
            console.log('Intercepted openFileDialog call, redirecting to namespaced handler');
            return originalOpenFileDialog ? 
              window.electron.ipcRenderer.invoke('open-file-dialog-${handlerId}') : 
              Promise.reject(new Error('Original openFileDialog not available'));
          };
          
          window.api.quitApp = function() {
            console.log('Intercepted quitApp call, redirecting to namespaced handler');
            return originalQuitApp ? 
              window.electron.ipcRenderer.send('app-quit-${handlerId}') : 
              console.error('Original quitApp not available');
          };
          
          console.log('API functions mapped successfully');
          
          // Add diagnostics
          window._editorHandler = {
            id: '${handlerId}',
            original: {
              saveFile: !!originalSaveFile,
              openFileDialog: !!originalOpenFileDialog,
              quitApp: !!originalQuitApp
            },
            checkAPI: function() {
              return {
                saveFile: typeof window.api.saveFile === 'function',
                openFileDialog: typeof window.api.openFileDialog === 'function',
                quitApp: typeof window.api.quitApp === 'function',
                onFileNew: typeof window.api.onFileNew === 'function',
                onFileSaveRequest: typeof window.api.onFileSaveRequest === 'function',
                onFileSaveAsRequest: typeof window.api.onFileSaveAsRequest === 'function',
                onFileOpened: typeof window.api.onFileOpened === 'function'
              };
            }
          };
        } else {
          console.error('window.api not found!');
        }
      `;
      
      // Clean up when window is closed
      editorWindow.on('closed', () => {
        global.logToFile(`Editor window closed, removing handlers`);
        editorHandlers.removeHandlers();
      });
      
      // Load the editor HTML file
      editorWindow.loadFile(editorHtmlPath);
      
      // Set the editor-specific menu when the window is focused
      editorWindow.on('focus', () => {
        global.logToFile(`Editor window focused, setting custom menu`);
        Menu.setApplicationMenu(editorMenu);
      });
      
      // Restore the original menu when the window loses focus
      editorWindow.on('blur', () => {
        global.logToFile(`Editor window blurred, restoring original menu`);
        // Note: In a real implementation, you'd want to restore the original menu here
      });
      
      // Inject the handler mapping script after the page loads
      editorWindow.webContents.on('did-finish-load', () => {
        global.logToFile(`Editor window loaded, injecting API mapping script`);
        
        // Inject the script to map API functions
        editorWindow.webContents.executeJavaScript(injectionScript)
          .then(() => {
            global.logToFile(`API mapping script injected successfully`);
            
            // Run a diagnostic check
            return editorWindow.webContents.executeJavaScript(`
              if (window._editorHandler && window._editorHandler.checkAPI) {
                window._editorHandler.checkAPI();
              } else {
                null;
              }
            `);
          })
          .then(apiStatus => {
            if (apiStatus) {
              global.logToFile(`API status check: ${JSON.stringify(apiStatus)}`);
            } else {
              global.logToFile(`Could not verify API status`);
            }
          })
          .catch(error => {
            global.logToFile(`Error injecting script: ${error.message}`);
          });
      });
      
      global.logToFile('=== EDITOR LAUNCH COMPLETED ===');
      resolve(true);
    } catch (error) {
      global.logToFile(`❌ Critical error in launchEditor: ${error.message}`);
      global.logToFile(`Error stack: ${error.stack}`);
      resolve(false);
    }
  });
}
// Setup handlers for tool operations
function setupToolHandlers() {

  // ipcMain.handle('get-tools', () => {
  //   return toolSystem.toolRegistry.getAllToolIds().map(id => {
  //     const t = toolSystem.toolRegistry.getTool(id);
  //     return { name: id, title: t.config.title, description: t.config.description };
  //   });
  // });
  ipcMain.handle('get-tools', () => {
    console.log('get-tools handler called');
    
    // Get all tool IDs
    const allToolIds = toolSystem.toolRegistry.getAllToolIds();
    console.log(`Found ${allToolIds.length} tools in registry:`, allToolIds);
    
    // Map IDs to tool objects with required properties
    const tools = allToolIds.map(id => {
      const tool = toolSystem.toolRegistry.getTool(id);
      if (!tool) {
        throw new Error(`Tool with ID ${id} exists in registry but could not be retrieved`);
      }
      
      // Ensure tool has required properties
      return {
        name: id,
        title: tool.config?.title || id,
        description: tool.config?.description || `${id} tool`
      };
    });
    
    console.log(`Returning ${tools.length} tools to renderer`);
    return tools;
  });

  ipcMain.handle('get-tool-options', (e, toolName) => {
    const t = toolSystem.toolRegistry.getTool(toolName);
    return t ? (t.config.options || []) : [];
  });
  
  // Show tool setup dialog
  ipcMain.on('show-tool-setup-dialog', (event, toolName) => {
    showToolSetupRunDialog(toolName);
  });
  
  // Handle tool dialog closing
  ipcMain.on('close-tool-dialog', (event, action, data) => {
    if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
      toolSetupRunWindow.destroy();
      toolSetupRunWindow = null;
    }
  });
  
  // Get current tool
  ipcMain.handle('get-current-tool', () => {
    try {
      if (currentTool) {
        // Try to get from registry first
        const tool = toolSystem.toolRegistry.getTool(currentTool);
        if (tool) {
          return {
            name: currentTool,
            title: tool.config.title || currentTool,
            description: tool.config.description || ''
          };
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting current tool:', error);
      return null;
    }
  });
  
  // When updating the start-tool-run handler:
  ipcMain.handle('start-tool-run', async (event, toolName, optionValues) => {
    try {
      // Generate a unique run ID
      const runId = uuidv4();
      
      // Set up output function
      const sendOutput = (text) => {
        if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
          toolSetupRunWindow.webContents.send('tool-output', { 
            runId, 
            text 
          });
        }
      };
      
      // Execute the tool in the background
      (async () => {
        try {
          // Send initial output notification
          sendOutput(`Starting ${toolName}...\n\n`);
          
          // Get the tool
          const tool = toolSystem.toolRegistry.getTool(toolName);
          
          if (!tool) {
            throw new Error(`Tool not found: ${toolName}`);
          }
          
          // Add output function to the tool
          tool.emitOutput = sendOutput;
          
          // Execute the tool
          const result = await toolSystem.executeToolById(toolName, optionValues, runId);
          
          // Get files from cache
          const fileCache = require('./file-cache');
          const cachedFiles = fileCache.getFiles(toolName);
          
          // Combine cached files with any files returned by the tool
          const allFiles = [...new Set([
            ...(result.outputFiles || []),
            ...cachedFiles.map(file => file.path)
          ])];
          
          // Send completion notification
          if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
            toolSetupRunWindow.webContents.send('tool-finished', { 
              runId, 
              code: 0, 
              createdFiles: allFiles 
            });
          }
        } catch (error) {
          console.error(`Error running tool ${toolName}:`, error);
          if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
            toolSetupRunWindow.webContents.send('tool-error', { 
              runId, 
              error: error.message 
            });
          }
        }
      })();
      
      return runId;
    } catch (error) {
      console.error('Error starting tool run:', error);
      throw error;
    }
  });
  
  // Store tool options in app state
  ipcMain.handle('set-tool-options', (event, options) => {
    try {
      appState.OPTION_VALUES = options;
      return true;
    } catch (error) {
      console.error('Error setting tool options:', error);
      return false;
    }
  });
}

// Function to create the API settings dialog
function createApiSettingsDialog() {
  // Create the dialog window
  apiSettingsWindow = new BrowserWindow({
    width: 600,
    height: 800,
    parent: mainWindow,
    modal: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#121212', // Dark background
    autoHideMenuBar: true,
  });

  // Load the HTML file
  apiSettingsWindow.loadFile(path.join(__dirname, 'api-settings.html'));

  // Wait for the window to be ready before showing
  apiSettingsWindow.once('ready-to-show', () => {
    apiSettingsWindow.show();
    
    // Send the current theme as soon as the window is ready
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript('document.body.classList.contains("light-mode")')
        .then(isLightMode => {
          if (apiSettingsWindow && !apiSettingsWindow.isDestroyed()) {
            apiSettingsWindow.webContents.send('set-theme', isLightMode ? 'light' : 'dark');
          }
        })
        .catch(err => console.error('Error getting theme:', err));
    }
  });

  // Track window destruction
  apiSettingsWindow.on('closed', () => {
    apiSettingsWindow = null;
  });
  
  return apiSettingsWindow;
}

// Show the API settings dialog
function showApiSettingsDialog() {
  if (!apiSettingsWindow || apiSettingsWindow.isDestroyed()) {
    createApiSettingsDialog();
  } else {
    apiSettingsWindow.show();
    
    // Re-apply the theme when showing an existing window
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript('document.body.classList.contains("light-mode")')
        .then(isLightMode => {
          if (apiSettingsWindow && !apiSettingsWindow.isDestroyed()) {
            apiSettingsWindow.webContents.send('set-theme', isLightMode ? 'light' : 'dark');
          }
        })
        .catch(err => console.error('Error getting theme:', err));
    }
  }
}

// Prevent duplicate handler registration
let apiSettingsHandlersRegistered = false;

function setupApiSettingsHandlers() {
  // Skip if handlers are already registered
  if (apiSettingsHandlersRegistered) {
    return;
  }

  // API settings handlers
  ipcMain.handle('get-claude-api-settings', async () => {
    try {
      // Create complete settings from schema defaults and user settings
      const completeSettings = getCompleteClaudeSettings();
      
      // Update appState with the complete settings
      appState.settings_claude_api_configuration = completeSettings;
      
      // Save to store
      if (appState.store) {
        appState.store.set(
          'claude_api_configuration',
          completeSettings
        );
      }
      
      return {
        schema: CLAUDE_API_SCHEMA,
        values: completeSettings
      };
    } catch (error) {
      console.error('Error getting Claude API settings:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('save-claude-api-settings', async (_event, settings) => {
    try {
      console.log('Saving Claude API settings:', settings);

      // Start with complete settings
      const completeSettings = getCompleteClaudeSettings();
      
      // Update with new values
      for (const key in settings) {
        completeSettings[key] = settings[key];
      }

      // Update appState with complete settings
      appState.settings_claude_api_configuration = completeSettings;
      
      // Save to store
      if (appState.store) {
        appState.store.set(
          'claude_api_configuration',
          completeSettings
        );
      }

      // Re‑instantiate the Claude service with complete settings
      toolSystem.reinitializeClaudeService(completeSettings);

      // Log the complete configuration
      console.log('Complete Claude API configuration:');
      console.log(JSON.stringify(completeSettings, null, 2));

      return { success: true };
    } catch (error) {
      console.error('Error saving Claude API settings:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.on('close-api-settings-dialog', (_event, action, data) => {
    if (apiSettingsWindow && !apiSettingsWindow.isDestroyed()) {
      apiSettingsWindow.hide();

      if (action === 'saved' && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('api-settings-updated', data);
      }
    }
  });
  
  // Mark that handlers have been registered
  apiSettingsHandlersRegistered = true;
}

// Set up all IPC handlers
function setupIPCHandlers() {
  setupProjectHandlers();
  setupToolHandlers();
  setupApiSettingsHandlers();
  
  // Handle quit request from renderer
  ipcMain.on('app-quit', () => {
    console.log('Quit requested from renderer');
    app.quit();
  });
  
  // Show project dialog
  ipcMain.on('show-project-dialog', () => {
    showProjectDialog();
  });
  
  // Show API settings dialog
  ipcMain.on('show-api-settings-dialog', () => {
    showApiSettingsDialog();
  });

  // Handler for launching the text editor
  ipcMain.on('launch-editor', async (event) => {
    const result = await launchEditor();
    event.returnValue = result;
  });

  // Also add a handle version for Promise-based calls
  ipcMain.handle('launch-editor', async () => {
    return await launchEditor();
  });
  
  // Get current project info
  ipcMain.handle('get-project-info', () => {
    return {
      current_project: appState.CURRENT_PROJECT,
      current_project_path: appState.CURRENT_PROJECT_PATH
    };
  });
  
  // File selection dialog
  ipcMain.handle('select-file', async (event, options) => {
    try {
      // Ensure base directory is inside ~/writing
      const homePath = os.homedir();
      const writingPath = path.join(homePath, 'writing');
      let startPath = options.defaultPath || appState.DEFAULT_SAVE_DIR || writingPath;
      
      // Force path to be within ~/writing
      if (!startPath.startsWith(writingPath)) {
        startPath = writingPath;
      }
      
      // Set default filters to only show .txt files
      const defaultFilters = [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ];
      
      // For tokens_words_counter.js, only allow .txt files
      if (currentTool === 'tokens_words_counter') {
        // Only use text files filter for this tool
        options.filters = [{ name: 'Text Files', extensions: ['txt', 'md'] }];
      }
      
      const dialogOptions = {
        title: options.title || 'Select File',
        defaultPath: startPath,
        buttonLabel: options.buttonLabel || 'Select',
        filters: options.filters || defaultFilters,
        properties: ['openFile'],
        // Restrict to ~/writing directory
        message: 'Please select a file within your writing projects'
      };
      
      const result = await dialog.showOpenDialog(
        options.parentWindow || toolSetupRunWindow || mainWindow, 
        dialogOptions
      );
      
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      
      const selectedPath = result.filePaths[0];
      
      // Verify the selected path is within ~/writing directory
      if (!selectedPath.startsWith(writingPath)) {
        console.warn('Selected file is outside allowed directory:', selectedPath);
        
        // Show error dialog to user
        await dialog.showMessageBox(toolSetupRunWindow || mainWindow, {
          type: 'error',
          title: 'Invalid File Selection',
          message: 'File Selection Restricted',
          detail: `You must select a file within the ~/writing directory. Please try again.`,
          buttons: ['OK']
        });
        
        return null;
      }
      
      return selectedPath;
    } catch (error) {
      console.error('Error in file selection:', error);
      throw error;
    }
  });
  
  // Directory selection dialog
  ipcMain.handle('select-directory', async (event, options) => {
    try {
      // Ensure base directory is inside ~/writing
      const homePath = os.homedir();
      const writingPath = path.join(homePath, 'writing');
      let startPath = options.defaultPath || appState.DEFAULT_SAVE_DIR || writingPath;
      
      // Force path to be within ~/writing
      if (!startPath.startsWith(writingPath)) {
        startPath = writingPath;
      }
      
      const dialogOptions = {
        title: options.title || 'Select Directory',
        defaultPath: startPath,
        buttonLabel: options.buttonLabel || 'Select',
        properties: ['openDirectory'],
        message: 'Please select a directory within your writing projects'
      };
      
      const result = await dialog.showOpenDialog(
        options.parentWindow || toolSetupRunWindow || mainWindow, 
        dialogOptions
      );
      
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      
      const selectedPath = result.filePaths[0];
      
      // Verify the selected path is within ~/writing directory
      if (!selectedPath.startsWith(writingPath)) {
        console.warn('Selected directory is outside allowed directory:', selectedPath);
        
        // Show error dialog to user
        await dialog.showMessageBox(toolSetupRunWindow || mainWindow, {
          type: 'error',
          title: 'Invalid Directory Selection',
          message: 'Directory Selection Restricted',
          detail: `You must select a directory within the ~/writing directory. Please try again.`,
          buttons: ['OK']
        });
        
        return null;
      }
      
      return selectedPath;
    } catch (error) {
      console.error('Error in directory selection:', error);
      throw error;
    }
  });
  
  // Handle project dialog closing
  ipcMain.on('close-project-dialog', (event, action, data) => {
    if (projectDialogWindow && !projectDialogWindow.isDestroyed()) {
      if (action === 'cancelled') {
        // For Cancel, disable auto-showing and destroy the window
        shouldShowProjectDialog = false;
        projectDialogWindow.destroy();
        projectDialogWindow = null;
      } else {
        // For other actions, just hide the window
        projectDialogWindow.hide();
        
        // If a project was selected or created, notify the main window
        if ((action === 'project-selected' || action === 'project-created') && 
            mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('project-updated', {
            action,
            project: data
          });
        }
      }
    }
  });

  // Convert DOCX to TXT
  ipcMain.handle('convert-docx-to-txt', async (event, docxPath, outputFilename) => {
    try {
      // Ensure we have a current project
      if (!appState.CURRENT_PROJECT_PATH) {
        return {
          success: false,
          message: 'No active project selected'
        };
      }
      
      // Validate output filename
      if (!outputFilename) {
        outputFilename = 'manuscript.txt';
      }
      
      // Ensure it has a .txt extension
      if (!outputFilename.toLowerCase().endsWith('.txt')) {
        outputFilename += '.txt';
      }
      
      // Construct output path
      const outputPath = path.join(appState.CURRENT_PROJECT_PATH, outputFilename);
      
      // Use your existing DOCX to TXT conversion code
      const mammoth = require('mammoth');
      const jsdom = require('jsdom');
      const { JSDOM } = jsdom;
      
      // Load the docx file
      const result = await mammoth.convertToHtml({ path: docxPath });
      const htmlContent = result.value;
      
      // Parse the HTML
      const dom = new JSDOM(htmlContent);
      const document = dom.window.document;
      
      // Get all block elements
      const blocks = document.querySelectorAll("p, h1, h2, h3, h4, h5, h6");
      
      // Process blocks to extract chapters
      let chapters = [];
      let currentChapter = null;
      let ignoreFrontMatter = true;
      let ignoreRest = false;
      
      // Stop headings
      const STOP_TITLES = ["about the author", "website", "acknowledgments", "appendix"];
      
      // Convert NodeList to Array for iteration
      Array.from(blocks).forEach(block => {
        if (ignoreRest) return;
        
        const tagName = block.tagName.toLowerCase();
        const textRaw = block.textContent.trim();
        const textLower = textRaw.toLowerCase();
        
        // Skip everything until first <h1>
        if (ignoreFrontMatter) {
          if (tagName === "h1") {
            ignoreFrontMatter = false;
          } else {
            return;
          }
        }
        
        // If this heading is a "stop" heading, ignore the rest
        if (tagName.startsWith("h") && STOP_TITLES.some(title => textLower.startsWith(title))) {
          ignoreRest = true;
          return;
        }
        
        // If we see a new <h1>, that means a new chapter
        if (tagName === "h1") {
          currentChapter = {
            title: textRaw,
            textBlocks: []
          };
          chapters.push(currentChapter);
        }
        else {
          // If there's no current chapter yet, create one
          if (!currentChapter) {
            currentChapter = { title: "Untitled Chapter", textBlocks: [] };
            chapters.push(currentChapter);
          }
          // Add the block text if not empty
          if (textRaw) {
            currentChapter.textBlocks.push(textRaw);
          }
        }
      });
      
      // Build the manuscript text with proper spacing
      let manuscriptText = "";
      
      chapters.forEach((ch, idx) => {
        // Two newlines before each chapter title
        if (idx === 0) {
          manuscriptText += "\n\n";
        } else {
          manuscriptText += "\n\n\n";
        }
        
        // Add chapter title
        manuscriptText += ch.title;
        
        // One newline after chapter title
        manuscriptText += "\n\n";
        
        // Add paragraphs with one blank line between them
        manuscriptText += ch.textBlocks.join("\n\n");
      });
      
      // Write to output file
      await fs.promises.writeFile(outputPath, manuscriptText);
      
      return {
        success: true,
        outputPath: outputPath,
        outputFilename: outputFilename,
        chapterCount: chapters.length
      };
    } catch (error) {
      console.error('Error converting DOCX to TXT:', error);
      return {
        success: false,
        message: error.message || 'Failed to convert DOCX file'
      };
    }
  });

  // Get output files for a tool run
  ipcMain.handle('get-tool-output-files', (event, toolId) => {
    try {
      // For simplicity, if toolId is a runId, we just use the tool name part
      // This assumes runIds are in the format toolName-uuid
      const toolName = toolId.includes('-') ? toolId.split('-')[0] : toolId;
      
      // Get files from the cache
      const fileCache = require('./file-cache');
      const files = fileCache.getFiles(toolName);
      
      return files;
    } catch (error) {
      console.error('Error getting tool output files:', error);
      return [];
    }
  });

  // Handler for opening a file in the editor
  ipcMain.handle('open-file-in-editor', async (event, filePath) => {
    try {
      // Verify the file exists
      if (!fs.existsSync(filePath)) {
        return { 
          success: false, 
          error: 'File not found: ' + filePath 
        };
      }
      
      // Launch the editor with the file path as an argument
      const editorProcess = spawn(
        process.execPath, // Current Electron executable
        [path.join(__dirname, 'editor-main.js'), filePath],
        {
          detached: true,  // Run independently from parent
          stdio: 'ignore', // Don't pipe stdio
          env: process.env // Pass environment variables
        }
      );
      
      // Allow the editor to run independently
      editorProcess.unref();
      
      return { success: true, filePath };
    } catch (error) {
      console.error('Error opening file in editor:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });
}

// Initialize the app state and then create the window
async function main() {
  try {
    // Initialize AppState before using it
    await appState.initialize();

    // Set up IPC handlers first
    setupIPCHandlers();

    // Initialize tool system with COMPLETE Claude API settings
    try {
      // Get complete settings
      const completeSettings = getCompleteClaudeSettings();
      
      // Log the complete settings
      console.log('Initializing tool system with complete settings:');
      console.log(JSON.stringify(completeSettings, null, 2));
      
      // Initialize tool system with complete settings
      const toolSystemResult = await toolSystem.initializeToolSystem(completeSettings);

      // verifyToolLoading();

      // Check if API key is missing
      if (toolSystemResult.claudeService && toolSystemResult.claudeService.apiKeyMissing) {
        // Show notification after window is created
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            dialog.showMessageBox(mainWindow, {
              type: 'warning',
              title: 'API Key Missing',
              message: 'Claude API key not found',
              detail: 'Please configure your Claude API key in API Settings before using AI tools.',
              buttons: ['OK']
            });
          }
        }, 1000);
      }

    } catch (toolError) {
      console.error('>>> Warning: Tool system initialization failed:', toolError.message);
      // // Show error to user but don't crash the app
      // dialog.showErrorBox(
      //   'API Configuration Warning', 
      //   'Some Claude API settings may be missing. You can update them in Edit → API Settings.'
      // );
      // Don't swallow this error - re-throw it to prevent app from starting with broken tools
      throw toolError;
    }
    
    // Create the main window
    createWindow();
    
    // Check if a project is selected, if not, show the project dialog
    if (!appState.CURRENT_PROJECT && shouldShowProjectDialog) {
      // Give the main window time to load first
      setTimeout(() => {
        showProjectDialog();
      }, 500);
    }
  } catch (error) {
    console.error('Failed to initialize application:', error);
    app.quit();
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(main);

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
