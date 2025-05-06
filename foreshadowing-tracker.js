// foreshadowing-tracker.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * ForeshadowingTracker Tool
 * Analyzes manuscript for foreshadowing elements, planted clues, and their payoffs using the Claude API.
 * Tracks setup and resolution of story elements, ensuring narrative promises are fulfilled.
 */
class ForeshadowingTracker extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('foreshadowing_tracker', config);
    this.claudeService = claudeService;
  }

  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing Foreshadowing Tracker with options:', options);
    
    // Extract options
    let manuscriptFile = options.manuscript_file;
    let outlineFile = options.outline_file;
    const foreshadowingType = options.foreshadowing_type;
    const chronological = options.chronological;
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
    
    // Log the full paths for debugging
    console.log('Using full paths:');
    console.log(`Manuscript: ${manuscriptFile}`);
    if (outlineFile) {
      console.log(`Outline: ${outlineFile}`);
    }

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
      
      // If foreshadowingType is 'all', run all types
      if (foreshadowingType === 'all') {
        const types = ['explicit', 'implicit', 'chekhov'];
        for (const type of types) {
          const result = await this.runAnalysis(
            type,
            outlineContent,
            manuscriptContent,
            chronological,
            saveDir
          );
          outputFiles.push(...result.outputFiles);
        }
      } else {
        // Run a single analysis type
        const result = await this.runAnalysis(
          foreshadowingType,
          outlineContent,
          manuscriptContent,
          chronological,
          saveDir
        );
        outputFiles.push(...result.outputFiles);
      }
      
      // Add files to the cache
      const toolName = 'foreshadowing_tracker';
      outputFiles.forEach(file => {
        fileCache.addFile(toolName, file);
      });
      
      // Return the result
      return {
        success: true,
        outputFiles
      };
    } catch (error) {
      console.error('Error in ForeshadowingTracker:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }

  /**
   * Run a single foreshadowing analysis
   * @param {string} foreshadowingType - Type of foreshadowing to analyze
   * @param {string} outlineContent - Outline content
   * @param {string} manuscriptContent - Manuscript content
   * @param {boolean} chronological - Whether to organize chronologically
   * @param {string} saveDir - Directory to save to
   * @returns {Promise<Object>} - Analysis result
   */
  async runAnalysis(
    foreshadowingType,
    outlineContent,
    manuscriptContent,
    chronological,
    saveDir
  ) {
    this.emitOutput(`\n=== Running ${foreshadowingType.toUpperCase()} Foreshadowing Analysis ===\n`);
    
    // Create the prompt
    const prompt = this.createForeshadowingPrompt(
      foreshadowingType,
      outlineContent,
      manuscriptContent,
      chronological
    );

    // Count tokens in the prompt
    this.emitOutput(`Counting tokens in prompt...\n`);
    const promptTokens = await this.claudeService.countTokens(prompt);

    // Call the shared token budget calculator
    const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);

    // Handle logging based on the returned values
    this.emitOutput(`\nToken stats:\n`);
    this.emitOutput(`Max AI model context window: [${tokenBudgets.contextWindow}] tokens\n`);
    this.emitOutput(`Input prompt tokens: [${tokenBudgets.promptTokens}] ...\n`);
    this.emitOutput(`                     = outline + manuscript + prompt instructions\n`);
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
    this.emitOutput(`>>> Sending request to Claude API (streaming)...\n`);

    // Add a message about waiting
    this.emitOutput(`****************************************************************************\n`);
    this.emitOutput(`*  Analyzing foreshadowing elements in your manuscript...                  \n`);
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
      foreshadowingType,
      fullResponse,
      thinkingContent,
      promptTokens,
      responseTokens,
      saveDir,
      chronological
    );
    
    return {
      success: true,
      outputFiles: outputFile,
      stats: {
        wordCount,
        tokenCount: responseTokens,
        elapsedTime: `${minutes}m ${seconds.toFixed(2)}s`,
        foreshadowingType,
        chronological
      }
    };
  }

  /**
   * Create foreshadowing analysis prompt
   * @param {string} foreshadowingType - Type of foreshadowing to analyze
   * @param {string} outlineContent - Outline content
   * @param {string} manuscriptContent - Manuscript content
   * @param {boolean} chronological - Whether to organize chronologically
   * @returns {string} - Prompt for Claude API
   */
  createForeshadowingPrompt(foreshadowingType, outlineContent, manuscriptContent, chronological = false) {
    const noMarkdown = "IMPORTANT: - NO Markdown formatting";
      
    const orgInstruction = chronological 
      ? "Organize your analysis chronologically, following the manuscript's progression."
      : "Organize your analysis by foreshadowing type, grouping similar elements together.";
    
    const prompts = {
      "explicit": `=== OUTLINE ===
${outlineContent}
=== END OUTLINE ===

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor specializing in narrative structure and foreshadowing. Analyze the manuscript to identify EXPLICIT foreshadowing elements - direct hints, statements, or events that point to future developments.

Focus on identifying:

1. DIRECT FORESHADOWING:
   - Clear statements or hints that explicitly point to future events
   - Prophecies, predictions, or warnings made by characters
   - Narrative statements that directly hint at what's to come
   - Character statements that foreshadow future developments

2. SETUP AND PAYOFF TRACKING:
   - For each foreshadowing element, locate where it is set up (the hint/clue)
   - Identify where/if each setup is paid off later in the manuscript
   - Note any explicit foreshadowing that remains unresolved
   - Analyze the effectiveness of the setup-payoff connections

3. TIMING AND DISTANCE ASSESSMENT:
   - Evaluate the distance between setup and payoff (immediate, mid-range, long-range)
   - Assess if the timing between setup and payoff is appropriate
   - Note if foreshadowed events occur too quickly or are delayed too long

4. NARRATIVE IMPACT:
   - Analyze how the foreshadowing enhances tension and anticipation
   - Assess if the foreshadowing is too obvious or too subtle
   - Evaluate if the payoff satisfies the expectations created by the setup

${orgInstruction}

For each foreshadowing element, provide:
- The exact text and location where the foreshadowing occurs
- The exact text and location where the payoff occurs (if present)
- An assessment of the effectiveness of the setup-payoff connection
- Recommendations for improvement where relevant

For unresolved foreshadowing, note:
- The setup that lacks a payoff
- Where a payoff could naturally occur
- Specific suggestions for resolving the planted clue

Use the extensive thinking space to thoroughly catalog and cross-reference all foreshadowing elements before finalizing your analysis.`,

      "implicit": `=== OUTLINE ===
${outlineContent}
=== END OUTLINE ===

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor specializing in narrative structure and foreshadowing. Analyze the manuscript to identify IMPLICIT foreshadowing elements - subtle clues, symbolic imagery, and thematic elements that hint at future developments.

Focus on identifying:

1. SYMBOLIC FORESHADOWING:
   - Recurring symbols, motifs, or imagery that hint at future events
   - Visual descriptions that subtly indicate coming developments
   - Metaphors or similes that suggest future outcomes
   - Environmental details (weather, setting) that subtly presage events

2. DIALOGUE FORESHADOWING:
   - Casual remarks by characters that gain significance later
   - Seemingly unimportant information revealed in dialogue
   - Character observations that subtly hint at future revelations
   - Patterns in dialogue that create expectations

3. BACKGROUND DETAILS:
   - Seemingly minor world-building elements that become important
   - Casual mentions of places, objects, or people that later become significant
   - Incidental actions or habits that foreshadow character choices

4. PATTERN RECOGNITION:
   - Track recurring themes or ideas that create expectations
   - Identify narrative patterns that implicitly suggest outcomes
   - Note subtle character behaviors that foreshadow major decisions

${orgInstruction}

For each implicit foreshadowing element, provide:
- The exact text and location where the subtle clue appears
- The exact text and location of the corresponding payoff (if present)
- An analysis of how the subtle connection works (or doesn't)
- Recommendations for strengthening subtle connections where relevant

For potential missed opportunities, identify:
- Events that would benefit from earlier foreshadowing
- Suggestions for subtle clues that could be planted earlier
- Ways to enhance thematic coherence through implicit connections

Use the extensive thinking space to thoroughly catalog and cross-reference all implicit elements before finalizing your analysis.`,

      "chekhov": `=== OUTLINE ===
${outlineContent}
=== END OUTLINE ===

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor specializing in narrative structure and "Chekhov's Gun" analysis - the principle that significant elements introduced in a story must be used in a meaningful way. Analyze the manuscript to identify introduced elements that create expectations for later use.

Focus on identifying:

1. INTRODUCED BUT UNUSED ELEMENTS:
   - Significant objects that are prominently described but not used
   - Special abilities, skills, or knowledge mentioned but never employed
   - Locations described in detail but not utilized in the plot
   - Character traits or backgrounds emphasized but not made relevant

2. PROPERLY UTILIZED ELEMENTS:
   - Significant objects, places, or abilities that are introduced and later used
   - The setup of these elements and their subsequent payoff
   - How effectively the payoff fulfills the expectation created by the setup

3. SETUP-PAYOFF EVALUATION:
   - Whether the payoff is proportional to the emphasis placed on the setup
   - If the payoff occurs at an appropriate time after the setup
   - Whether the use of the element is satisfying given how it was introduced

4. NARRATIVE PROMISE ASSESSMENT:
   - Identify what narrative promises are made to readers through introduced elements
   - Evaluate whether these promises are fulfilled
   - Assess the impact of unfulfilled narrative promises on reader satisfaction

${orgInstruction}

For each Chekhov's Gun element, provide:
- The exact text and location where the element is introduced
- The exact text and location where the element is used (if it is)
- An assessment of the effectiveness of the setup-payoff
- Specific recommendations for elements that need resolution

For unfired Chekhov's Guns, suggest:
- How the introduced element could be meaningfully incorporated
- Where in the narrative the payoff could naturally occur
- How to revise the introduction if the element won't be used

Use the extensive thinking space to thoroughly catalog all introduced significant elements and their resolution status before finalizing your analysis.`
    };
    
    return prompts[foreshadowingType] || "";
  }

  /**
   * Save report and thinking content to files
   * @param {string} foreshadowingType - Type of foreshadowing analyzed
   * @param {string} content - Response content
   * @param {string} thinking - Thinking content
   * @param {number} promptTokens - Prompt token count
   * @param {number} responseTokens - Response token count
   * @param {string} saveDir - Directory to save to
   * @param {boolean} chronological - Whether organized chronologically
   * @returns {Promise<string[]>} - Array of paths to saved files
   */
  async saveReport(
    foreshadowingType,
    content,
    thinking,
    promptTokens,
    responseTokens,
    saveDir,
    chronological
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
      const baseFilename = `foreshadowing_analysis_${foreshadowingType}_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];
      
      // Create stats for thinking file
      const stats = `
Details:  ${dateTimeStr}
Analysis type: Foreshadowing ${foreshadowingType} analysis
Organization: ${chronological ? 'Chronological' : 'By foreshadowing type'}
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
        const thinkingContent = `=== FORESHADOWING ANALYSIS TYPE ===
${foreshadowingType}

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
}

module.exports = ForeshadowingTracker;
