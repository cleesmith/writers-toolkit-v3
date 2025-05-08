// character-analyzer.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * Character Analyzer Tool
 * Analyzes manuscript, outline, and world files to identify 
 * and compare character appearances across different story documents
 */
class CharacterAnalyzer extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('character_analyzer', config);
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
    console.log('Executing CharacterAnalyzer with options:', options);
    
    // Extract options
    let manuscriptFile = options.manuscript_file;
    let outlineFile = options.outline_file;
    let worldFile = options.world_file;
    const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }

    // Ensure file paths are absolute
    manuscriptFile = this.ensureAbsolutePath(manuscriptFile, saveDir);
    
    if (outlineFile) {
      outlineFile = this.ensureAbsolutePath(outlineFile, saveDir);
    }
    
    if (worldFile) {
      worldFile = this.ensureAbsolutePath(worldFile, saveDir);
    }
    
    // Log the full paths for debugging
    console.log('Using full paths:');
    console.log(`Manuscript: ${manuscriptFile}`);
    if (outlineFile) console.log(`Outline: ${outlineFile}`);
    if (worldFile) console.log(`World: ${worldFile}`);

    const outputFiles = [];
    
    try {
      // Read the input files
      this.emitOutput(`Reading files...\n`);

      // Read the manuscript file
      this.emitOutput(`Reading manuscript file: ${manuscriptFile}\n`);
      const manuscriptContent = await this.readInputFile(manuscriptFile);
      
      // Read the outline file if provided
      let outlineContent = '';
      if (outlineFile) {
        this.emitOutput(`Reading outline file: ${outlineFile}\n`);
        outlineContent = await this.readInputFile(outlineFile);
      }
      
      // Read the world file if provided
      let worldContent = '';
      if (worldFile) {
        this.emitOutput(`Reading world file: ${worldFile}\n`);
        worldContent = await this.readInputFile(worldFile);
      }
      
      // Create the prompt
      const prompt = this.createCharacterAnalysisPrompt(manuscriptContent, outlineContent, worldContent);

      // Count tokens in the prompt
      this.emitOutput(`Counting tokens in prompt...\n`);
      const promptTokens = await this.claudeService.countTokens(prompt);

      // Call the shared token budget calculator
      const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);

      // Handle logging based on the returned values
      this.emitOutput(`\nToken stats:\n`);
      this.emitOutput(`Max AI model context window: [${tokenBudgets.contextWindow}] tokens\n`);
      this.emitOutput(`Input prompt tokens: [${tokenBudgets.promptTokens}] sent to Claude\n`);
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
      this.emitOutput(`\nSending request to Claude API . . .\n`);
      
      // Add a message about waiting
      this.emitOutput(`\n****************************************************************************\n`);
      this.emitOutput(`*  Analyzing characters in manuscript.  \n`);
      this.emitOutput(`*                                                                          \n`);
      this.emitOutput(`*  This process typically takes several minutes.                           \n`);
      this.emitOutput(`*                                                                          \n`);
      this.emitOutput(`*  It's recommended to keep this window the sole 'focus'                   \n`);
      this.emitOutput(`*  and to avoid browsing online or running other apps, as these API        \n`);
      this.emitOutput(`*  network connections are often flakey, like delicate echoes of whispers. \n`);
      this.emitOutput(`*                                                                          \n`);
      this.emitOutput(`*  So breathe, remove eye glasses, stretch, relax, and be like water 🥋 🧘🏽‍♀️\n`);
      this.emitOutput(`****************************************************************************\n\n`);
      
      const startTime = Date.now();
      let fullResponse = "";
      let thinkingContent = "";
      
      // Create system prompt to avoid markdown
      const systemPrompt = "CRITICAL INSTRUCTION: NO Markdown formatting of ANY kind. Never use headers, bullets, or any formatting symbols. Plain text only with standard punctuation.";

      // Use the calculated values in the API call
      try {
        await this.claudeService.streamWithThinkingAndMessageStart(
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
          // callback for thinking content
          (thinkingDelta) => {
            thinkingContent += thinkingDelta;
          },
          // callback for response text
          (textDelta) => {
            fullResponse += textDelta;
          },
          // callback for message start with stats
          (messageStart) => {
            this.emitOutput(`${messageStart}\n`);
          },
          // callback for response headers
          (responseHeaders) => {
            this.emitOutput(`${responseHeaders}\n`);
          },
          // callback for status
          (callStatus) => {
            this.emitOutput(`${callStatus}\n`);
          },
        );
      } catch (error) {
        this.emitOutput(`\nAPI Error: ${error.message}\n`);
        throw error;
      }

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

      // Remove any markdown formatting
      fullResponse = this.removeMarkdown(fullResponse);

      // Save the report
      const outputFile = await this.saveReport(
        fullResponse,
        thinkingContent,
        promptTokens,
        responseTokens,
        saveDir
      );
      
      // Add all output files to the result
      outputFiles.push(...outputFile);
      
      // Add files to the cache
      const toolName = 'character_analyzer';
      outputFiles.forEach(file => {
        fileCache.addFile(toolName, file);
      });
      
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
      console.error('Error in CharacterAnalyzer:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create character analysis prompt
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} outlineContent - Outline content (optional)
   * @param {string} worldContent - World content (optional)
   * @returns {string} - Prompt for Claude API
   */
  createCharacterAnalysisPrompt(manuscriptContent, outlineContent = "", worldContent = "") {
    // Determine which files we have
    const hasOutline = Boolean(outlineContent.trim());
    const hasWorld = Boolean(worldContent.trim());
    
    // Construct file sections
    let fileSections = `=== MANUSCRIPT ===\n${manuscriptContent}\n=== END MANUSCRIPT ===\n`;
    
    if (hasOutline) {
      fileSections = `=== OUTLINE ===\n${outlineContent}\n=== END OUTLINE ===\n\n` + fileSections;
    }
    
    if (hasWorld) {
      fileSections = `=== WORLD ===\n${worldContent}\n=== END WORLD ===\n\n` + fileSections;
    }
    
    // Build instruction section
    const instructions = `IMPORTANT: NO Markdown formatting

You are an expert literary analyst specializing in character identification and analysis. Analyze the provided story files to identify all characters that appear in each file.

Your task is to create a comprehensive character analysis with these sections:

1. MASTER CHARACTER LIST:
   - Create a master list of ALL characters found across all provided files
   - For each character, specify in which file(s) they appear: manuscript, outline, and/or world
   - Include character names, aliases, titles, and roles where identifiable
   - Group related characters if appropriate (e.g., family members, teams)

2. CHARACTER PRESENCE ANALYSIS:
   - List characters that appear in the manuscript but NOT in the outline or world files
   - For each such character, provide:
     a) Brief description based on manuscript context
     b) An assessment of whether the character appears to be a deliberate addition or a potential inconsistency

3. CHARACTER CONSISTENCY ANALYSIS:
   - Identify any notable differences in how characters are portrayed across files
   - Note changes in names, titles, roles, or relationships
   - Highlight any potential continuity issues or contradictions

4. RECOMMENDATIONS:
   - Suggest which characters from the manuscript might need to be added to the outline/world files
   - Identify characters that might benefit from consolidation or clarification
   - Highlight any character-related issues that might impact story coherence

Format your analysis as a clear, organized report with sections and subsections. Use plain text formatting only (NO Markdown). Use numbered or bulleted lists where appropriate for clarity.

Be comprehensive in your character identification, capturing not just main characters but also secondary and minor characters that appear in any file.`;

    // Combine all sections
    return fileSections + "\n" + instructions;
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
   * @returns {Promise<string[]>} - Array of paths to saved files
   */
  async saveReport(content, thinking, promptTokens, responseTokens, saveDir, description) {
    try {
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

      // Create timestamp for filename
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
      
      // Create descriptive filename
      const baseFilename = `character_analysis_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];
      
      // Create stats for thinking file
      const stats = `
Details:  ${dateTimeStr}
Analysis type: Character analysis
Max request timeout: ${this.config.request_timeout} seconds
Max AI model context window: ${this.config.context_window} tokens
AI model thinking budget: ${this.config.thinking_budget_tokens} tokens
Desired output tokens: ${this.config.desired_output_tokens} tokens

Input tokens: ${promptTokens}
Output tokens: ${responseTokens}
`;
      
      // Save full response
      const reportFilename = `${baseFilename}.txt`;
      const reportPath = path.join(saveDir, reportFilename);
      await this.writeOutputFile(content, saveDir, reportFilename);
      savedFilePaths.push(reportPath);
      
      // Save thinking content if available and not skipped
      if (thinking) {
        const thinkingFilename = `${baseFilename}_thinking.txt`;
        const thinkingPath = path.join(saveDir, thinkingFilename);
        const thinkingContent = `=== CHARACTER ANALYSIS ===

=== AI'S THINKING PROCESS ===

${thinking}

=== END AI'S THINKING PROCESS ===
${stats}`;
        
        await this.writeOutputFile(thinkingContent, saveDir, thinkingFilename);
        this.emitOutput(`AI thinking saved to: ${thinkingPath}\n`);
        savedFilePaths.push(thinkingPath);
      }

      this.emitOutput(`Report saved to: ${reportPath}\n`);
      return savedFilePaths;
    } catch (error) {
      console.error(`Error saving report:`, error);
      this.emitOutput(`Error saving report: ${error.message}\n`);
      throw error;
    }
  }
}

module.exports = CharacterAnalyzer;
