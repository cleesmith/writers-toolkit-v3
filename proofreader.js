// proofreader.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

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

      console.log(this.extractChapterList(manuscriptContent));

      // Create prompt using the template with language substitution and chapter number
      const prompt = this.createPrompt(manuscriptContent, language);

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
      this.emitOutput(`*  Proofreading manuscript for ${language} creative fiction...              \n`);
      this.emitOutput(`*  This process typically takes several minutes.                           \n`);
      this.emitOutput(`*                                                                          \n`);
      this.emitOutput(`*  The proofreader will check for:                                        \n`);
      this.emitOutput(`*  - Typos and spelling errors                                            \n`);
      this.emitOutput(`*  - Formatting inconsistencies                                           \n`);
      this.emitOutput(`*  - Punctuation errors                                                   \n`);
      this.emitOutput(`*  - Dialogue formatting issues                                           \n`);
      this.emitOutput(`*                                                                          \n`);
      this.emitOutput(`*  Your creative choices and writing style will be preserved.             \n`);
      this.emitOutput(`****************************************************************************\n\n`);
      
      const startTime = Date.now();
      let fullResponse = "";
      let thinkingContent = "";
      
      // Create system prompt
      const systemPrompt = "NO Markdown formatting! Never use headers, bullets, numbering, asterisks, hyphens, or any formatting symbols. Plain text only.";

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
  createPrompt(manuscriptContent, language = 'English') {
    // Read the prompt template from the file and replace placeholders
    const template = `You are a professional proofreader specializing in ${language} creative fiction. You must carefully and systematically proofread this manuscript chapter by chapter to avoid errors and hallucinations, and some proofreading issues will involve comparing and reading all of the other chapters in the manuscript.

CRITICAL INSTRUCTIONS:
1. First, identify ALL chapters in the manuscript (look for "Chapter" markers)
2. Process each chapter INDIVIDUALLY and IN ORDER, after thoroughly reading the manuscript as some proofreading issues span multiple chapters to be noticed
3. ONLY report actual errors found in the text - DO NOT make up or hallucinate issues
4. Check each error against the actual manuscript text before reporting it

MANUSCRIPT TYPE: ${language} Creative Fiction

PROOFREADING PROCESS:

Step 1: Chapter Identification
- Scan the manuscript to identify all chapters
- Make a mental list of chapters in order, for later output

Step 2: Chapter-by-Chapter Processing
For each chapter:
- Look for actual errors in the text
- Double-check each error exists in the manuscript
- Report using the exact format below
- Complete the chapter before moving to the next
- Look for inconsistencies with previous chapters

PROOFREADING GUIDELINES FOR FICTION:

IMPORTANT:
Take your time and "think hard" as you thoroughly read and re-read the manuscript text, see: === MANUSCRIPT ===

1. Focus Areas:
   - Catching typos and spelling errors (using standard ${language} conventions)
   - Identifying formatting inconsistencies in dialogue, internal thoughts, and narrative
   - Fixing punctuation errors, especially in dialogue tags and quotations
   - Catching missing words or duplicated words
   - Ensuring consistent use of quotation marks per ${language} conventions
   - Checking spacing issues around punctuation marks
   - Identifying inconsistencies in character names or place names

2. Fiction-Specific Checks:
   - Dialogue punctuation (proper formatting for the ${language})
   - Consistent formatting of thoughts (italics vs. quotes)
   - Paragraph breaks in dialogue
   - Scene break formatting consistency
   - Consistent use of formal/informal speech patterns

3. What NOT to do:
   - Do not add double quotes around the original text from the manuscript; use the text as it is
   - Do not rewrite for style, pacing, or dramatic effect
   - Do not suggest plot or character changes
   - Do not alter the author's voice or narrative style
   - Do not change creative spelling in dialogue meant to show accent/dialect
   - Do not standardize intentional fragments or stylistic choices
   - Do not correct "errors" that might be intentional character voice
   - DO NOT make up errors that don't exist in the text

4. Output Format:
   1. List all chapters found, each on a separate line, like: Chapter 1: the first one ... in order to verify you are seeing the chapters correctly
   2. Then for each issue found, provide:
       1. Chapter number and caption/title
       2. The original text (exactly as it appears - verbatim)
       3. One newline
       3. ISSUE:
       The description of what's wrong with this text
       4. Two newlines for separation

   Example format:
   Chapter 3: The Beginning
   "Hello." She said quietly.
   ISSUE:
   Incorrect dialogue punctuation. Should be "Hello," with comma instead of period before dialogue tag.

   Repeat this format for every issue found.

5. Final Report:
   After processing all chapters, provide:
   - A summary of error patterns
   - Note any recurring issues that might need a global fix

IMPORTANT: Process chapters in numerical order, focus on one chapter at a time, and ensure all reported errors actually exist in the manuscript text. Do not skip ahead or mix chapters.

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

Please proofread the creative fiction manuscript above following these guidelines. Start by identifying all chapters, then process each one systematically. Present your findings in a clear, organized manner, beginning with Chapter 1 and proceeding in order. Remember to respect the author's creative choices and only report genuine errors.`;

    return template;
  }

  /**
   * Extract chapters from manuscript content following the format "Chapter #: title"
   * @param {string} manuscriptContent - The full manuscript text
   * @returns {Array<Object>} - Array of chapter objects with number and title
   */
  extractChapterList(manuscriptContent) {
    const chapters = [];
    const lines = manuscriptContent.split('\n');
    
    // Look for "Chapter #: title" format (with colon, not period)
    const chapterRegex = /^Chapter\s+(\d+):\s*(.*)$/i;
    
    lines.forEach((line, index) => {
      const match = chapterRegex.exec(line.trim());
      
      if (match) {
        // chapters.push({
        //   number: parseInt(match[1], 10),
        //   title: match[2].trim() || '',
        //   lineNumber: index + 1
        // });
        chapters.push({
          parseInt(match[1], 10),
          ': ',
          title: match[2].trim() || ''
        });
      }
    });
    
    return chapters;
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
      
      // Create descriptive filename with chapter number
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
        
        await this.writeOutputFile(thinkingContent, saveDir, thinkingFilename);
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
