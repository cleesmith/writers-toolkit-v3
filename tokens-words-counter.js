// tokens-words-counter.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');

/**
 * FOR TESTING ONLY:
 * Creates a delay that won't completely freeze the UI
 * @param {number} seconds - Total seconds to delay
 * @param {function} progressCallback - Function to call with progress updates
 */
function gentleDelay(seconds, progressCallback) {
  return new Promise(resolve => {
    let secondsElapsed = 0;
    
    // Use setInterval for regular UI updates
    const interval = setInterval(() => {
      secondsElapsed++;
      
      if (progressCallback) {
        progressCallback(`Delay: ${secondsElapsed} seconds elapsed\n`);
      }
      
      if (secondsElapsed >= seconds) {
        clearInterval(interval);
        resolve();
      }
    }, 1000); // Update every second
  });
}

class TokensWordsCounter extends BaseTool {
  constructor(claudeService, config = {}) {
    super('tokens_words_counter', config);
    this.claudeService = claudeService;
  }
  
  /**
   * Count words in text
   * @param {string} text - Text to count words in
   * @returns {number} - Word count
   */
  countWords(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }
  
  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    // Clear the cache for this tool
    const toolName = 'tokens_words_counter';
    fileCache.clear(toolName);
    
    // Extract options
    let inputFile = options.input_file;
    const outputFiles = [];

    // Get the project directory path
    const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }
  
    // Fix relative paths by resolving them against the project directory
    // Only prepend the path if inputFile doesn't already have an absolute path
    if (inputFile && !path.isAbsolute(inputFile) && !inputFile.startsWith('~/')) {
      // This makes relative paths like "manuscript.txt" resolve to the current project folder
      inputFile = path.join(saveDir, inputFile);
      this.emitOutput(`Using file: ${inputFile}\n`);
    }

    try {
      // Read the input file
      this.emitOutput(`Reading file: ${inputFile}\n`);

      const text = await this.readInputFile(inputFile);
      
      // Count words
      this.emitOutput('Counting words...\n');
      const wordCount = this.countWords(text);
      this.emitOutput(`Word count: ${wordCount}\n`);
      
      // Count tokens using Claude API
      this.emitOutput('Counting tokens using Claude API (this may take a few seconds)...\n');
      
      const promptTokens = await this.claudeService.countTokens(text);
      this.emitOutput(`Token count: ${promptTokens}\n`);
      
      // Use the shared token budgets calculator from the Claude service
      // This ensures consistent calculation across all tools
      const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);
      
      // Calculate words per token
      const wordsPerToken = promptTokens > 0 ? wordCount / promptTokens : 0;
      
      // Prepare report content
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const inputBase = path.basename(inputFile);
      const inputName = path.parse(inputBase).name;
      
      const reportContent = `Token and Word Count Report
=========================

Analysis of file: ${inputFile}
Generated on: ${new Date().toLocaleString()}

Context window: ${tokenBudgets.contextWindow} tokens
Available tokens: ${tokenBudgets.availableTokens} tokens
Thinking budget: ${tokenBudgets.thinkingBudget} tokens
Desired output tokens: ${tokenBudgets.desiredOutputTokens} tokens

Note:
- This analysis shows how many tokens your text requires
- For Claude API, the token count affects both cost and context usage
- The words-to-token ratio helps estimate token usage for future texts

Word count: ${wordCount}
Token count: ${promptTokens}
Words per token ratio: ${wordsPerToken.toFixed(2)}

`;

      // Output the report to the console
      this.emitOutput('\n' + reportContent + '\n');
      
      // Save the report to a file
      const outputFileName = `count_${inputName}_${timestamp}.txt`;
      this.emitOutput(`Saving report to: ${path.join(saveDir, outputFileName)}\n`);
      
      const outputFile = await this.writeOutputFile(
        reportContent, 
        saveDir, 
        outputFileName
      );
      
      // Add to local tracking array
      outputFiles.push(outputFile);
      
      // Add to the shared file cache
      fileCache.addFile(toolName, outputFile);
      
      this.emitOutput('Analysis complete!\n');
      
      // Return the result
      return {
        success: true,
        outputFiles,
        stats: {
          wordCount,
          tokenCount: promptTokens,
          wordsPerToken: wordsPerToken.toFixed(2),
          availableTokens: tokenBudgets.availableTokens
        }
      };
    } catch (error) {
      console.error('Error in TokensWordsCounter:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
}

module.exports = TokensWordsCounter;
