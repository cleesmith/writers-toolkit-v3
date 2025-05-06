// conflict-analyzer.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * ConflictAnalyzer Tool
 * Analyzes manuscript for conflict patterns at different structural levels 
 * using the Claude API. Identifies conflict nature, escalation, and resolution
 * at scene, chapter, and arc levels.
 */
class ConflictAnalyzer extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('conflict_analyzer', config);
    this.claudeService = claudeService;
  }

  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing ConflictAnalyzer with options:', options);
    
    // Extract options
    let manuscriptFile = options.manuscript_file;
    const analysisLevel = options.analysis_level;
    let outlineFile = options.outline_file;
    const conflictTypes = options.conflict_types;
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
      
      // Handle "all" analysis level
      const analysisLevels = analysisLevel === "all" 
        ? ["scene", "chapter", "arc"] 
        : [analysisLevel];
      
      // Run each analysis level
      for (const level of analysisLevels) {
        this.emitOutput(`\nRunning ${level.toUpperCase()} conflict analysis...\n`);
        
        // Create the prompt for this level
        const prompt = this.createPrompt(level, outlineContent, manuscriptContent, conflictTypes);

        // Count tokens in the prompt
        this.emitOutput(`Counting tokens in prompt...\n`);
        const promptTokens = await this.claudeService.countTokens(prompt);

        // Call the shared token budget calculator
        const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);

        // Handle logging based on the returned values
        this.emitOutput(`\nToken stats:\n`);
        this.emitOutput(`Max AI model context window: [${tokenBudgets.contextWindow}] tokens\n`);
        this.emitOutput(`Input prompt tokens: [${tokenBudgets.promptTokens}] ...\n`);
        this.emitOutput(`                     = outline.txt + manuscript.txt\n`);
        this.emitOutput(`                       + prompt instructions\n`);
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
        this.emitOutput(`*  Analyzing ${level}-level conflicts in your manuscript...                  \n`);
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
          level,
          fullResponse,
          thinkingContent,
          promptTokens,
          responseTokens,
          saveDir
        );
        
        // Add the output files to the result
        outputFiles.push(...outputFile);
      }
      
      // Add files to the cache
      const toolName = 'conflict_analyzer';
      outputFiles.forEach(file => {
        fileCache.addFile(toolName, file);
      });
      
      // Return the result
      return {
        success: true,
        outputFiles,
        stats: {
          analysisLevels: analysisLevels
        }
      };
    } catch (error) {
      console.error('Error in ConflictAnalyzer:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create prompt based on analysis level
   * @param {string} analysisLevel - Level of conflict analysis
   * @param {string} outlineContent - Outline content
   * @param {string} manuscriptContent - Manuscript content
   * @param {Array|string} conflictTypes - Types of conflicts to analyze
   * @returns {string} - Prompt for Claude API
   */
  createPrompt(analysisLevel, outlineContent, manuscriptContent, conflictTypes) {
    const noMarkdown = "IMPORTANT: - NO Markdown formatting";
    
    // Convert conflictTypes to comma-separated string if it's an array
    const conflictTypesList = Array.isArray(conflictTypes) ? conflictTypes.join(", ") : conflictTypes;
    
    const prompts = {
      "scene": `=== OUTLINE ===
${outlineContent}
=== END OUTLINE ===

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor specializing in conflict analysis. Analyze the manuscript to identify and evaluate conflicts at the SCENE level. Focus on these conflict types: ${conflictTypesList}.

For each scene in the manuscript:

1. CONFLICT IDENTIFICATION:
   - Identify the primary conflict driving the scene
   - Classify the conflict type (internal, interpersonal, environmental, societal, cosmic)
   - Identify any secondary or parallel conflicts

2. CONFLICT DYNAMICS:
   - Identify the specific opposing forces (character vs character, character vs self, etc.)
   - Analyze how the conflict is introduced
   - Track the escalation pattern within the scene
   - Identify the climax or turning point of the scene-level conflict
   - Analyze the resolution or non-resolution of the scene conflict

3. CONFLICT EFFECTIVENESS:
   - Evaluate how well the conflict creates tension and drives the scene
   - Identify if the conflict advances character development
   - Assess if the conflict contributes to the larger story arcs
   - Note if any scenes lack meaningful conflict

Organize your analysis by scene, using clear scene boundaries and key identifying text. For each scene, provide:
- Scene location in the manuscript (beginning and ending text)
- Main conflict identification and classification
- Analysis of conflict dynamics and progression
- Assessment of conflict effectiveness
- Specific recommendations for strengthening scene conflicts where needed

Use specific text examples from the manuscript to support your analysis.
`,

      "chapter": `=== OUTLINE ===
${outlineContent}
=== END OUTLINE ===

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor specializing in conflict analysis. Analyze the manuscript to identify and evaluate conflicts at the CHAPTER level. Focus on these conflict types: ${conflictTypesList}.

For each chapter or major section in the manuscript:

1. CONFLICT PROGRESSION:
   - Identify the primary chapter-level conflict
   - Analyze how the conflict evolves across scenes within the chapter
   - Track rising and falling tension patterns
   - Identify how the chapter-level conflict connects to the overall story arcs

2. CONFLICT STRUCTURE:
   - Analyze the chapter's conflict structure (introduction, complications, climax)
   - Identify how scene-level conflicts contribute to the chapter's main conflict
   - Note any parallel conflict threads running through the chapter
   - Evaluate the chapter's conflict resolution or cliff-hanger

3. CONFLICT EFFECTIVENESS:
   - Assess if the chapter conflict is substantial enough to sustain reader interest
   - Evaluate if the conflict pacing is effective
   - Identify if the conflict advances the overall plot and character development
   - Note if the chapter conflict integrates well with preceding and following chapters

Organize your analysis by chapter/section, providing:
- Chapter identification (heading or beginning text)
- Main conflict analysis and classification
- Conflict progression through the chapter
- Assessment of conflict structure and effectiveness
- Specific recommendations for improving chapter-level conflict where needed

Use specific text examples from the manuscript to support your analysis.
`,

      "arc": `=== OUTLINE ===
${outlineContent}
=== END OUTLINE ===

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor specializing in conflict analysis. Analyze the manuscript to identify and evaluate conflicts at the ARC level. Focus on these conflict types: ${conflictTypesList}.

Analyze the major conflict arcs that span multiple chapters or the entire manuscript:

1. CORE CONFLICT IDENTIFICATION:
   - Identify the primary conflict driving the overall narrative
   - Identify major secondary conflict arcs
   - Classify each conflict arc by type
   - Map the key characters or forces involved in each arc

2. ARC PROGRESSION:
   - For each major conflict arc, trace its development across the manuscript
   - Identify key escalation points and their manuscript locations
   - Track how the conflicts evolve, intensify, and interconnect
   - Map the climactic moments for each conflict arc
   - Analyze resolution patterns for each arc

3. CONFLICT ARCHITECTURE:
   - Analyze how the various conflict arcs interrelate
   - Identify how smaller conflicts feed into larger arcs
   - Evaluate the balance of different conflict types
   - Assess the structural integrity of the conflict arcs

4. NARRATIVE IMPACT:
   - Evaluate how effectively the conflict arcs drive the overall story
   - Assess if the conflict progression creates appropriate tension curves
   - Identify if the conflicts support the thematic elements
   - Evaluate if the resolutions are satisfying and consistent with setup

Provide a comprehensive analysis of the manuscript's conflict architecture:
- Map of major conflict arcs with their progression points
- Analysis of how conflicts interconnect and build upon each other
- Assessment of pacing and escalation effectiveness
- Specific recommendations for strengthening the conflict architecture

Use specific text examples from the manuscript to support your analysis.
`
    };
    
    return prompts[analysisLevel] || "";
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
   * @param {string} analysisLevel - Level of conflict analysis
   * @param {string} content - Response content
   * @param {string} thinking - Thinking content
   * @param {number} promptTokens - Prompt token count
   * @param {number} responseTokens - Response token count
   * @param {string} saveDir - Directory to save to
   * @returns {Promise<string[]>} - Array of paths to saved files
   */
  async saveReport(
    analysisLevel,
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
      const baseFilename = `conflict_analysis_${analysisLevel}_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];
      
      // Create stats for thinking file
      const stats = `
Details:  ${dateTimeStr}
Analysis level: ${analysisLevel} conflict analysis
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
        const thinkingContent = `=== CONFLICT ANALYSIS LEVEL ===
${analysisLevel}

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

module.exports = ConflictAnalyzer;
