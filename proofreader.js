// proofreader.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');
const textProcessor = require('./textProcessor');

/**
 * Proofreader Tool
 * Analyzes a manuscript for surface-level corrections without altering the author's creative choices.
 * Focuses on typos, formatting inconsistencies, and punctuation errors.
 */
class Proofreader extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('proofreader', config);
    this.claudeService = claudeService;
  }

  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing Proofreader with options:', options);
    
    // Clear the cache for this tool
    const toolName = 'proofreader';
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
      this.emitOutput(`\nSending request to Claude API . . .\n`);
      
      // Add a message about waiting
      this.emitOutput(`\n****************************************************************************\n`);
      this.emitOutput(`*  Proofreading manuscript for ${language} creative fiction...\n`);
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
      console.error('Error in Proofreader:', error);
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
//   createPrompt(manuscriptContent, language = 'English') {
//     // Simplified and focused prompt template
//     const template = `You are acting as a professional ${language} proofreader performing a final review of a manuscript that has already been copy edited. The manuscript is provided as plain text in its entirety, without chapter divisions, numbers, or titles - presented as one continuous document and story. 

// === MANUSCRIPT ===
// ${manuscriptContent}
// === END MANUSCRIPT ===

// Begin by reviewing any existing style sheet from copy editing. Then work through the manuscript in sequential passes:

// Pass 1 - Mechanical Accuracy:
// - Spelling errors and typos
// - Punctuation consistency
// - Capitalization rules
// - Number formatting
// - Proper noun consistency

// Pass 2 - Formatting Consistency:
// - Paragraph spacing is a single blank line
// - Dialogue formatting
// - Special characters (quotes, dashes, ellipses)
// - White space patterns

// Pass 3 - Content Verification:
// - Character name consistency
// - Timeline accuracy
// - Repeated words or phrases
// - Missing or duplicated text
// - Narrative continuity across scenes

// Pass 4 - Final Sweep:
// - Any remaining inconsistencies
// - Cross-reference with style sheet

// For each error and/or issue found:
// - Show the text verbatim
// - Specify the error and/or issue type
// - Provide a possible correction

// Remember: Only flag actual errors. Make no content suggestions or style changes. Focus exclusively on mechanical accuracy and consistency with established style choices.

// Complete each pass thoroughly before moving to the next. Maintain focus on catching errors that escaped copy editing.

// VERY IMPORTANT:
// - Do NOT hurry to finish!
// - Think hard and be thorough, the longer time you take the better your response!
// - Always re-read the entire manuscript (see: === MANUSCRIPT === above) many times, which will help you to not miss any issues.
// - The proofreading of author's writing (manuscript) is very important to you, as your efforts are critical to the success and legacy of an art form that influences and outlives us all.
//     `;

