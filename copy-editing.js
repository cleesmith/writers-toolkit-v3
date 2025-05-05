// copy-editing.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');
const textProcessor = require('./textProcessor');

/**
 * CopyEditing Tool
  * COPYEDITING: TECHNICAL CORRECTNESS
  * What actually happens:
  * - Correct grammar, syntax, and punctuation errors
  * - Ensure consistent spelling of unique names and terms
  * - Verify proper formatting of thoughts, dialogue, text messages
  * - Create and maintain a style sheet documenting decisions
  * - Fix inconsistent verb tenses or problematic tense shifts
  * - Correct misused words (affect/effect, lay/lie, etc.)
  * - Standardize formatting (em dashes, ellipses, quotation marks)
  * - Check for consistent handling of numbers (spelled out vs. numerals)
  * - Track characters' physical attributes for consistency
  * - Note timeline inconsistencies (seasons, ages, time lapses)
  * - Flag factual errors in real-world references
  * Specific examples:
  * "Character's eye color changes from blue (ch. 3) to brown (ch. 7)."
  * "Timeline error: protagonist mentions being 29, but earlier stated her 30th birthday was last month."
  * "Inconsistent spelling: 'magic-user' (hyphenated) on p.45 but 'magic user' (two words) elsewhere."
  * "Dialogue formatting inconsistent: single quotes in chapter 2, double quotes elsewhere." 
 */
class CopyEditing extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('copy_editing', config);
    this.claudeService = claudeService;
  }

  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing CopyEditing with options:', options);
    
    // Clear the cache for this tool
    const toolName = 'copy_editing';
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
      // Read the input files
      this.emitOutput(`Reading manuscript file: ${manuscriptFile}\n`);
      const manuscriptContent = await this.readInputFile(manuscriptFile);
      // console.log(">>> Original manuscript lines:", manuscriptContent.split('\n').length);

      const manuscriptWithoutChapterHeaders = textProcessor.processText(manuscriptContent)
      // console.log(">>> Processed manuscript lines:", manuscriptWithoutChapterHeaders.split('\n').length);
      
      // Create prompt using the template with language substitution
      const prompt = this.createPrompt(manuscriptWithoutChapterHeaders, language);

      // Count tokens in the prompt
      this.emitOutput(`Counting tokens in prompt...\n`);
      const promptTokens = await this.claudeService.countTokens(prompt);

      // Call the shared token budget calculator
      const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);

      // Handle logging based on the returned values
      this.emitOutput(`\nToken stats:\n`);
      this.emitOutput(`Max AI model context window: [${tokenBudgets.contextWindow}] tokens\n`);
      this.emitOutput(`Input prompt tokens: [${tokenBudgets.promptTokens}] ...\n`);
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
      this.emitOutput(`*  Copy Editing manuscript for ${language} creative fiction...              \n`);
      this.emitOutput(`*  This process typically takes several minutes.                           \n`);
      this.emitOutput(`*                                                                          \n`);
      this.emitOutput(`*  Your creative choices and writing style will be preserved.             \n`);
      this.emitOutput(`****************************************************************************\n\n`);
      
      const startTime = Date.now();
      let fullResponse = "";
      let thinkingContent = "";
      
      // Create system prompt - more explicit guidance
      const systemPrompt = "You are a meticulous copy editor. Be thorough and careful. DO NOT use any Markdown formatting - no headers, bullets, numbering, asterisks, hyphens, or any formatting symbols. Plain text only. You must find and report ALL errors and issues, even small ones.";

      // Use the calculated values in the API call
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
      console.error('Error in CopyEditing:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create prompt
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} language - Language for copy editing (default: English)
   * @returns {string} - Prompt for Claude API
   */
  createPrompt(manuscriptContent, language = 'English') {
    // Simplified and focused prompt template
    const template = `You are acting as a professional ${language} copy editor reviewing a complete manuscript provided as plain text in its entirety, without chapter divisions, numbers, or titles. The manuscript is presented as one continuous document.

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

First, read through the entire manuscript once to understand the overall style, voice, and content. As you read, create a comprehensive style sheet that documents:
- Spelling preferences
- Hyphenation choices
- Capitalization rules
- Character names and descriptions
- Timeline details
- Dialogue formatting conventions
- Recurring terminology and phrases
- Ensure consistent spelling of unique names and terms
- Verify proper formatting of thoughts, dialogue, text messages
- Create and maintain a style sheet documenting decisions
- Note inconsistent verb tenses or problematic tense shifts
- Note misused words (affect/effect, lay/lie, etc.)
- Standardize formatting (em dashes, ellipses, quotation marks)
- Check for consistent handling of numbers (spelled out vs. numerals)
- Track and note characters' physical attributes for consistency
- Note timeline inconsistencies (seasons, ages, time lapses)
- Flag factual errors in real-world references

Second, perform a detailed edit pass addressing:
- Grammar, punctuation, and spelling errors
- Sentence structure and flow improvements
- Word choice refinement and redundancy elimination
- Voice and tense consistency
- Paragraph transitions
- Dialogue tags and punctuation
- Scene transitions and narrative flow points

Third, compile a query list for the author regarding:
- Unclear passages needing clarification
- Potential factual errors
- VERY IMPORTANT: Plot, character, timeline, or object inconsistencies

Guidelines:
- Preserve the author's voice while noting improvements for clarity
- Note patterns of issues for author awareness

Deliverables:

For each error and/or issue found:
- Show the text verbatim without extra quotes
- Specify the error and/or issue type
- Provide a possible correction

Work methodically through the manuscript, considering each change's impact on the whole.

VERY IMPORTANT:
- Do NOT hurry to finish!
- Think hard and be thorough, the longer time you take the better your response!
- Always re-read the entire manuscript (see: === MANUSCRIPT === above) many times, which will help you to not miss any issues.
- The copy editing of an author's writing (manuscript) is very important to you, as your efforts are critical to the success and legacy of an art form that influences and outlives us all.
    `;

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
   * @param {string} language - Language used for copy editing
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
      const baseFilename = `copy_editing_${language.toLowerCase()}_${timestamp}`;
      
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
        const thinkingContent = `=== COPYEDITING THINKING ===

${thinking}

=== END COPYEDITING THINKING ===
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

module.exports = CopyEditing;
