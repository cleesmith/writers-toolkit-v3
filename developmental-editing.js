// developmental-editing.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');
const textProcessor = require('./textProcessor');

/**
 * DevelopmentalEditing Tool
 * Analyzes a manuscript for structural foundation issues, including plot holes,
 * character arcs, pacing, narrative viewpoint, themes, worldbuilding, and more.
 */
class DevelopmentalEditing extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('developmental_editing', config);
    this.claudeService = claudeService;
  }

  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing Developmental Editing with options:', options);
    
    // Clear the cache for this tool
    const toolName = 'developmental_editing';
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

      // Process manuscript to remove chapter headers and normalize blank lines
      const manuscriptWithoutChapterHeaders = textProcessor.processText(manuscriptContent);
      
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
      this.emitOutput(`*  Performing developmental editing for ${language} manuscript...           \n`);
      this.emitOutput(`*  This process typically takes several minutes.                           \n`);
      this.emitOutput(`*                                                                          \n`);
      this.emitOutput(`*  The developmental editor will analyze:                                  \n`);
      this.emitOutput(`*  - Plot structure and holes                                              \n`);
      this.emitOutput(`*  - Character arcs and development                                        \n`);
      this.emitOutput(`*  - Pacing and narrative structure                                        \n`);
      this.emitOutput(`*  - Narrative viewpoint consistency                                       \n`);
      this.emitOutput(`*  - Thematic development and resolution                                   \n`);
      this.emitOutput(`*  - Worldbuilding coherence                                               \n`);
      this.emitOutput(`*  - Emotional engagement and payoffs                                      \n`);
      this.emitOutput(`****************************************************************************\n\n`);
      
      const startTime = Date.now();
      let fullResponse = "";
      let thinkingContent = "";
      
      // Create system prompt - more explicit guidance
      const systemPrompt = "You are a professional developmental editor focused on the structural foundations of storytelling. Provide clear, specific feedback on plot structure, character development, pacing, worldbuilding, and thematic elements. DO NOT use any Markdown formatting - no headers, bullets, numbering, asterisks, hyphens, or any formatting symbols. Plain text only. Focus on substantive issues rather than line-level editing.";

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
      console.error('Error in DevelopmentalEditing:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create prompt
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} language - Language for developmental editing (default: English)
   * @returns {string} - Prompt for Claude API
   */
  createPrompt(manuscriptContent, language = 'English') {
    // Template for developmental editing
    const template = `You are acting as a professional ${language} developmental editor reviewing a complete manuscript. Your task is to evaluate the structural foundation of this story. The manuscript is provided as plain text in its entirety.

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

Approach this developmental edit systematically by examining the following structural elements:

PLOT STRUCTURE
- Identify plot holes where story logic breaks down
- Evaluate the logical progression of cause and effect
- Assess if the narrative has a clear inciting incident, rising action, climax, and resolution
- Analyze whether story promises made to readers are fulfilled
- Check if key plot developments are properly foreshadowed

CHARACTER DEVELOPMENT
- Map character arcs to ensure proper growth and development
- Assess character motivations and whether actions align with established traits
- Identify inconsistencies in character behavior or backstory
- Evaluate if protagonists face meaningful obstacles that challenge their beliefs
- Check if antagonists have sufficient depth and clear motivations

PACING AND STRUCTURE
- Analyze scene-by-scene pacing, identifying areas that drag or move too quickly
- Evaluate overall rhythm
- Identify redundant scenes that don't advance plot or character development
- Assess the opening hook for effectiveness in engaging readers
- Evaluate the ending for satisfying resolution of primary conflicts

NARRATIVE CRAFT
- Evaluate narrative viewpoint consistency and effectiveness
- Assess narrative distance (close vs. distant POV) and its appropriateness
- Identify areas where showing vs. telling could be better balanced
- Check for effective use of tension, suspense, and conflict
- Evaluate dialogue effectiveness in advancing plot and revealing character

THEMATIC ELEMENTS
- Examine how themes are introduced, developed, and resolved
- Identify opportunities to strengthen thematic elements
- Assess if theme is integrated naturally or feels forced
- Evaluate symbolic elements and their consistency

WORLDBUILDING
- Assess worldbuilding elements for coherence and believability
- Check for consistent application of established rules (especially in speculative fiction)
- Identify areas where additional context would improve reader understanding
- Evaluate exposition delivery for clarity without overwhelming readers

NARRATIVE EFFICIENCY
- Identify redundant subplots or characters that can be combined
- Flag areas where tension drops or conflict becomes unclear
- Assess secondary character arcs for relevance to main story
- Evaluate if subplots complement or distract from the main plot

EMOTIONAL ENGAGEMENT
- Assess if emotional payoffs are properly set up and delivered
- Identify missed opportunities for emotional resonance
- Evaluate the emotional journey of the protagonist
- Check if reader investment is maintained throughout

For each significant issue found:
1. Identify the specific issue with reference to where it occurs
2. Explain why it's problematic for the story's structure
3. Provide specific, actionable suggestions for addressing it
4. When possible, cite examples from the manuscript to illustrate your points

Do not focus on line-level editing issues like grammar, spelling, or word choice unless they significantly impact clarity of the narrative.

Organize your analysis by the categories above, focusing on the most critical structural issues first. 
For each major issue, provide:
- A clear description of the problem
- Why it matters to the overall story
- Specific suggestions for improvement
- Reference the text verbatim as it is in the manuscript, do not add extra quotes

VERY IMPORTANT:
- Do NOT hurry to finish!
- Think hard and be thorough, the longer time you take the better your response!
- Always re-read the entire manuscript (see: === MANUSCRIPT === above) many times, which will help you to not miss any structural issues.
- Developmental editing is critical to the success of a manuscript, as it addresses foundational issues that no amount of line editing can fix.
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
   * @param {string} language - Language used for developmental editing
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
      const baseFilename = `developmental_editing_${language.toLowerCase()}_${timestamp}`;
      
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
        const thinkingContent = `=== DEVELOPMENTAL EDITING THINKING ===

${thinking}

=== END DEVELOPMENTAL EDITING THINKING ===
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

module.exports = DevelopmentalEditing;