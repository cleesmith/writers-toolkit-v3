// proofreader-plot-consistency.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');
const textProcessor = require('./textProcessor');

/**
 * Proofreader Plot Consistency Tool
 * Tracks narrative elements, world rules, and story logic
 */
class ProofreaderPlotConsistency extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('proofreader_plot_consistency', config);
    this.claudeService = claudeService;
  }

  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing Proofreader Plot Consistency with options:', options);
    
    // Clear the cache for this tool
    const toolName = 'proofreader_plot_consistency';
    fileCache.clear(toolName);
    
    // Extract options
    let manuscriptFile = options.manuscript_file;
    const language = options.language || 'English';
    const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }

    // Ensure file paths are absolute
    manuscriptFile = this.ensureAbsolutePath(manuscriptFile, saveDir);

    const outputFiles = [];
    
    try {
      const manuscriptContent = await this.readInputFile(manuscriptFile);
      const manuscriptWordCount = this.countWords(manuscriptContent);
      const manuscriptTokens = await this.claudeService.countTokens(manuscriptContent);
      const manuscriptWithoutChapterHeaders = textProcessor.processText(manuscriptContent)
      
      // Create prompt using the template with language
      const prompt = this.createPrompt(manuscriptWithoutChapterHeaders, language);
      const promptTokens = await this.claudeService.countTokens(prompt);

      // Call the shared token budget calculator
      const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);

      this.emitOutput(`Reading manuscript file: ${manuscriptFile}\n`);
      this.emitOutput(`\nToken stats:\n`);
      this.emitOutput(`Manuscript is ${manuscriptWordCount} words and ${manuscriptTokens} tokens.\n`);
      this.emitOutput(`Input prompt tokens: [${tokenBudgets.promptTokens}]\n`);
      this.emitOutput(`\n`);
      this.emitOutput(`Max AI model context window: [${tokenBudgets.contextWindow}] tokens\n`);
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
      this.emitOutput(`*  Proofreading manuscript for ${language} ...\n`);
      this.emitOutput(`*  \n`);
      this.emitOutput(`*  This process typically takes several minutes.\n`);
      this.emitOutput(`*                                                                          \n`);
      this.emitOutput(`*  It's recommended to keep this window the sole 'focus'                   \n`);
      this.emitOutput(`*  and to avoid browsing online or running other apps, as these API        \n`);
      this.emitOutput(`*  network connections are often flakey, like delicate echoes of whispers. \n`);
      this.emitOutput(`*                                                                          \n`);
      this.emitOutput(`*  So breathe, remove eye glasses, stretch, relax, and be like water 🥋 🧘🏽‍♀️\n`);
      this.emitOutput(`*  \n`);
      this.emitOutput(`****************************************************************************\n\n`);
      
      const startTime = Date.now();
      let fullResponse = "";
      let thinkingContent = "";
      
      // Create system prompt - more explicit guidance
      const systemPrompt = "You are a meticulous proofreader. Be thorough and careful. DO NOT use any Markdown formatting - no headers, bullets, numbering, asterisks, hyphens, or any formatting symbols. Plain text only. You must find and report ALL errors, even small ones.";

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
      
      this.emitOutput(`\nCompleted in: ⏰ ${minutes}m ${seconds.toFixed(2)}s.\n`);
      
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
        saveDir,
        language
      );
      
      // Add the output files to the result
      outputFiles.push(...outputFile);
      
      // Add files to the cache
      outputFiles.forEach(file => {
        fileCache.addFile(toolName, file);
      });
      
      // Return the result
      return {
        success: true,
        outputFiles
      };
    } catch (error) {
      console.error('Error in Proofreader Plot Consistency:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create prompt
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} language - Language for proofreading (default: English)
   * @returns {string} - Prompt for Claude API
   */
  createPrompt(manuscriptContent, language = 'English') {
    // Specialized prompt focused ONLY on plot consistency issues
    const template = `You are a professional ${language} plot consistency proofreader focused on analyzing this manuscript:

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

CORE INSTRUCTION: Conduct a specialized review focusing EXCLUSIVELY on plot consistency issues. Thoroughly analyze story elements, important objects, character knowledge, fictional world rules, and narrative causality to identify contradictions, plot holes, or inconsistencies in how the story unfolds.

FOCUS ONLY ON:
- Fictional world rule contradictions (how magic, technology, or special abilities work)
- Plot causality issues (events happening without logical setup or connection)
- Knowledge inconsistencies (characters knowing things they shouldn't yet know or forgetting what they should know)
- Important object inconsistencies (items appearing, disappearing, or changing without explanation)
- Motivation inconsistencies (characters acting contrary to established goals without development)
- Narrative promises unfulfilled (setup without payoff, introduced elements that vanish)
- Factual contradictions within the story's established reality
- Information revealed to readers that conflicts with previous information

EXPLICITLY IGNORE:
- Spelling, grammar, punctuation, and formatting errors
- Character consistency issues (unless directly affecting plot)
- Timeline and chronology inconsistencies (unless directly affecting plot)
- Setting and location consistency issues (unless directly affecting plot)
- Stylistic choices and thematic elements
- Any other issues not directly related to plot and world-building consistency

APPROACH:
1. Track the story's internal logic and rules as you read through the manuscript
2. Monitor:
   - Important objects and their status/location
   - Information revealed to different characters and when
   - Rules established for how the world functions
   - Cause-and-effect relationships between events
   - Setup elements that promise later payoff
3. Identify contradictions, logical gaps, or inconsistencies in these elements
4. Present specific instances where plot elements appear inconsistent

PLOT ELEMENT TRACKING FORMAT:
For each significant plot element, create an entry with:
- Description of the element (object, knowledge, rule, etc.)
- When and how it's established in the narrative
- How it's used or referenced throughout the story
- Any changes or developments to the element

ISSUE REPORTING FORMAT:
For each plot inconsistency found:
- Number sequentially (e.g., "Plot Inconsistency #1")
- Show BOTH relevant text passages VERBATIM without adding quotation marks
- Explain the specific inconsistency
- Suggest a possible resolution if appropriate

EXAMPLE:
Plot Inconsistency #1:
First passage: The ancient amulet could only be destroyed in the fires where it was forged, deep within Mount Doom. No other force in the world could break it.
Second passage: With a mighty swing of his sword, Aragorn shattered the amulet into a thousand pieces, releasing its dark power into the wind.
Issue: The rules established for the amulet are contradictory. Initially, it's stated that the amulet can only be destroyed in a specific location (Mount Doom) and that no other force can break it. Later, a character destroys it with a conventional weapon without explanation.
Possible resolution: Either modify the initial rule about the amulet's invulnerability, explain how Aragorn's sword has special properties that allow it to break the rule, or revise the destruction scene to align with the established rules.

FINAL REPORT:
Provide a summary of key plot elements and established world rules, followed by all identified plot inconsistencies.

VERIFICATION:
At the end, confirm you checked ONLY for plot consistency issues and ignored all other types of issues as instructed.`;
    return template;
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
   * @param {string} language - Language used for proofreading
   * @returns {Promise<string[]>} - Array of paths to saved files
   */
  async saveReport(
    content,
    thinking,
    promptTokens,
    responseTokens,
    saveDir,
    language = 'English'
  ) {
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
      const baseFilename = `proofreader_plot_consistency_${language.toLowerCase()}_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];
      
      // Create stats for thinking file
      const stats = `
Details:  ${dateTimeStr}
Language: ${language}
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
      this.emitOutput(`Report saved to: ${reportPath}\n`);

      // Save thinking content if available
      if (thinking) {
        const thinkingFilename = `${baseFilename}_thinking.txt`;
        const thinkingContent = `=== PROOFREADERPLOTCONSISTENCY THINKING ===

${thinking}

=== END PROOFREADERPLOTCONSISTENCY THINKING ===
${stats}`;
        
        const thinkingReportPath = path.join(saveDir, thinkingFilename);
        await this.writeOutputFile(thinkingContent, saveDir, thinkingFilename);
        savedFilePaths.push(thinkingReportPath);
        this.emitOutput(`AI thinking saved to: ${path.join(saveDir, thinkingFilename)}\n`);
      }
      
      return savedFilePaths;
    } catch (error) {
      console.error(`Error saving report:`, error);
      this.emitOutput(`Error saving report: ${error.message}\n`);
      throw error;
    }
  }
}

module.exports = ProofreaderPlotConsistency;