//     return template;
//   }
  createPrompt(manuscriptContent, language = 'English') {
    // Enhanced prompt template with extended output capabilities
    const template = `You are acting as a professional ${language} proofreader performing a final review of a manuscript that has already been copy edited. The manuscript is provided as plain text in its entirety, without chapter divisions, numbers, or titles - presented as one continuous document and story.

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

INSTRUCTION: I need you to conduct an EXHAUSTIVE proofreading of this novel manuscript. Your goal is to find ALL mechanical errors, formatting issues, and inconsistencies without exception. Previous proofreading attempts have missed errors that were only caught in later reviews - this comprehensive approach aims to identify all issues in a single pass.

THOROUGHNESS FRAMEWORK:
To ensure complete and consistent coverage of the entire manuscript:

1. Mentally divide the manuscript into three equal sections (beginning, middle, and end) and maintain equal scrutiny for each section.

2. After identifying each error, continue examining the manuscript with the same level of attention rather than concluding prematurely.

3. For each proofreading pass, explicitly confirm when you've reached the end of the manuscript before moving to the next pass.

4. Maintain consistent attention from the first word to the last word - later sections deserve the same careful examination as earlier ones.

SYSTEMATIC MULTI-PASS REVIEW:
Work through the manuscript in these sequential passes, completing each pass fully before beginning the next:

Pass 1 - Mechanical Accuracy:
- Spelling errors and typos
- Punctuation consistency and correctness
- Capitalization rules and application
- Number formatting
- Proper noun consistency

Pass 2 - Formatting Consistency:
- Paragraph spacing (single blank line standard)
- Dialogue formatting
- Special characters (quotes, dashes, ellipses)
- White space patterns
- Text alignment issues

Pass 3 - Content Verification:
- Character name consistency throughout
- Timeline accuracy and continuity
- Repeated words or phrases
- Missing or duplicated text
- Narrative continuity across scenes

Pass 4 - Final Sweep:
- Any remaining inconsistencies
- Cross-reference with established style patterns
- Issues that might span across multiple categories
- Any patterns of errors that suggest systematic issues

DOCUMENTATION REQUIREMENTS:
For each error and/or issue found:

1. Number all identified issues sequentially within each pass (e.g., "Mechanical Error #1")

2. Show the text containing the error verbatim (usually the full sentence)

3. Specify the error and/or issue type

4. Provide a possible correction

VERIFICATION PROCESS:
After completing all passes, perform these verification steps:

1. Confirm you've examined the ENTIRE manuscript for all error types with explicit statements

2. Provide error counts by category and manuscript section to verify consistent attention throughout

3. Check for any patterns of errors that might indicate systematic issues

4. Include a final verification statement confirming thorough examination of the complete manuscript

CRITICAL INSTRUCTIONS:
- Remember: Only flag actual errors. Make no content suggestions or style changes. Focus exclusively on mechanical accuracy and consistency with established style choices.

- Do NOT hurry to finish! Your proofreading report should be comprehensive and thorough. Do not limit yourself based on response length concerns.

- For a novel manuscript, a thorough proofreading may include dozens or even hundreds of potential issues across all categories. Prioritize completeness over brevity.

- Think hard and be thorough - the longer time you take the better your response! 

- Always re-read the entire manuscript many times, which will help you not miss any issues.

- The proofreading of the author's writing is very important, as your efforts are critical to the success and legacy of an art form that influences and outlives us all.

OUTPUT EXPECTATIONS:
I expect a complete accounting of ALL issues found throughout the entire manuscript. For your proofreading report to be truly useful to the writer, each error entry MUST include:

1. The COMPLETE original sentence or text segment containing the error, shown VERBATIM with no alterations - this is critical as writers cannot fix what they cannot find

2. Clear identification of the SPECIFIC issue within that text - precisely what is wrong and why it's considered an error

3. A suggested correction that shows exactly how to fix the issue

Your complete report should be structured as follows:

1. A structured report organized by pass type (Mechanical, Formatting, Content, Final)

2. Each error entry containing:
   - Sequential number (e.g., "Mechanical Error #1")
   - The complete original sentence/text verbatim
   - Specific identification of the error
   - Suggested correction

3. Error counts by category and manuscript section

4. Verification statements confirming complete coverage

5. A comprehensive analysis that maintains equal scrutiny from the first word to the last

EXAMPLE FORMAT FOR REPORTING ERRORS:

Mechanical Error #1:
Original text: When John entered the room, he saw three seperate books on the table and wondered who they belonged too.
Issue: The word "seperate" is misspelled and "too" is incorrectly used instead of "to."
Correction: When John entered the room, he saw three separate books on the table and wondered who they belonged to.

CRITICAL: DO NOT place quotation marks around the original text when reporting errors. Show the text exactly as it appears in the manuscript without adding any additional punctuation. This is essential because:
1. Added quotes interfere with dialogue lines that may already contain quotation marks
2. Added quotes make it harder for writers to find the exact text in their manuscript 
3. The goal is to show the text precisely as it appears in the original
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
      const baseFilename = `proofreading_${language.toLowerCase()}_${timestamp}`;
      
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
        const thinkingContent = `=== PROOFREADER THINKING ===

${thinking}

=== END PROOFREADER THINKING ===
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

module.exports = Proofreader;
