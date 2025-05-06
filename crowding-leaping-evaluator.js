// crowding-leaping-evaluator.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * CrowdingLeapingEvaluator Tool
 * Analyzes manuscript for pacing issues based on Ursula K. Le Guin's concepts of
 * "crowding" (intense detail) and "leaping" (jumping over time or events).
 * Identifies dense paragraphs, abrupt transitions, and visualizes pacing patterns.
 */
class CrowdingLeapingEvaluator extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('crowding_leaping_evaluator', config);
    this.claudeService = claudeService;
  }

  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing Crowding Leaping Evaluator with options:', options);
    
    // Extract options
    let manuscriptFile = options.manuscript_file;
    const analysisLevel = options.analysis_level;
    const focusAreas = options.focus_areas;
    const sensitivity = options.sensitivity;
    const includeVisualization = options.include_visualization;
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
      
      // Create the prompt
      const prompt = this.createCrowdingLeapingPrompt(
        manuscriptContent, 
        analysisLevel, 
        focusAreas, 
        sensitivity,
        includeVisualization
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
      this.emitOutput(`                     = manuscript + prompt instructions\n`);
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
      this.emitOutput(`*  Analyzing crowding and leaping patterns in your manuscript...            \n`);
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

      // Use the calculated values in the API call - following pattern from rhythm-analyzer.js
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
        analysisLevel,
        focusAreas,
        sensitivity,
        includeVisualization,
        fullResponse,
        thinkingContent,
        promptTokens,
        responseTokens,
        saveDir
      );
      
      // Add all output files to the result
      outputFiles.push(...outputFile);
      
      // Add files to the cache
      const toolName = 'crowding_leaping_evaluator';
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
          analysisLevel,
          focusAreas,
          sensitivity,
          includeVisualization
        }
      };
    } catch (error) {
      console.error('Error in CrowdingLeapingEvaluator:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create crowding leaping analysis prompt
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} analysisLevel - Analysis level (basic, standard, detailed)
   * @param {Array|string} focusAreas - Areas to focus on
   * @param {string} sensitivity - Sensitivity level (low, medium, high)
   * @param {boolean} includeVisualization - Whether to include visualization
   * @returns {string} - Prompt for Claude API
   */
  createCrowdingLeapingPrompt(manuscriptContent, analysisLevel = "standard", focusAreas = ["crowding", "leaping", "transitions", "pacing"], sensitivity = "medium", includeVisualization = false) {
    // Build instruction section based on analysis level
    const basicInstructions = `
1. PACING OVERVIEW:
   - Identify the overall pacing structure of the manuscript
   - Highlight patterns of crowding (dense detail) and leaping (time/event jumps)
   - Explain how these patterns affect readability and narrative flow

2. CROWDING ANALYSIS:
   - Identify paragraphs with intense detail or many events happening quickly
   - Flag sections where the narrative feels dense or overwhelming
   - Note effective use of crowding for emphasis or dramatic effect
   - Provide examples with suggestions for potential adjustment

3. LEAPING ANALYSIS:
   - Identify sections where significant time or events are skipped
   - Point out abrupt transitions that may confuse readers
   - Highlight effective uses of leaping to maintain narrative momentum
   - Suggest improvements for leaps that lack necessary context or bridges
`;

    const standardInstructions = basicInstructions + `
4. TRANSITION ANALYSIS:
   - Evaluate the effectiveness of scene and chapter transitions
   - Identify transitions that are too abrupt or too drawn out
   - Analyze how transitions contribute to or detract from pacing
   - Suggest ways to improve problematic transitions

5. BALANCE ASSESSMENT:
   - Assess the balance between crowded and leaping sections
   - Identify narrative patterns that may create reading fatigue
   - Evaluate how well the pacing serves the content and genre expectations
   - Suggest adjustments to create more effective pacing rhythms
`;

    const detailedInstructions = standardInstructions + `
6. SCENE DENSITY MAPPING:
   - Provide a structural map of the manuscript's pacing patterns
   - Analyze how scene density shifts throughout the manuscript
   - Identify potential pacing problems at the macro-structural level
   - Suggest strategic adjustments to improve overall narrative rhythm

7. WHITE SPACE ANALYSIS:
   - Examine how effectively "white space" is used between scenes and events
   - Analyze the presence and absence of reflective or transitional passages
   - Identify opportunities for adding or removing breathing room
   - Suggest techniques for modulating narrative density

8. GENRE-SPECIFIC CONSIDERATIONS:
   - Evaluate pacing against genre expectations and conventions
   - Analyze how crowding and leaping affect genre-specific elements
   - Identify pacing strategies that would enhance genre effectiveness
   - Suggest tailored approaches for improving genre alignment
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

    // Add visualization instructions if requested
    const visualizationInstructions = `
9. PACING VISUALIZATION:
   - Create a text-based visualization that represents the pacing patterns
   - Use symbols to indicate dense/crowded sections (e.g., "###") and leaps/transitions (e.g., "->")
   - Map the pacing flow throughout the manuscript to identify rhythm patterns
   - Include a legend explaining the visualization symbols
`;

    if (includeVisualization) {
      instructionSet += visualizationInstructions;
    }

    // Construct the focus areas emphasis
    let focusAreasText;
    if (Array.isArray(focusAreas)) {
      focusAreasText = focusAreas.join(", ");
    } else {
      // Handle the case where focusAreas might be a string
      focusAreasText = String(focusAreas);
    }

    // Adjust instructions based on sensitivity level
    const sensitivityInstructions = {
      "low": "Focus only on the most significant pacing issues that affect readability and engagement.",
      "medium": "Identify moderate to major pacing issues, balancing technical assessment with artistic considerations.",
      "high": "Perform a detailed analysis of all potential pacing patterns, noting even subtle variations in narrative density."
    };
    
    const sensitivityText = sensitivityInstructions[sensitivity] || sensitivityInstructions["medium"];

    // Construct the full prompt
    const instructions = `IMPORTANT: NO Markdown formatting

You are an expert literary editor specializing in narrative pacing and structure. Your task is to analyze the provided manuscript for crowding and leaping patterns, focusing particularly on: ${focusAreasText}.

Follow Ursula K. Le Guin's concepts from "Steering the Craft" on controlling scene density through "crowding" (adding intense detail) and "leaping" (jumping over time or events). According to Le Guin, mastering these techniques allows writers to control the reader's experience through the density and sparseness of the narrative.

Sensitivity level: ${sensitivity}. ${sensitivityText}

Pay special attention to:
1. CROWDED SECTIONS
   - Paragraphs with intense sensory detail or many quick events
   - Sections where multiple significant actions occur in rapid succession
   - Dense descriptive passages that may overwhelm the reader
   Example: "She grabbed her keys, slammed the door, ran down three flights of stairs, hailed a cab, jumped in, gave the address, texted her boss, checked her makeup, and rehearsed her presentation all before the first stoplight."

2. LEAPING SECTIONS
   - Abrupt jumps in time, location, or perspective without sufficient transition
   - Places where significant events happen "off-screen" between scenes
   - Transitions that may leave readers disoriented or confused
   Example: "John left the party early. Three years later, he returned to find everything had changed."

3. TRANSITION EFFECTIVENESS
   - How smoothly the narrative moves between scenes, settings, and time periods
   - Whether transitions provide enough context for readers to follow leaps
   - If scene changes use appropriate pacing techniques for the content
   Example (effective): "As winter gave way to spring, so too did her grief begin to thaw." 
   Example (ineffective): "They argued bitterly. The wedding was beautiful."

4. PACING PATTERNS
   - Repetitive structures that may create monotony
   - Consistent density that doesn't vary with narrative importance
   - Opportunities to use crowding and leaping more strategically
   Example (problem): Five consecutive scenes that all use the same dense detail level regardless of importance
   Suggestion: Vary detail level to emphasize key moments and quicken pace for transitions

For each pacing issue you identify, provide:
- The relevant passage with the crowding or leaping pattern
- An analysis of its effect on reader experience and narrative flow
- A suggested revision approach that maintains the author's voice and intent

Create a comprehensive pacing analysis with these sections:
${instructionSet}

Format your analysis as a clear, organized report with sections and subsections. Use plain text formatting only (NO Markdown). Use numbered or bulleted lists where appropriate for clarity.

Be specific in your examples and suggestions, showing how crowding and leaping can be adjusted without changing the author's voice or intention. Focus on practical changes that will make the writing more engaging and effective.
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
   * @param {Array|string} focusAreas - Areas analyzed
   * @param {string} sensitivity - Sensitivity level (low, medium, high)
   * @param {boolean} includeVisualization - Whether visualization was included
   * @param {string} content - Response content
   * @param {string} thinking - Thinking content
   * @param {number} promptTokens - Prompt token count
   * @param {number} responseTokens - Response token count
   * @param {string} saveDir - Directory to save to
   * @returns {Promise<string[]>} - Array of paths to saved files
   */
  async saveReport(
    analysisLevel,
    focusAreas,
    sensitivity,
    includeVisualization,
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
      const level = analysisLevel !== 'standard' ? `_${analysisLevel}` : '';
      const viz = includeVisualization ? '_with_viz' : '';
      const baseFilename = `crowding_leaping_analysis${level}${viz}_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];
      
      // Format focusAreas for stats
      const focusAreasStr = Array.isArray(focusAreas) ? focusAreas.join(', ') : focusAreas;
      
      // Create stats for thinking file
      const stats = `
Details:  ${dateTimeStr}
Analysis type: Crowding and leaping pacing analysis
Analysis level: ${analysisLevel}
Focus areas: ${focusAreasStr}
Sensitivity level: ${sensitivity}
Include visualization: ${includeVisualization}
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
        const thinkingContent = `=== CROWDING AND LEAPING ANALYSIS ===

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

module.exports = CrowdingLeapingEvaluator;
