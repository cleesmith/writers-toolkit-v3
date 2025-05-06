// plot-thread-tracker.js
const BaseTool = require('./base-tool');
const path = require('path');
const util = require('util');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * Plot Thread Tracker Tool
 * Analyzes manuscript to identify and track distinct plot threads using the Claude API.
 * Shows how plot threads interconnect, converge, and diverge throughout the narrative.
 */
class PlotThreadTracker extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('plot_thread_tracker', config);
    this.claudeService = claudeService;
  }

  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing Plot Thread Tracker with options:', options);
    
    // Extract options
    let manuscriptFile = options.manuscript_file;
    const analysisDepth = options.analysis_depth;
    const outlineFile = options.outline_file;
    const threadFocus = options.thread_focus;
    const useAsciiArt = options.ascii_art;
    const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }

    // Ensure file paths are absolute
    manuscriptFile = this.ensureAbsolutePath(manuscriptFile, saveDir);
    let outlineFilePath = null;
    if (outlineFile) {
      outlineFilePath = this.ensureAbsolutePath(outlineFile, saveDir);
    }
    
    // Log the full paths for debugging
    console.log('Using full paths:');
    console.log(`Manuscript: ${manuscriptFile}`);
    if (outlineFilePath) {
      console.log(`Outline: ${outlineFilePath}`);
    }

    const outputFiles = [];
    
    try {
      // Read the input files
      this.emitOutput(`Reading files...\n`);

      // Read the manuscript file
      this.emitOutput(`Reading manuscript file: ${manuscriptFile}\n`);
      const manuscriptContent = await this.readInputFile(manuscriptFile);
      
      // Read the outline file if provided
      let outlineContent = "";
      if (outlineFilePath) {
        this.emitOutput(`Reading outline file: ${outlineFilePath}\n`);
        outlineContent = await this.readInputFile(outlineFilePath);
      } else {
        this.emitOutput(`No outline file provided.\n`);
      }
      
      // Create the prompt
      const prompt = this.createPlotThreadPrompt(
        analysisDepth, 
        outlineContent, 
        manuscriptContent,
        threadFocus,
        useAsciiArt
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
      this.emitOutput(`                     = manuscript + outline + prompt instructions\n`);
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
      this.emitOutput(`*  Analyzing plot threads in your manuscript...                            \n`);
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

      // Format thread focus for reporting
      const threadFocusStr = threadFocus ? (Array.isArray(threadFocus) ? threadFocus.join(", ") : threadFocus) : "All threads";

      // Save the report
      const outputFile = await this.saveReport(
        analysisDepth,
        threadFocusStr,
        useAsciiArt,
        fullResponse,
        thinkingContent,
        promptTokens,
        responseTokens,
        saveDir
      );
      
      // Add all output files to the result
      outputFiles.push(...outputFile);
      
      // Add files to the cache
      const toolName = 'plot_thread_tracker';
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
          analysisDepth,
          threadFocus: threadFocusStr,
          useAsciiArt
        }
      };
    } catch (error) {
      console.error('Error in PlotThreadTracker:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create plot thread analysis prompt
   * @param {string} analysisDepth - Analysis depth (basic, detailed, comprehensive)
   * @param {string} outlineContent - Outline content
   * @param {string} manuscriptContent - Manuscript content
   * @param {Array|string} threadFocus - Optional specific threads to focus on
   * @param {boolean} useAsciiArt - Whether to include ASCII art visualizations
   * @returns {string} - Prompt for Claude API
   */
  createPlotThreadPrompt(analysisDepth = "comprehensive", outlineContent = "", manuscriptContent, threadFocus = null, useAsciiArt = false) {
    const noMarkdown = "IMPORTANT: - NO Markdown formatting";
    
    let threadFocusStr = "";
    if (threadFocus) {
      if (Array.isArray(threadFocus)) {
        threadFocusStr = `Pay special attention to these specific plot threads: ${threadFocus.join(', ')}.`;
      } else {
        threadFocusStr = `Pay special attention to these specific plot threads: ${threadFocus}.`;
      }
    }
    
    let asciiInstruction = "";
    if (useAsciiArt) {
      asciiInstruction = `
Include simple ASCII art visualizations to represent:
- Thread progressions using horizontal timelines (e.g., Thread A: ----*----*------>)
- Thread connections using branching symbols (e.g., +-- for connections)
- Thread intensity using symbols like | (low), || (medium), ||| (high)
`;
    }
    
    const prompts = {
      "basic": `=== OUTLINE ===
${outlineContent}
=== END OUTLINE ===

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor specializing in narrative structure and plot analysis. Conduct a BASIC plot thread analysis of the manuscript, focusing on the main storylines and how they progress. ${threadFocusStr}

Focus on identifying:

1. MAIN PLOT THREADS:
   - Identify 3-5 major plot threads running through the manuscript
   - Provide a clear name and short description for each thread
   - Note the primary characters involved in each thread

2. THREAD PROGRESSION:
   - For each identified thread, track where it appears in the manuscript
   - Note key progression points (beginning, major developments, resolution)
   - Provide manuscript locations (using exact text excerpts) for each point

3. BASIC THREAD CONNECTIONS:
   - Identify where major plot threads intersect or influence each other
   - Note convergence points where multiple threads come together
   - Highlight any threads that remain isolated from others

${asciiInstruction}

Organize your analysis by thread, showing each thread's progression and key connection points with other threads. For each thread, include:
- Thread name and description
- Key progression points with manuscript locations
- Major connections to other threads

Present the information in a clear, structured format that makes the plot architecture easy to understand without requiring graphics.`,

      "detailed": `=== OUTLINE ===
${outlineContent}
=== END OUTLINE ===

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor specializing in narrative structure and plot analysis. Conduct a DETAILED plot thread analysis of the manuscript, tracking how multiple storylines develop and interconnect. ${threadFocusStr}

Focus on identifying:

1. PLOT THREAD IDENTIFICATION:
   - Identify all significant plot threads running through the manuscript
   - Classify threads as main plot, subplot, character arc, thematic thread, etc.
   - Provide a clear name and description for each thread
   - Note the primary and secondary characters involved in each thread

2. THREAD PROGRESSION MAPPING:
   - For each thread, track its complete progression through the manuscript
   - Map the initiation, development stages, climax, and resolution
   - Note the intensity/prominence of the thread at different points
   - Identify when threads go dormant and reactivate

3. INTERCONNECTION ANALYSIS:
   - Map where and how plot threads connect to each other
   - Identify causal relationships between thread developments
   - Note where threads converge, diverge, or conflict
   - Analyze how threads support or undermine each other

4. NARRATIVE STRUCTURE ASSESSMENT:
   - Identify how threads align with overall narrative structure
   - Note how multiple threads build toward key story moments
   - Assess thread balance and pacing across the manuscript

${asciiInstruction}

Present your analysis as:
1. A thread directory listing all identified threads with descriptions
2. A progression map for each thread showing its development points
3. An interconnection analysis showing how threads relate to each other
4. A narrative assessment of the overall plot architecture

For each thread entry, include:
- Thread name, type, and key characters
- Detailed progression points with manuscript locations
- Connection points with other threads
- Assessment of thread effectiveness

Use text formatting to create a clear visual structure that shows the relationships between threads without requiring graphics.`,

      "comprehensive": `=== OUTLINE ===
${outlineContent}
=== END OUTLINE ===

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor specializing in narrative structure and plot architecture. Conduct a COMPREHENSIVE plot thread analysis of the manuscript, creating a detailed visualization of how all narrative elements interconnect. ${threadFocusStr}

Focus on identifying:

1. COMPLETE THREAD IDENTIFICATION:
   - Identify ALL plot threads: main plot, subplots, character arcs, thematic threads, mystery threads, etc.
   - Provide a clear name, type classification, and detailed description for each thread
   - Note all characters involved in each thread with their roles
   - Identify the narrative purpose of each thread

2. DETAILED PROGRESSION TRACKING:
   - For each thread, map its complete journey through the manuscript
   - Track the setup, development stages, complications, climax, resolution
   - Measure thread intensity/prominence at each appearance (minor mention vs. focal point)
   - Note when threads transform or evolve in purpose
   - Track emotional tone shifts within threads

3. COMPLEX INTERCONNECTION MAPPING:
   - Create a detailed map of all thread connections and relationships
   - Identify direct and indirect influences between threads
   - Note where threads support, undermine, mirror, or contrast each other
   - Map causal chains that span multiple threads
   - Identify connection hubs where multiple threads converge

4. STRUCTURAL ARCHITECTURE ANALYSIS:
   - Analyze how threads combine to create the overall narrative structure
   - Identify patterns in how threads are arranged and interwoven
   - Note rhythm and pacing across multiple threads
   - Identify structural strengths and weaknesses in the thread architecture

${asciiInstruction}

Present your analysis in four main sections:
1. THREAD DIRECTORY - Comprehensive listing of all threads with detailed descriptions
2. PROGRESSION MAPS - Detailed development tracking for each thread
3. INTERCONNECTION ATLAS - Mapping of how all threads relate to and influence each other
4. ARCHITECTURAL ASSESSMENT - Analysis of the overall narrative structure created by the threads

For the Interconnection Atlas, create a text-based visualization that shows:
- Direct connections between threads (with connection types)
- Hub points where multiple threads converge
- Patterns of thread interaction throughout the manuscript

Use precise manuscript locations (with exact quotes) to anchor your analysis throughout.`
    };
    
    return prompts[analysisDepth] || prompts["comprehensive"];
  }

  /**
   * Count words in text
   * @param {string} text - Text to count words in
   * @returns {number} - Word count
   */
  countWords(text) {
    return text.replace(/(\r\n|\r|\n)/g, ' ').split(/\s+/).filter(word => word.length > 0).length;
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
   * @param {string} analysisDepth - Analysis depth (basic, detailed, comprehensive)
   * @param {string} threadFocusStr - Thread focus string
   * @param {boolean} useAsciiArt - Whether ASCII art was used
   * @param {string} content - Response content
   * @param {string} thinking - Thinking content
   * @param {number} promptTokens - Prompt token count
   * @param {number} responseTokens - Response token count
   * @param {string} saveDir - Directory to save to
   * @returns {Promise<string[]>} - Array of paths to saved files
   */
  async saveReport(
    analysisDepth,
    threadFocusStr,
    useAsciiArt,
    content,
    thinking,
    promptTokens,
    responseTokens,
    saveDir
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
      const desc = description ? `_${description}` : '';
      const level = analysisDepth !== 'comprehensive' ? `_${analysisDepth}` : '';
      const baseFilename = `plot_thread_analysis${desc}${level}_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];
      
      // Create stats for thinking file
      const stats = `
Details:  ${dateTimeStr}
Analysis type: Plot thread analysis
Analysis depth: ${analysisDepth}
Thread focus: ${threadFocusStr}
ASCII art: ${useAsciiArt ? 'Enabled' : 'Disabled'}
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
        const thinkingContent = `=== PLOT THREAD ANALYSIS ===

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

module.exports = PlotThreadTracker;
