const { exec } = require('child_process');
const os = require('os');

function openExternalApp(appName, filePath = null) {
  const platform = os.platform();
  let command;
  
  if (platform === 'darwin') {  // macOS
    command = filePath 
      ? `open -a "${appName}" "${filePath}"`
      : `open -a "${appName}"`;
  } 
  else if (platform === 'win32') {  // Windows
    command = filePath 
      ? `start "" "${appName}" "${filePath}"`
      : `start "" "${appName}"`;
  }
  else {  // Linux and others
    command = filePath 
      ? `xdg-open "${filePath}"`
      : null;
  }
  
  if (command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error launching application: ${error.message}`);
          reject(error);
          return;
        }
        console.log('Command executed successfully:', command);
        resolve(true);
      });
    });
  } else {
    return Promise.reject(new Error(`Unsupported platform: ${platform}`));
  }
}

// Test the function by launching a simple app
async function runTest() {
  try {
    // Determine which app to test based on platform
    const platform = os.platform();
    let testApp;
    
    if (platform === 'darwin') { // macOS
      // testApp = "TextEdit";
      testApp = "Sublime Text";
    } else if (platform === 'win32') { // Windows
      testApp = "notepad";
    } else {
      // For Linux, we can just try to open a file
      console.log("On Linux, testing with file opening only");
    }
    
    console.log(`Testing app launch on ${platform} with app: ${testApp}`);
    
    // Launch without a file
    await openExternalApp(testApp);
    console.log("App launched successfully without file");
    
    // Optional: Uncomment to test with a file
    // const testFilePath = "/path/to/your/test.txt"; // Change this to a real file path
    // await openExternalApp(testApp, testFilePath);
    // console.log("App launched successfully with file");
    
  } catch (error) {
    console.error("Test failed:", error);
  }
}

runTest();
