// tool-general.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * Generic Tool Template
 * Use this as a starting point for converting Python tools to JavaScript
 * 
 * CUSTOMIZATION POINTS:
 * 1. Change the class name and constructor name parameter
 * 2. Implement the createPrompt method with appropriate prompt templates
 * 3. Update the saveReport method if needed for specific output formatting
 * 4. Add any tool-specific helper methods as needed
 */
class GenericTool extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    // TODO: Change 'generic_tool' to your tool's ID
    super('generic_tool', config);
    this.claudeService = claudeService;
    // console.log('Generic Tool initialized with config:', config);
  }
  
  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing GenericTool with options:', options);
    
    // Clear the cache for this tool
    // TODO: Change 'generic_tool' to your tool's ID
    const toolName = 'generic_tool';
    fileCache.clear(toolName);
    
    // Extract common options - customize as needed
    const inputFile = options.input_file;
    const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    const outputFiles = [];
    
    // Validate save directory
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }
    
    // Ensure file paths are absolute
    const absoluteInputFile = this.ensureAbsolutePath(inputFile, saveDir);
    
    try {
      // Read input file
      this.emitOutput(`Reading input file: ${absoluteInputFile}\n`);
      const inputContent = await this.readInputFile(absoluteInputFile);
      
      // TODO: Add additional input file reading if your tool needs multiple inputs
      
      // Create prompt using input content
      const prompt = this.createPrompt(inputContent);

      // Count tokens in the prompt
      this.emitOutput(`Counting tokens in prompt...\n`);
      const promptTokens = await this.claudeService.countTokens(prompt);

      // Call the shared token budget calculator
      const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);

      // Handle logging based on the returned values
      this.emitOutput(`\nToken stats:\n`);
      this.emitOutput(`Max AI model context window: [${tokenBudgets.contextWindow}] tokens\n`);
      this.emitOutput(`Input prompt tokens: [${tokenBudgets.promptTokens}] ...\n`);
      this.emitOutput(`                     = outline.txt + world.txt + manuscript.txt\n`);
      this.emitOutput(`                       + prompt instructions\n`);
      this.emitOutput(`Available tokens: [${tokenBudgets.availableTokens}]  = ${tokenBudgets.contextWindow} - ${tokenBudgets.promptTokens} = context_window - prompt\n`);
      this.emitOutput(`Desired output tokens: [${tokenBudgets.desiredOutputTokens}]\n`);
      this.emitOutput(`AI model thinking budget: [${tokenBudgets.thinkingBudget}] tokens\n`);
      this.emitOutput(`Max output tokens: [${tokenBudgets.maxTokens}] tokens\n`);

      // Check for special conditions
      if (tokenBudgets.capThinkingBudget) {
        this.emitOutput(`Warning: thinking budget is larger than 32K, set to 32K.\n`);
      }

      // Check if the prompt is too large
      if (tokenBudgets.isPromptTooLarge) {
        this.emitOutput(`Error: prompt is too large to have a ${tokenBudgets.configuredThinkingBudget} thinking budget!\n`);
        this.emitOutput(`Run aborted!\n`);
        throw new Error(`Prompt is too large for ${tokenBudgets.configuredThinkingBudget} thinking budget - run aborted`);
      }
      
      // Call Claude API with streaming
      this.emitOutput(`Sending request to Claude API (streaming)...\n`);
      
      const startTime = Date.now();
      let fullResponse = "";
      let thinkingContent = "";
      
      // Create system prompt to avoid markdown
      const systemPrompt = "NO Markdown! Never respond with Markdown formatting, plain text only.";

      // Use the calculated values in the API call
      try {
        await this.claudeService.streamWithThinking(
          prompt,
          {
            model: "claude-3-7-sonnet-20250219",
            system: systemPrompt,
            max_tokens: tokenBudgets.maxTokens,
            thinking: {
              type: "enabled",
              budget_tokens: tokenBudgets.thinkingBudget
            },
            betas: ["output-128k-2025-02-19"]
          },
          // Callback for thinking content
          (thinkingDelta) => {
            thinkingContent += thinkingDelta;
          },
          // Callback for response text
          (textDelta) => {
            fullResponse += textDelta;
          }
        );
      } catch (error) {
        this.emitOutput(`\nAPI Error: ${error.message}\n`);
        throw error;
      }
      
      // Calculate time elapsed
      const elapsed = (Date.now() - startTime) / 1000;
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      
      this.emitOutput(`\nCompleted in ${minutes}m ${seconds.toFixed(2)}s.\n`);
      
      // Count words in response
      const wordCount = this.countWords(fullResponse);
      this.emitOutput(`Report has approximately ${wordCount} words.\n`);
      
      // Count tokens in response
      const responseTokens = await this.claudeService.countTokens(fullResponse);
      this.emitOutput(`Response token count: ${responseTokens}\n`);
      
      // Save the response to a file
      const customDescription = options.custom_description || '';
      
      const outputFile = await this.saveReport(
        fullResponse,
        thinkingContent,
        promptTokens,
        responseTokens,
        saveDir,
        customDescription
      );
      
      outputFiles.push(outputFile);
      
      // Add to the file cache
      fileCache.addFile(toolName, outputFile);
      
      // Return the result
      return {
        success: true,
        outputFiles,
        stats: {
          wordCount,
          tokenCount: responseTokens,
          elapsedTime: `${minutes}m ${seconds.toFixed(2)}s`
        }
      };
      
    } catch (error) {
      console.error('Error in GenericTool:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create prompt based on input content
   * @param {string} inputContent - The content of the input file
   * @returns {string} - Prompt for Claude API
   * 
   * TODO: Implement this method with your specific prompt templates
   */
  createPrompt(inputContent) {
    // CUSTOMIZATION POINT: Replace with your tool-specific prompt
    return `=== INPUT ===
${inputContent}
=== END INPUT ===

NO Markdown formatting!

[Your tool-specific instructions here]

1. Read the input content
2. [Specific task for Claude]
3. [Additional instructions]
`;
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
   * Ensure file path is absolute
   * @param {string} filePath - File path (may be relative or absolute)
   * @param {string} basePath - Base path to prepend for relative paths
   * @returns {string} - Absolute file path
   */
  ensureAbsolutePath(filePath, basePath) {
    if (!filePath) return filePath;
    
    // Check if the path is already absolute
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    
    // Make the path absolute by joining with the base path
    return path.join(basePath, filePath);
  }
  
  /**
   * Save report and thinking content to files
   * @param {string} content - Response content
   * @param {string} thinking - Thinking content
   * @param {number} promptTokens - Prompt token count
   * @param {number} responseTokens - Response token count
   * @param {string} saveDir - Directory to save to
   * @param {string} description - Optional description
   * @returns {Promise<string>} - Path to saved report
   */
  async saveReport(content, thinking, promptTokens, responseTokens, saveDir, description) {
    try {
      // TODO: Change 'output' to something more descriptive for your tool
      const toolType = 'output';
      
      // Create timestamp for filename
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
      
      // Create descriptive filename
      const desc = description ? `_${description}` : '';
      const baseFilename = `${toolType}${desc}_${timestamp}`;
      
      // Create stats for thinking file
      const stats = `
Details:
Max request timeout: ${this.config.request_timeout || 300} seconds
Max AI model context window: ${this.config.context_window || 200000} tokens
AI model thinking budget: ${this.config.thinking_budget_tokens || 32000} tokens
Desired output tokens: ${this.config.desired_output_tokens || 12000} tokens

Input tokens: ${promptTokens}
Output tokens: ${responseTokens}
`;
      
      // Save full response
      const reportFilename = `${baseFilename}.txt`;
      const reportPath = path.join(saveDir, reportFilename);
      await this.writeOutputFile(content, saveDir, reportFilename);
      
      // Save thinking content if available and not skipped
      if (thinking) {
        const thinkingFilename = `${baseFilename}_thinking.txt`;
        const thinkingContent = `=== TOOL OUTPUT ===

${thinking}

=== END TOOL OUTPUT ===
${stats}`;
        
        await this.writeOutputFile(thinkingContent, saveDir, thinkingFilename);
        this.emitOutput(`AI thinking saved to: ${path.join(saveDir, thinkingFilename)}\n`);
      }
      
      this.emitOutput(`Report saved to: ${reportPath}\n`);
      return reportPath;
    } catch (error) {
      console.error(`Error saving report:`, error);
      this.emitOutput(`Error saving report: ${error.message}\n`);
      throw error;
    }
  }
}

module.exports = GenericTool;