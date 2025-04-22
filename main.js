// main.js - Writer's Toolkit main process
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow, Menu, ipcMain, dialog, screen } = require('electron');
const { v4: uuidv4 } = require('uuid');
const appState = require('./state.js');
// const database = require('./database.js');
const toolSystem = require('./tool-system');

// Set fixed working directory regardless of launch method
app.whenReady().then(() => {
  try {
    // Get the Resources directory path
    const resourcesPath = path.join(path.dirname(app.getPath('exe')), '..', 'Resources');
    console.log(`Setting working directory to: ${resourcesPath}`);
    process.chdir(resourcesPath);
    console.log(`New working directory: ${process.cwd()}`);
    
    // Create global path to unpacked tools
    global.TOOLS_DIR = path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'src', 'tools');
    console.log(`Tools directory: ${global.TOOLS_DIR}`);
  } catch (error) {
    console.error('Error setting working directory:', error);
  }
});

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

      // Also update the database
      // await database.updateGlobalSettings({
      //   current_project: projectName,
      //   current_project_path: projectPath,
      //   default_save_dir: projectPath,
      //   // Add this to only store the current project in paths
      //   projects: {
      //     current: projectName,
      //     paths: {
      //       [projectName]: projectPath  // This syntax creates an object with just the current project
      //     }
      //   }
      // });
      
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

      // Also update the database
      // await database.updateGlobalSettings({
      //   current_project: projectName,
      //   current_project_path: projectPath,
      //   default_save_dir: projectPath
      // });
      // await database.updateGlobalSettings({
      //   current_project: projectName,
      //   current_project_path: projectPath,
      //   default_save_dir: projectPath,
      //   // Add this to only store the current project in paths
      //   projects: {
      //     current: projectName,
      //     paths: {
      //       [projectName]: projectPath  // This overwrites the entire paths object
      //     }
      //   }
      // });      

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

function launchEditor() {
  return new Promise((resolve) => {
    try {
      // Launch the editor as a detached process
      const editorProcess = spawn(
        process.execPath, // Current Electron executable
        [path.join(__dirname, 'editor-main.js')], // Path to editor-main.js 
        {
          detached: true,  // Run independently from parent
          stdio: 'ignore', // Don't pipe stdio
          env: process.env // Pass environment variables
        }
      );
      
      // Allow the editor to run independently
      editorProcess.unref();
      
      resolve(true);
    } catch (error) {
      console.error('Error launching editor:', error);
      resolve(false);
    }
  });
}

