// tense-consistency-checker.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * Tense Consistency Checker Tool
 * Analyzes a single manuscript file for verb tense consistency issues using the Claude API.
 * Identifies shifts between past/present tense that might confuse readers.
 * Unlike character tools, this only analyzes the manuscript itself, not outline/world files.
 */
class TenseConsistencyChecker extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('tense_consistency_checker', config);
    this.claudeService = claudeService;
  }
  
  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing Tense Consistency Checker with options:', options);
    
    // Extract options
    let manuscriptFile = options.manuscript_file;
    const analysisLevel = options.analysis_level || 'standard';
    const chapterMarkers = options.chapter_markers || 'Chapter';
    const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }

    // Ensure file paths are absolute
    manuscriptFile = this.ensureAbsolutePath(manuscriptFile, saveDir);
    
    // Log the full paths for debugging
    console.log('Using full paths:');
    console.log(`Manuscript: ${manuscriptFile}`);

    const outputFiles = [];
    
    try {
      // Read the input files
      this.emitOutput(`Reading files...\n`);

      // Read the manuscript file
      this.emitOutput(`Reading manuscript file: ${manuscriptFile}\n`);
      const manuscriptContent = await this.readInputFile(manuscriptFile);
      const manuscriptWordCount = this.countWords(manuscriptContent);
      const manuscriptTokens = await this.claudeService.countTokens(manuscriptContent);
      
      const prompt = this.createTenseAnalysisPrompt(manuscriptContent, analysisLevel, chapterMarkers);

      const promptTokens = await this.claudeService.countTokens(prompt);

      // Call the shared token budget calculator
      const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);

      // Handle logging based on the returned values
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
      this.emitOutput(`Sending request to Claude API (streaming)...\n`);

      // Add a message about waiting
      this.emitOutput(`****************************************************************************\n`);
      this.emitOutput(`*  Analyzing tense consistency in your manuscript...                        \n`);
      this.emitOutput(`*  \n`);
      this.emitOutput(`*  This process typically takes several minutes.                           \n`);
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
      
      // Create system prompt to avoid markdown
      const systemPrompt = "CRITICAL INSTRUCTION: NO Markdown formatting of ANY kind. Never use headers, bullets, or any formatting symbols. Plain text only with standard punctuation.";

      // Use the calculated values in the API call
      try {
        // await this.claudeService.streamWithThinking(
        //   prompt,
        //   {
        //     model: "claude-3-7-sonnet-20250219",
        //     system: systemPrompt,
        //     max_tokens: tokenBudgets.maxTokens,
        //     thinking: {
        //       type: "enabled",
        //       budget_tokens: tokenBudgets.thinkingBudget
        //     },
        //     betas: ["output-128k-2025-02-19"]
        //   },
        //   // Callback for thinking content
        //   (thinkingDelta) => {
        //     thinkingContent += thinkingDelta;
        //   },
        //   // Callback for response text
        //   (textDelta) => {
        //     fullResponse += textDelta;
        //   }
        // );
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
        analysisLevel,
        fullResponse,
        thinkingContent,
        promptTokens,
        responseTokens,
        saveDir
      );
      
      // Add all output files to the result
      outputFiles.push(...outputFile);
      
      // Add files to the cache
      const toolName = 'tense_consistency_checker';
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
          elapsedTime: `${minutes}m ${seconds.toFixed(2)}s`,
          analysisLevel
        }
      };
    } catch (error) {
      console.error('Error in Tense Consistency Checker:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create tense analysis prompt
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} analysisLevel - Analysis level (basic, standard, detailed)
   * @param {string} chapterMarkers - Text that marks the start of chapters
   * @returns {string} - Prompt for Claude API
   */
  createTenseAnalysisPrompt(manuscriptContent, analysisLevel = "standard", chapterMarkers = "Chapter") {
    // Build instruction section based on analysis level
    const basicInstructions = `
1. NARRATIVE TENSE OVERVIEW:
   - Identify the main tense used in the manuscript (past or present)
   - List any notable sections that use a different tense
   - Provide examples of the dominant tense usage

2. TENSE CONSISTENCY ISSUES:
   - Identify passages where tense shifts unexpectedly 
   - Highlight sentences that mix past and present tense inappropriately
   - Provide specific examples with page/paragraph references where possible

3. RECOMMENDATIONS:
   - Suggest how to fix inconsistent tense usage
   - Explain which tense might work better for specific problematic passages
`;

    const standardInstructions = basicInstructions + `
4. INTENTIONAL VS. UNINTENTIONAL SHIFTS:
   - Differentiate between potentially deliberate tense shifts (for flashbacks, etc.) and likely errors
   - Analyze if tense shifts are marked properly with transitions or context clues
   - Evaluate if any intentional shifts are effective or potentially confusing

5. TENSE PATTERNS:
   - Note any patterns in tense usage (e.g., present tense for action, past for reflection)
   - Identify if dialogue attribution follows consistent tense conventions
`;

    const detailedInstructions = standardInstructions + `
6. CHARACTER PERSPECTIVE ANALYSIS:
   - For each POV character, analyze if their sections maintain consistent tense
   - Note if different viewpoint characters use different tenses
   - Identify any tense shift patterns related to character perspective changes

7. STRUCTURAL TENSE ANALYSIS:
   - Analyze tense usage patterns across chapters/scenes
   - Identify if chapter/section breaks coincide with tense shifts
   - Consider if tense shifts serve structural or pacing purposes

8. ADVANCED TENSE USAGE:
   - Analyze more complex tense forms (past perfect, future perfect, etc.)
   - Evaluate consistency in handling of flashbacks, flash-forwards, and memories
   - Consider if complex tense constructions are used effectively
`;

    // Choose the appropriate instruction level
    let instructionSet;
    if (analysisLevel === "basic") {
      instructionSet = basicInstructions;
    } else if (analysisLevel === "detailed") {
      instructionSet = detailedInstructions;
    } else {  // standard
      instructionSet = standardInstructions;
    }

    // Construct the full prompt
    const instructions = `IMPORTANT: NO Markdown formatting

You are an expert literary editor specializing in narrative tense analysis. Your task is to analyze the provided manuscript for verb tense consistency and identify any problematic tense shifts.

Focus specifically on what Ursula K. Le Guin calls "two-timing" - when authors shift between past and present tense without clear purpose, potentially confusing readers. Identify places where tense shifts inappropriately, and distinguish between intentional, effective tense changes and problematic inconsistencies.

Pay special attention to chapter/section breaks marked with "${chapterMarkers}" as potential locations for intentional tense shifts.

Create a comprehensive tense analysis with these sections:
${instructionSet}

Format your analysis as a clear, organized report with sections and subsections. Use plain text formatting only (NO Markdown). Use numbered or bulleted lists where appropriate for clarity.

Be specific in your examples, quoting brief passages that demonstrate tense issues and suggesting corrections. When appropriate, provide line numbers or context to help the author locate issues in their manuscript.
`;

    // Combine all sections
    return `=== MANUSCRIPT ===\n${manuscriptContent}\n=== END MANUSCRIPT ===\n\n${instructions}`;
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
   * @param {string} analysisLevel - Analysis level (basic, standard, detailed)
   * @param {string} content - Response content
   * @param {string} thinking - Thinking content
   * @param {number} promptTokens - Prompt token count
   * @param {number} responseTokens - Response token count
   * @param {string} saveDir - Directory to save to
   * @returns {Promise<string[]>} - Array of paths to saved files
   */
  async saveReport(analysisLevel, content, thinking, promptTokens, responseTokens, saveDir) {
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
      const level = analysisLevel !== 'standard' ? `_${analysisLevel}` : '';
      const baseFilename = `tense_analysis${level}_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];
      
      // Create stats for thinking file
      const stats = `
Details:  ${dateTimeStr}
Analysis type: Tense consistency analysis
Analysis level: ${analysisLevel}
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
        const thinkingContent = `=== TENSE CONSISTENCY ANALYSIS ===

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

module.exports = TenseConsistencyChecker;