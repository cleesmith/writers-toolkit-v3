// rhythm-analyzer.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * Rhythm Analyzer Tool
 * Analyzes manuscript for rhythm and flow of prose using the Claude API.
 * Measures sentence length variations, detects monotonous patterns,
 * and highlights passages where the sound doesn't match the intended mood,
 * following Ursula K. Le Guin's writing advice on prose rhythm.
 */
class RhythmAnalyzer extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('rhythm_analyzer', config);
    this.claudeService = claudeService;
  }

  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing Rhythm Analyzer with options:', options);
    
    // Extract options
    let manuscriptFile = options.manuscript_file;
    const analysisLevel = options.analysis_level;
    const sceneTypes = options.scene_types;
    const rhythmSensitivity = options.rhythm_sensitivity;
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
      const prompt = this.createRhythmAnalysisPrompt(manuscriptContent, analysisLevel, sceneTypes, rhythmSensitivity);

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
      this.emitOutput(`*  Analyzing prose rhythm and flow in your manuscript...                    \n`);
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

      // Use the calculated values in the API call - FIXED to match dangling-modifier-checker.js exactly
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
        sceneTypes,
        rhythmSensitivity,
        fullResponse,
        thinkingContent,
        promptTokens,
        responseTokens,
        saveDir
      );
      
      // Add all output files to the result
      outputFiles.push(...outputFile);
      
      // Add files to the cache
      const toolName = 'rhythm_analyzer';
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
          sceneTypes,
          rhythmSensitivity
        }
      };
    } catch (error) {
      console.error('Error in RhythmAnalyzer:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create rhythm analysis prompt
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} analysisLevel - Analysis level (basic, standard, detailed)
   * @param {Array|string} sceneTypes - Types of scenes to analyze
   * @param {string} rhythmSensitivity - Sensitivity level (low, medium, high)
   * @returns {string} - Prompt for Claude API
   */
  createRhythmAnalysisPrompt(manuscriptContent, analysisLevel = "standard", sceneTypes = ["action", "dialogue", "description", "exposition"], rhythmSensitivity = "medium") {
    // Build instruction section based on analysis level
    const basicInstructions = `
1. SENTENCE RHYTHM OVERVIEW:
   - Analyze overall patterns of sentence length and structure in the manuscript
   - Identify the general rhythm signature of the prose
   - Highlight any distinctive cadences in the writing

2. RHYTHM OPTIMIZATION OPPORTUNITIES:
   - Identify passages with monotonous sentence patterns
   - Point out sections where rhythm doesn't match content (e.g., short choppy sentences for peaceful scenes)
   - Suggest specific improvements with examples

3. RECOMMENDATIONS:
   - Provide practical suggestions for varying sentence structure and rhythm
   - Suggest specific changes to improve flow in problematic passages
   - Recommend rhythm adjustments to match content mood and pacing
`;

    const standardInstructions = basicInstructions + `
4. PASSAGE-TYPE RHYTHM ANALYSIS:
   - Analyze rhythm patterns in different passage types (action, dialogue, description, exposition)
   - Assess the effectiveness of rhythm in each type
   - Suggest rhythm improvements specific to each passage type

5. SOUND PATTERN ASSESSMENT:
   - Identify notable sound patterns (alliteration, assonance, consonance, etc.)
   - Evaluate their effect on the prose rhythm
   - Note any jarring or distracting sound combinations
   - Suggest ways to enhance or moderate sound effects
`;

    const detailedInstructions = standardInstructions + `
6. PARAGRAPH-LEVEL RHYTHM ANALYSIS:
   - Assess paragraph lengths and their variation throughout the manuscript
   - Analyze how paragraph breaks contribute to or detract from rhythm
   - Suggest paragraph restructuring where it might improve flow

7. MOOD-RHYTHM CORRELATION:
   - Analyze how well rhythm patterns match emotional tone in key scenes
   - Identify mismatches between rhythm and intended mood
   - Suggest specific adjustments to align rhythm with emotional content

8. ADVANCED RHYTHM STRATEGIES:
   - Provide examples of rhythm techniques from master prose stylists
   - Suggest experimental rhythm approaches for key passages
   - Offer sentence reconstruction options that maintain meaning while enhancing rhythm
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

    // Construct the scene types emphasis
    let sceneTypesText;
    if (Array.isArray(sceneTypes)) {
      sceneTypesText = sceneTypes.join(", ");
    } else {
      // Handle the case where sceneTypes might be a string
      sceneTypesText = String(sceneTypes);
    }

    // Adjust instructions based on rhythm sensitivity
    const sensitivityInstructions = {
      "low": "Focus only on major rhythm issues that significantly impact readability or comprehension.",
      "medium": "Identify moderate to major rhythm issues, balancing attention to craft with respect for the author's style.",
      "high": "Perform a detailed analysis of subtle rhythm patterns and nuances, noting even minor opportunities for improvement."
    };
    
    const sensitivityText = sensitivityInstructions[rhythmSensitivity] || sensitivityInstructions["medium"];

    // Construct the full prompt
    const instructions = `IMPORTANT: NO Markdown formatting

You are an expert literary editor specializing in prose rhythm and the musicality of writing. Your task is to analyze the provided manuscript for rhythm and flow, focusing particularly on scene types: ${sceneTypesText}.

Follow Ursula K. Le Guin's principle from "Steering the Craft" that "rhythm is what keeps the song going, the horse galloping, the story moving." Analyze how sentence length, structure, and sound patterns create a rhythmic flow that either enhances or detracts from the narrative.

Rhythm sensitivity level: ${rhythmSensitivity}. ${sensitivityText}

Pay special attention to:
1. Sentence length variation and its effect on pacing and mood
2. Monotonous patterns that might create reader fatigue
3. Mismatches between rhythm and content (e.g., long flowing sentences for urgent action)
4. Sound patterns that enhance or detract from the reading experience
5. Paragraph structure and how it contributes to overall rhythm

For each issue you identify, provide:
- The original passage
- What makes the rhythm less effective
- A specific recommendation for improvement

Create a comprehensive rhythm analysis with these sections:
${instructionSet}

Format your analysis as a clear, organized report with sections and subsections. Use plain text formatting only (NO Markdown). Use numbered or bulleted lists where appropriate for clarity.

Be specific in your examples and suggestions, showing how prose rhythm can be improved without changing the author's voice or intention. Focus on practical changes that will make the writing more engaging, effective, and musical.
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
   * @param {Array|string} sceneTypes - Types of scenes analyzed
   * @param {string} rhythmSensitivity - Sensitivity level (low, medium, high)
   * @param {string} content - Response content
   * @param {string} thinking - Thinking content
   * @param {number} promptTokens - Prompt token count
   * @param {number} responseTokens - Response token count
   * @param {string} saveDir - Directory to save to
   * @returns {Promise<string[]>} - Array of paths to saved files
   */
  async saveReport(
    analysisLevel,
    sceneTypes,
    rhythmSensitivity,
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
      const baseFilename = `rhythm_analysis${level}_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];
      
      // Format sceneTypes for stats
      const sceneTypesStr = Array.isArray(sceneTypes) ? sceneTypes.join(', ') : sceneTypes;
      
      // Create stats for thinking file
      const stats = `
Details:  ${dateTimeStr}
Analysis type: Prose rhythm analysis
Analysis level: ${analysisLevel}
Scene types: ${sceneTypesStr}
Rhythm sensitivity: ${rhythmSensitivity}
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
        const thinkingContent = `=== PROSE RHYTHM ANALYSIS ===

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

module.exports = RhythmAnalyzer;
