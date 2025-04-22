// generic-tool-template.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('../state.js');
const fs = require('fs/promises');
const promptLoader = require('../utils/prompt-loader');
const database = require('../database');

/**
 * GenericToolTemplate
 * Base template for creating any tool in the Writer's Toolkit system.
 * This template integrates with the database to access tool configuration.
 */
class GenericToolTemplate extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config) {
    // Replace 'generic_tool' with your tool's unique identifier
    super('generic_tool', config);
    this.claudeService = claudeService;
    this.config = config;
    
    // Try to get tool configuration from database
    this.initializeFromDatabase();
  }
  
  /**
   * Initialize tool configuration from database
   */
  initializeFromDatabase() {
    try {
      // Get tool configuration from database
      const dbConfig = database.getToolByName(this.name);
      
      if (dbConfig) {
        console.log(`Loaded configuration for ${this.name} from database`);
        
        // Store tool options and schema
        this.options = dbConfig.options || {};
        this.optionsSchema = dbConfig.optionsSchema || {};
        this.title = dbConfig.title || this.name;
        this.description = dbConfig.description || '';
        
        // You might want to merge with the provided config in some cases
        this.mergedConfig = { ...dbConfig, ...this.config };
      } else {
        console.warn(`No database configuration found for tool: ${this.name}`);
        this.options = {};
        this.optionsSchema = {};
      }
    } catch (error) {
      console.error(`Error loading database configuration for ${this.name}:`, error);
      this.options = {};
      this.optionsSchema = {};
    }
  }
  
  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log(`Executing ${this.name} with options:`, options);
    
    try {
      // Validate options against schema from database
      this.validateOptions(options);
      
      // Clear the file cache for this tool
      fileCache.clear(this.name);
      
      // Get save directory
      const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
      if (!saveDir) {
        throw new Error('No save directory specified and no current project selected');
      }
      
      // Read input files
      const inputFiles = await this.readInputFiles(options, saveDir);
      
      // Get prompt template
      const promptType = options.prompt_type || 'main';
      const promptTemplate = await promptLoader.getPrompt(this.name, promptType);
      
      // Create prompt by replacing placeholders
      const prompt = this.createPrompt(promptTemplate, inputFiles, options);
      
      // Process with Claude API
      const result = await this.callClaudeAPI(prompt, options);
      
      // Save results to files
      const outputFiles = await this.saveResults(result, options, saveDir);
      
      // Register files with cache
      this.registerFilesWithCache(outputFiles);
      
      // Return success result with relevant stats
      return {
        success: true,
        outputFiles,
        stats: this.collectStats(result, options)
      };
      
    } catch (error) {
      console.error(`Error in ${this.name}:`, error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Validate options against the schema
   * @param {Object} options - The options to validate
   * @throws {Error} If validation fails
   */
  validateOptions(options) {
    // Skip validation if no schema is available
    if (!this.optionsSchema || Object.keys(this.optionsSchema).length === 0) {
      return;
    }
    
    const validationErrors = [];
    
    // Check each required option according to the schema
    for (const [name, schema] of Object.entries(this.optionsSchema)) {
      // Skip options that aren't required
      if (!schema.required) continue;
      
      // Check if the required option is present
      if (options[name] === undefined) {
        validationErrors.push(`Missing required option: ${name}`);
      }
    }
    
    // Throw validation error if any required options are missing
    if (validationErrors.length > 0) {
      throw new Error(`Option validation failed: ${validationErrors.join(', ')}`);
    }
  }
  
  /**
   * Read all required input files based on options
   * @param {Object} options - Tool options
   * @param {string} saveDir - Save directory path
   * @returns {Promise<Object>} - Object containing file contents
   */
  async readInputFiles(options, saveDir) {
    const files = {};
    const inputFilesToRead = this.getInputFilePaths(options, saveDir);
    
    for (const [key, filePath] of Object.entries(inputFilesToRead)) {
      if (filePath) {
        this.emitOutput(`Reading ${key} file: ${filePath}\n`);
        try {
          files[key] = await this.readInputFile(filePath);
        } catch (error) {
          // Use schema to determine if file is required
          if (this.isRequiredFile(key)) {
            throw error;
          } else {
            this.emitOutput(`Note: Optional file ${key} not found or couldn't be read.\n`);
            files[key] = '';
          }
        }
      } else {
        files[key] = '';
      }
    }
    
    return files;
  }
  
  /**
   * Get paths to input files
   * @param {Object} options - Tool options
   * @param {string} saveDir - Save directory path
   * @returns {Object} - Map of file keys to absolute paths
   */
  getInputFilePaths(options, saveDir) {
    const paths = {};
    
    // Look at option schema to determine what file options to handle
    if (this.optionsSchema) {
      for (const [name, schema] of Object.entries(this.optionsSchema)) {
        // Check for file-type options based on naming convention or schema metadata
        if (name.endsWith('_file') && options[name]) {
          const key = name.replace('_file', '');
          paths[key] = this.ensureAbsolutePath(options[name], saveDir);
        }
      }
    } else {
      // Fallback for common file types if no schema is available
      if (options.input_file) {
        paths.input = this.ensureAbsolutePath(options.input_file, saveDir);
      }
      
      if (options.manuscript_file) {
        paths.manuscript = this.ensureAbsolutePath(options.manuscript_file, saveDir);
      }
      
      if (options.outline_file) {
        paths.outline = this.ensureAbsolutePath(options.outline_file, saveDir);
      }
      
      if (options.world_file) {
        paths.world = this.ensureAbsolutePath(options.world_file, saveDir);
      }
    }
    
    return paths;
  }
  
  /**
   * Determine if a file is required for this tool
   * @param {string} fileKey - The key identifying the file
   * @returns {boolean} - True if the file is required
   */
  isRequiredFile(fileKey) {
    // Check schema to see if this file is required
    const optionName = `${fileKey}_file`;
    
    if (this.optionsSchema && this.optionsSchema[optionName]) {
      return this.optionsSchema[optionName].required === true;
    }
    
    // By default, assume files are optional
    return false;
  }
  
  /**
   * Create prompt by replacing placeholders in template
   * @param {string} template - Prompt template
   * @param {Object} files - File contents
   * @param {Object} options - Tool options
   * @returns {string} - Complete prompt for Claude API
   */
  createPrompt(template, files, options) {
    if (!template) {
      // If no template was found, create a default one
      // This is a fallback that should rarely be used
      return this.createDefaultPrompt(files, options);
    }
    
    // Replace file content placeholders
    let prompt = template;
    for (const [key, content] of Object.entries(files)) {
      prompt = prompt.replace(new RegExp(`<${key}></${key}>`, 'g'), content);
    }
    
    // Replace option placeholders
    for (const [key, value] of Object.entries(options)) {
      if (typeof value === 'string') {
        prompt = prompt.replace(new RegExp(`<option:${key}><\/option:${key}>`, 'g'), value);
      }
    }
    
    // Replace common special placeholders
    prompt = prompt.replace(/<no-markdown><\/no-markdown>/g, "IMPORTANT: - NO Markdown formatting");
    
    return prompt;
  }
  
  /**
   * Create a default prompt if no template is found
   * @param {Object} files - File contents
   * @param {Object} options - Tool options
   * @returns {string} - Default prompt
   */
  createDefaultPrompt(files, options) {
    // Create a sensible default based on tool description from database
    let prompt = "IMPORTANT: - NO Markdown formatting\n\n";
    prompt += `You are an expert AI assistant helping with ${this.description || 'document analysis'}.\n\n`;
    
    // Add file contents
    for (const [key, content] of Object.entries(files)) {
      if (content) {
        prompt += `=== ${key.toUpperCase()} ===\n${content}\n=== END ${key.toUpperCase()} ===\n\n`;
      }
    }
    
    // Add task description
    prompt += `Please analyze the provided content${options.task ? ' for ' + options.task : ''}.\n`;
    
    return prompt;
  }
  
  /**
   * Call Claude API with the prompt
   * @param {string} prompt - Complete prompt
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - API response and stats
   */
  async callClaudeAPI(prompt, options) {
    // Count tokens in the prompt
    this.emitOutput(`Counting tokens in prompt...\n`);
    const promptTokens = await this.claudeService.countTokens(prompt);
    
    // Calculate token budget
    const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);
    this.logTokenStats(tokenBudgets);
    
    // Check if prompt is too large
    if (tokenBudgets.isPromptTooLarge) {
      this.emitOutput(`Error: prompt is too large to have a ${tokenBudgets.configuredThinkingBudget} thinking budget!\n`);
      this.emitOutput(`Run aborted!\n`);
      throw new Error(`Prompt is too large for ${tokenBudgets.configuredThinkingBudget} thinking budget - run aborted`);
    }
    
    // Call Claude API with streaming
    this.emitOutput(`Sending request to Claude API (streaming)...\n`);
    this.displayWaitingMessage();
    
    const startTime = Date.now();
    let fullResponse = "";
    let thinkingContent = "";
    
    // Create system prompt to avoid markdown
    const systemPrompt = "CRITICAL INSTRUCTION: NO Markdown formatting of ANY kind. Never use headers, bullets, or any formatting symbols. Plain text only with standard punctuation.";
    
    try {
      await this.claudeService.streamWithThinking(
        prompt,
        {
          system: systemPrompt,
          max_tokens: tokenBudgets.maxTokens,
          thinking: {
            type: "enabled",
            budget_tokens: tokenBudgets.thinkingBudget
          }
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
    
    // Calculate elapsed time
    const elapsed = (Date.now() - startTime) / 1000;
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    this.emitOutput(`\nCompleted in ${minutes}m ${seconds.toFixed(2)}s.\n`);
    
    // Count words in response
    const wordCount = this.countWords(fullResponse);
    this.emitOutput(`Response has approximately ${wordCount} words.\n`);
    
    // Count tokens in response
    const responseTokens = await this.claudeService.countTokens(fullResponse);
    this.emitOutput(`Response token count: ${responseTokens}\n`);
    
    // Remove any markdown formatting
    fullResponse = this.removeMarkdown(fullResponse);
    
    return {
      content: fullResponse,
      thinking: thinkingContent,
      stats: {
        promptTokens,
        responseTokens,
        wordCount,
        elapsedTime: elapsed,
        minutes,
        seconds
      }
    };
  }
  
  /**
   * Log token statistics
   * @param {Object} tokenBudgets - Token budget information
   */
  logTokenStats(tokenBudgets) {
    this.emitOutput(`\nToken stats:\n`);
    this.emitOutput(`Max AI model context window: [${tokenBudgets.contextWindow}] tokens\n`);
    this.emitOutput(`Input prompt tokens: [${tokenBudgets.promptTokens}] tokens\n`);
    this.emitOutput(`Available tokens: [${tokenBudgets.availableTokens}] tokens\n`);
    this.emitOutput(`Desired output tokens: [${tokenBudgets.desiredOutputTokens}] tokens\n`);
    this.emitOutput(`AI model thinking budget: [${tokenBudgets.thinkingBudget}] tokens\n`);
    this.emitOutput(`Max output tokens: [${tokenBudgets.maxTokens}] tokens\n`);
    
    if (tokenBudgets.capThinkingBudget) {
      this.emitOutput(`Warning: thinking budget is larger than 32K, set to 32K.\n`);
    }
  }
  
  /**
   * Display waiting message during API call
   */
  displayWaitingMessage() {
    this.emitOutput(`****************************************************************************\n`);
    this.emitOutput(`*  Processing with Claude API...                                           \n`);
    this.emitOutput(`*  This process typically takes several minutes.                           \n`);
    this.emitOutput(`*                                                                          \n`);
    this.emitOutput(`*  It's recommended to keep this window the sole 'focus'                   \n`);
    this.emitOutput(`*  and to avoid browsing online or running other apps, as these API        \n`);
    this.emitOutput(`*  network connections are often flakey, like delicate echoes of whispers. \n`);
    this.emitOutput(`*                                                                          \n`);
    this.emitOutput(`*  So breathe, remove eye glasses, stretch, relax, and be like water 🥋 🧘🏽‍♀️\n`);
    this.emitOutput(`****************************************************************************\n\n`);
  }
  
  /**
   * Save results to files
   * @param {Object} result - API result with content and thinking
   * @param {Object} options - Tool options
   * @param {string} saveDir - Directory to save files to
   * @returns {Promise<string[]>} - Array of saved file paths
   */
  async saveResults(result, options, saveDir) {
    try {
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
      const description = options.description || '';
      const desc = description ? `_${description}` : '';
      
      // Filename components to be overridden by specific tools as needed
      const filePrefix = this.getFilePrefix(options);
      const baseFilename = `${filePrefix}${desc}_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];
      
      // Save main output
      const outputFilename = `${baseFilename}.txt`;
      const outputPath = path.join(saveDir, outputFilename);
      await this.writeOutputFile(result.content, saveDir, outputFilename);
      this.emitOutput(`Output saved to: ${outputPath}\n`);
      savedFilePaths.push(outputPath);
      
      // Save thinking content if available and not skipped
      if (result.thinking && !options.skip_thinking) {
        const thinkingFilename = `${baseFilename}_thinking.txt`;
        const thinkingPath = path.join(saveDir, thinkingFilename);
        
        // Create stats block
        const statsBlock = this.createStatsBlock(result.stats, options);
        
        const thinkingContent = `=== ${this.title || this.name.toUpperCase()} ===

=== AI'S THINKING PROCESS ===

${result.thinking}

=== END AI'S THINKING PROCESS ===
${statsBlock}`;
        
        await this.writeOutputFile(thinkingContent, saveDir, thinkingFilename);
        this.emitOutput(`AI thinking saved to: ${thinkingPath}\n`);
        savedFilePaths.push(thinkingPath);
      }
      
      return savedFilePaths;
    } catch (error) {
      console.error(`Error saving results:`, error);
      this.emitOutput(`Error saving results: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Get file prefix for output files
   * @param {Object} options - Tool options
   * @returns {string} - File prefix
   */
  getFilePrefix(options) {
    // Use database config to determine a sensible file prefix
    // This could be based on analysis type or other options
    return this.name;
  }
  
  /**
   * Create stats block for thinking file
   * @param {Object} stats - Statistics from API call
   * @param {Object} options - Tool options
   * @returns {string} - Formatted stats block
   */
  createStatsBlock(stats, options) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    const dateTimeStr = formatter.format(new Date());
    
    // Basic stats that apply to all tools
    let statsBlock = `
Details:  ${dateTimeStr}
Tool: ${this.title || this.name}
Max request timeout: ${this.config.request_timeout || 300} seconds
Max AI model context window: ${this.config.context_window || 200000} tokens
AI model thinking budget: ${this.config.thinking_budget_tokens || 32000} tokens
Desired output tokens: ${this.config.desired_output_tokens || 12000} tokens

Input tokens: ${stats.promptTokens}
Output tokens: ${stats.responseTokens}
Elapsed time: ${stats.minutes}m ${stats.seconds.toFixed(2)}s
`;
    
    // Add option-specific stats
    if (this.optionsSchema) {
      for (const [name, schema] of Object.entries(this.optionsSchema)) {
        // Only include options that have values and aren't file paths
        if (options[name] !== undefined && !name.endsWith('_file') && !name.endsWith('_dir')) {
          statsBlock += `${schema.label || name}: ${options[name]}\n`;
        }
      }
    }
    
    return statsBlock;
  }
  
  /**
   * Register files with the file cache
   * @param {Array} files - Array of file paths
   */
  registerFilesWithCache(files) {
    files.forEach(file => {
      fileCache.addFile(this.name, file);
    });
  }
  
  /**
   * Collect stats for the result
   * @param {Object} result - API result
   * @param {Object} options - Tool options
   * @returns {Object} - Stats object
   */
  collectStats(result, options) {
    // Basic stats that apply to all tools
    const stats = {
      wordCount: result.stats.wordCount,
      tokenCount: result.stats.responseTokens,
      elapsedTime: `${result.stats.minutes}m ${result.stats.seconds.toFixed(2)}s`
    };
    
    // Add key option values from the schema
    if (this.optionsSchema) {
      for (const [name, schema] of Object.entries(this.optionsSchema)) {
        // Only include non-file options
        if (options[name] !== undefined && !name.endsWith('_file') && !name.endsWith('_dir')) {
          stats[name] = options[name];
        }
      }
    }
    
    return stats;
  }
}

module.exports = GenericToolTemplate;
