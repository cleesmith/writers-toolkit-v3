// DOM Elements
const editor = document.getElementById('editor');
const positionDisplay = document.getElementById('position');
const statsDisplay = document.getElementById('statistics');
const currentFileDisplay = document.getElementById('currentFile');
const saveAsButton = document.getElementById('btnSaveAs');
const fontSizeSelect = document.getElementById('fontSize');
const wordWrapSelect = document.getElementById('wordWrap');
const closeBtn = document.getElementById('close-btn');
const body = document.body;

// Track the current file
let currentFilePath = null;
let documentChanged = false;

// Initialize editor
function initEditor() {
  // Set up tab key behavior
  editor.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      
      // Insert a tab at cursor position
      const start = this.selectionStart;
      const end = this.selectionEnd;
      
      this.value = this.value.substring(0, start) + 
                    "  " + 
                    this.value.substring(end);
      
      // Put cursor after the inserted tab
      this.selectionStart = this.selectionEnd = start + 2;
      
      documentChanged = true;
    }
  });
  
  // Update the cursor position and stats display
  editor.addEventListener('keyup', updatePositionAndStats);
  editor.addEventListener('click', updatePositionAndStats);
  editor.addEventListener('input', () => {
    documentChanged = true;
    updatePositionAndStats();
  });
  
  // Initial update
  updatePositionAndStats();
  
  // Set up event listeners for UI controls
  setupEventListeners();
}

// Update the position and statistics displays
function updatePositionAndStats() {
  const text = editor.value;
  
  // Get cursor position
  const cursorPos = editor.selectionStart;
  
  // Calculate line and column
  const lines = text.substr(0, cursorPos).split('\n');
  const lineNumber = lines.length;
  const columnNumber = lines[lines.length - 1].length + 1;
  
  // Update displays with formatted numbers
  positionDisplay.textContent = `Line: ${lineNumber}, Column: ${columnNumber}`;
  statsDisplay.textContent = `Words: ${countWords(text).toLocaleString()} & Characters: ${text.length.toLocaleString()}`;
}

// Count words in text
function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Set up event listeners
function setupEventListeners() {
  // Close button handler
  closeBtn.addEventListener('click', closeDialog);
  
  // Save As button handler
  saveAsButton.addEventListener('click', saveFileAs);
  
  // Font size changes
  fontSizeSelect.addEventListener('change', function() {
    editor.style.fontSize = `${this.value}px`;
  });
  
  // Word wrap toggle
  wordWrapSelect.addEventListener('change', function() {
    const isWrapped = this.value === 'on';
    editor.style.whiteSpace = isWrapped ? 'pre-wrap' : 'pre';
  });
  
  // IPC events from main process
  if (window.electronAPI) {
    window.electronAPI.onFileOpened && window.electronAPI.onFileOpened(handleFileOpened);
  }
}

// Close the dialog
function closeDialog() {
  // Check for unsaved changes
  if (documentChanged) {
    if (!confirm('You have unsaved changes. Close anyway?')) {
      return; // User canceled, so don't close
    }
  }
  
  // Close the dialog
  if (window.electronAPI && window.electronAPI.closeEditorDialog) {
    window.electronAPI.closeEditorDialog();
  }
}

// Save As functionality
async function saveFileAs() {
  const content = editor.value;
  
  if (window.electronAPI && window.electronAPI.saveFile) {
    const result = await window.electronAPI.saveFile({
      filePath: currentFilePath,
      content,
      saveAs: true
    });
    
    if (result && result.success) {
      currentFilePath = result.filePath;
      currentFileDisplay.textContent = currentFilePath;
      documentChanged = false;
      // Show saved notification briefly
      showNotification('File saved successfully');
    }
  }
}

// Show a brief notification
function showNotification(message, duration = 2000) {
  // Create notification element if it doesn't exist
  let notification = document.getElementById('notification');
  
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'notification';
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.padding = '10px 20px';
    notification.style.backgroundColor = '#4a89dc';
    notification.style.color = 'white';
    notification.style.borderRadius = '4px';
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s';
    notification.style.zIndex = '1000';
    
    document.body.appendChild(notification);
  }
  
  // Set message and show
  notification.textContent = message;
  notification.style.opacity = '1';
  
  // Hide after duration
  setTimeout(() => {
    notification.style.opacity = '0';
  }, duration);
}

// Handle opened file data from main process
function handleFileOpened(data) {
  if (data && data.filePath && data.content !== undefined) {
    currentFilePath = data.filePath;
    editor.value = data.content;
    currentFileDisplay.textContent = currentFilePath;
    documentChanged = false;
    updatePositionAndStats();
  }
}

// Initialize the editor when the document is ready
document.addEventListener('DOMContentLoaded', initEditor);

// Apply theme if sent from main process
if (window.electronAPI && window.electronAPI.onSetTheme) {
  window.electronAPI.onSetTheme(theme => {
    if (theme === 'light') {
      body.classList.remove('dark-mode');
      body.classList.add('light-mode');
    } else {
      body.classList.remove('light-mode');
      body.classList.add('dark-mode');
    }
  });
}