// Setup handlers for tool operations
function setupToolHandlers() {
  // Get list of tools
  // ipcMain.handle('get-tools', async () => {
  //   try {
  //     // Get registered tools from tool system
  //     const registeredTools = toolSystem.toolRegistry.getAllToolIds().map(id => {
  //       const tool = toolSystem.toolRegistry.getTool(id);
  //       return {
  //         name: id,
  //         title: tool.config.title || id,
  //         description: tool.config.description || ''
  //       };
  //     });
      
  //     // console.log('Registered tools:', registeredTools);
      
  //     // If no tools are registered yet, fallback to database
  //     // if (registeredTools.length === 0) {
  //     //   return database.getTools();
  //     // }
      
  //     return registeredTools;
  //   } catch (error) {
  //     console.error('Error getting tools:', error);
  //     // return database.getTools(); // Fallback to database
  //   }
  // });
  ipcMain.handle('get-tools', () => {
    return toolSystem.toolRegistry.getAllToolIds().map(id => {
      const t = toolSystem.toolRegistry.getTool(id);
      return { name: id, title: t.config.title, description: t.config.description };
    });
  });

  // Get tool options
  // ipcMain.handle('get-tool-options', async (event, toolName) => {
  //   try {
  //     // Try to get options from registered tool
  //     const tool = toolSystem.toolRegistry.getTool(toolName);
  //     if (tool && tool.config.options) {
  //       return tool.config.options;
  //     }
      
  //     // Fallback to database
  //     // const toolConfig = database.getToolByName(toolName);
  //     return toolConfig ? toolConfig.options || [] : [];
  //   } catch (error) {
  //     console.error('Error getting tool options:', error);
  //     return [];
  //   }
  // });
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
        
        // Fallback to database
        // const toolConfig = database.getToolByName(currentTool);
        // if (toolConfig) {
        //   return {
        //     name: currentTool,
        //     title: toolConfig.title || currentTool,
        //     description: toolConfig.description || ''
        //   };
        // }
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

// Set up API settings handlers
// function setupApiSettingsHandlers() {
//   // Get Claude API settings
//   ipcMain.handle('get-claude-api-settings', async () => {
//     try {
//       // Return the schema and current values
//       return {
//         schema: database.getClaudeApiSettingsSchema(),
//         values: database.getClaudeApiSettings()
//       };
//     } catch (error) {
//       console.error('Error getting Claude API settings:', error);
//       return {
//         success: false,
//         message: error.message
//       };
//     }
//   });
//   ipcMain.handle('save-claude-api-settings', async (event, settings) => {
//     try {
//       console.log('Saving Claude API settings:', settings);
      
//       // Update app state with new settings
//       appState.settings_claude_api_configuration = {
//         ...appState.settings_claude_api_configuration,
//         ...settings
//       };
      
//       // Save to database
//       // await database.updateGlobalSettings({
//       //   claude_api_configuration: appState.settings_claude_api_configuration
//       // });
      
//       // Reinitialize the Claude service with new settings
//       const claudeService = toolSystem.reinitializeClaudeService(appState.settings_claude_api_configuration);
      
//       // Force each tool to update its internal config copy
//       const toolIds = toolSystem.toolRegistry.getAllToolIds();
//       for (const toolId of toolIds) {
//         const tool = toolSystem.toolRegistry.getTool(toolId);
//         // Update the tool's config with the new settings
//         tool.config = {
//           ...tool.config,
//           ...appState.settings_claude_api_configuration
//         };
//       }
      
//       // Show a confirmation message to the user
//       if (apiSettingsWindow && !apiSettingsWindow.isDestroyed()) {
//         apiSettingsWindow.webContents.send('settings-saved-notification', {
//           message: 'Settings updated and applied to all tools',
//           requiresRestart: false
//         });
//       }
      
//       // Notify main window that settings were updated
//       if (mainWindow && !mainWindow.isDestroyed()) {
//         mainWindow.webContents.send('api-settings-updated', appState.settings_claude_api_configuration);
//       }
      
//       console.log('Claude API settings saved and applied successfully');
      
//       return {
//         success: true
//       };
//     } catch (error) {
//       console.error('Error saving Claude API settings:', error);
//       return {
//         success: false,
//         message: error.message
//       };
//     }
//   });
  //   // Handle API settings dialog closing
//   // ipcMain.on('close-api-settings-dialog', (event, action, data) => {
//   //   if (apiSettingsWindow && !apiSettingsWindow.isDestroyed()) {
//   //     apiSettingsWindow.hide();
      
//   //     // If settings were saved, could notify the main window if needed
//   //     if (action === 'saved' && mainWindow && !mainWindow.isDestroyed()) {
//   //       mainWindow.webContents.send('api-settings-updated', data);
//   //     }
//   //   }
//   // });
// }
// -----------------------------------------------------------------------------
// Set up API settings handlers – database‑free
// -----------------------------------------------------------------------------
function setupApiSettingsHandlers() {
  // Local copy of the schema that used to live in database.getClaudeApiSettingsSchema()
  // (kept here so the renderer can still build the form).
  const CLAUDE_API_SCHEMA = [
    { name: 'max_retries',            label: 'Max Retries',                       type: 'number', default: 1,       required: true,  description: 'Maximum retry attempts if an API call fails.' },
    { name: 'request_timeout',        label: 'Request Timeout (seconds)',         type: 'number', default: 300,     required: true,  description: 'Seconds to wait for the API to respond.' },
    { name: 'desired_output_tokens',  label: 'Desired Output Tokens',             type: 'number', default: 12000,   required: true,  description: 'Approximate size of the visible reply.' },
    { name: 'context_window',         label: 'Context Window (tokens)',           type: 'number', default: 200000,  required: true,  description: 'Maximum tokens the model can see at once.' },
    { name: 'thinking_budget_tokens', label: 'Thinking Budget (tokens)',          type: 'number', default: 32000,   required: true,  description: 'Private “thinking” tokens before the reply.' },
    { name: 'betas_max_tokens',       label: 'Beta Max Tokens',                   type: 'number', default: 128000,  required: true,  description: 'Upper limit when enabling beta features.' },
    { name: 'model_name',             label: 'Model Name',                        type: 'text',   default: 'claude-3-7-sonnet-20250219', required: true, description: 'Exact model identifier.' },
    { name: 'betas',                  label: 'Beta Features (comma‑separated)',   type: 'text',   default: 'output-128k-2025-02-19',     required: true, description: 'List of beta flags.' },
    { name: 'max_thinking_budget',    label: 'Max Thinking Budget (tokens)',      type: 'number', default: 32000,   required: true,  description: 'Absolute cap for thinking tokens.' }
  ];

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  ipcMain.handle('get-claude-api-settings', async () => {
    try {
      return {
        schema: CLAUDE_API_SCHEMA,
        values: appState.settings_claude_api_configuration   // already in memory
      };
    } catch (error) {
      console.error('Error getting Claude API settings:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('save-claude-api-settings', async (_event, settings) => {
    try {
      console.log('Saving Claude API settings:', settings);

      // Merge and persist to electron‑store (via appState)
      appState.settings_claude_api_configuration = {
        ...appState.settings_claude_api_configuration,
        ...settings
      };
      if (appState.store) {
        appState.store.set(
          'claude_api_configuration',
          appState.settings_claude_api_configuration
        );
      }

      // Re‑instantiate the Claude service with the new config
      toolSystem.reinitializeClaudeService(appState.settings_claude_api_configuration);

      // Push fresh settings into every registered tool
      for (const toolId of toolSystem.toolRegistry.getAllToolIds()) {
        const tool = toolSystem.toolRegistry.getTool(toolId);
        tool.config = {
          ...tool.config,
          ...appState.settings_claude_api_configuration
        };
      }

      // Notify UI
      if (apiSettingsWindow && !apiSettingsWindow.isDestroyed()) {
        apiSettingsWindow.webContents.send('settings-saved-notification', {
          message: 'Settings updated and applied to all tools',
          requiresRestart: false
        });
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(
          'api-settings-updated',
          appState.settings_claude_api_configuration
        );
      }

      console.log('Claude API settings saved and applied successfully');
      return { success: true };
    } catch (error) {
      console.error('Error saving Claude API settings:', error);
      return { success: false, message: error.message };
    }
  });

  // Close dialog without touching a database
  ipcMain.on('close-api-settings-dialog', (_event, action, data) => {
    if (apiSettingsWindow && !apiSettingsWindow.isDestroyed()) {
      apiSettingsWindow.hide();

      if (action === 'saved' && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('api-settings-updated', data);
      }
    }
  });
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

      // cls: not working:
      // dialog.showMessageBox({
      //   type: 'info',
      //   title: 'Conversion Complete',
      //   message: 'Output saved as ' + outputFilename,
      //   detail: 'Found ' + chapters.length + ' chapters.'
      // });
      
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
      const fileCache = require('cache/file-cache');
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

// async function validateCriticalResources() {
//   try {
//     // Get the database location
//     const userDataPath = app.getPath('userData');
//     const dbPath = path.join(userDataPath, 'writers-toolkit-db.json');
    
//     console.log(`Checking for database at: ${dbPath}`);
    
//     // Check if database exists
//     if (!fs.existsSync(dbPath)) {
//       await dialog.showMessageBox({
//         type: 'error',
//         title: 'Critical Error',
//         message: 'Application database not found',
//         detail: `The database file is missing: ${dbPath}\n\nThe application cannot continue without this file.`,
//         buttons: ['Exit']
//       });
      
//       app.exit(1);
//       return false;
//     }
    
//     // Try to read the database to verify its contents
//     try {
//       const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
//       console.log('Database loaded, checking for tools...');
      
//       if (!dbContent.tools || Object.keys(dbContent.tools).length === 0) {
//         console.error('No tools found in database');
//         await dialog.showMessageBox({
//           type: 'error',
//           title: 'Critical Error',
//           message: 'No tools found in database',
//           detail: 'The application requires tool definitions in the database to function.',
//           buttons: ['Exit']
//         });
        
//         app.exit(1);
//         return false;
//       }
      
//       console.log(`Found ${Object.keys(dbContent.tools).length} tools in database`);
//     } catch (error) {
//       console.error('Error reading database:', error);
//       await dialog.showMessageBox({
//         type: 'error',
//         title: 'Critical Error',
//         message: 'Database is corrupted',
//         detail: `Error reading database: ${error.message}`,
//         buttons: ['Exit']
//       });
      
//       app.exit(1);
//       return false;
//     }
    
//     return true;
//   } catch (error) {
//     console.error('Error in validateCriticalResources:', error);
//     return false;
//   }
// }

// Initialize the app state and then create the window
async function main() {
  try {
    // Validate critical resources first
    // const resourcesValid = await validateCriticalResources();
    // if (!resourcesValid) return; // Exit if validation failed

    // Initialize AppState before using it
    await appState.initialize();
    
    // Initialize database
    // await database.init();

    // clean up project history on startup
    // await database.cleanProjectHistory();
    
    // Initialize tool system with Claude API settings
    // await toolSystem.initializeToolSystem(
    //   database.getClaudeApiSettings(),
    //   database
    // );
    // Initialize tool system with Claude API settings
    try {
      // await toolSystem.initializeToolSystem(
      //   database.getClaudeApiSettings(),
      //   database
      // );
      // await toolSystem.initializeToolSystem(appState.settingsclaudeapiconfiguration);
      await toolSystem.initializeToolSystem(appState.settings_claude_api_configuration);
    } catch (toolError) {
      console.error('Warning: Tool system initialization failed:', toolError.message);
      // Show error to user but don't crash the app
      dialog.showErrorBox(
        'API Configuration Warning', 
        'Some Claude API settings may be missing. You can update them in Edit → API Settings.'
      );
      // Continue without crashing
    }
    
    // Set up IPC handlers
    setupIPCHandlers();
    
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
