// adjective-adverb-optimizer.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * Adjective Adverb Optimizer Tool
 * Analyzes manuscript for adjective and adverb usage using the Claude API.
 * Identifies unnecessary modifiers, overused qualifiers, and suggests stronger verbs/nouns
 * to replace adjective-heavy descriptions, following Ursula K. Le Guin's writing advice.
 */
class AdjectiveAdverbOptimizer extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('adjective_adverb_optimizer', config);
    this.claudeService = claudeService;
  }
  
  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing AdjectiveAdverbOptimizer with options:', options);
    
    // Extract options
    let manuscriptFile = options.manuscript_file;
    const analysisLevel = options.analysis_level || 'standard';
    const focusAreas = options.focus_areas || ['qualifiers', 'adverbs', 'adjectives', 'imagery'];
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
      const prompt = this.createModifierAnalysisPrompt(manuscriptContent, analysisLevel, focusAreas);

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
      this.emitOutput(`Sending request to Claude API (streaming)...\n`);

      // Add a message about waiting
      this.emitOutput(`****************************************************************************\n`);
      this.emitOutput(`*  Analyzing adjectives and adverbs in your manuscript...                  \n`);
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
            model: "claude-3-7-sonnet-20250219",
            system: systemPrompt,
            max_tokens: tokenBudgets.maxTokens,
            thinking: {
              type: "enabled",
              budget_tokens: tokenBudgets.thinkingBudget
            },
            betas: ["output-128k-2025-02-19"]
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
        fullResponse,
        thinkingContent,
        promptTokens,
        responseTokens,
        saveDir
      );
      
      // Add all output files to the result
      outputFiles.push(...outputFile);
      
      // Add files to the cache
      const toolName = 'adjective_adverb_optimizer';
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
          focusAreas
        }
      };
    } catch (error) {
      console.error('Error in AdjectiveAdverbOptimizer:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create modifier analysis prompt
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} analysisLevel - Analysis level (basic, standard, detailed)
   * @param {Array} focusAreas - Areas to focus on
   * @returns {string} - Prompt for Claude API
   */
  createModifierAnalysisPrompt(manuscriptContent, analysisLevel = "standard", focusAreas = ["qualifiers", "adverbs", "adjectives", "imagery"]) {
    // Build instruction section based on analysis level
    const basicInstructions = `
1. ADJECTIVE AND ADVERB OVERVIEW:
   - Identify patterns of adjective and adverb usage in the manuscript
   - Highlight the most common qualifiers (very, rather, just, quite, etc.)
   - Note any recurring descriptive patterns

2. MODIFIER OPTIMIZATION OPPORTUNITIES:
   - Identify passages with unnecessary or weak modifiers
   - Point out adverbs that could be replaced with stronger verbs
   - Highlight adjective clusters that could be simplified
   - Suggest specific improvements with examples

3. RECOMMENDATIONS:
   - Provide practical suggestions for strengthening descriptive language
   - Suggest specific verb replacements for adverb+verb combinations
   - Recommend stronger nouns to replace adjective+noun pairs where appropriate
`;

    const standardInstructions = basicInstructions + `
4. QUALIFIER ANALYSIS:
   - List overused qualifiers and weakening words (e.g., very, just, quite, really, kind of, sort of)
   - Analyze frequency and impact of these qualifiers on prose strength
   - Identify dialogue vs. narrative patterns in qualifier usage
   - Suggest specific alternatives or eliminations

5. SENSORY LANGUAGE ASSESSMENT:
   - Evaluate balance between different sensory descriptors (visual, auditory, tactile, etc.)
   - Identify opportunities to replace abstract descriptions with concrete sensory details
   - Suggest ways to make descriptions more immediate and vivid
`;

    const detailedInstructions = standardInstructions + `
6. CHARACTER-SPECIFIC MODIFIER PATTERNS:
   - For each major character, analyze distinctive modifier patterns in their dialogue or POV sections
   - Identify if modifier usage helps differentiate character voices
   - Suggest improvements to make character voices more distinct through modifier choices

7. STYLISTIC IMPACT ANALYSIS:
   - Assess how current modifier usage affects pace, tone, and atmosphere
   - Identify sections where modifier reduction could improve flow
   - Note sections where additional sensory detail might enrich the prose
   - Compare modifier patterns across different scene types (action, dialogue, description)

8. ADVANCED REPLACEMENT STRATEGIES:
   - Provide examples of metaphor or imagery that could replace adjective-heavy descriptions
   - Suggest specialized vocabulary or domain-specific terms that could replace generic descriptions
   - Offer alternative sentence structures to eliminate dependence on modifiers
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

    // Construct focus area text
    // const focusAreaText = focusAreas.join(", ");
    const focusAreaText = Array.isArray(focusAreas) ? focusAreas.join(', ') : String(focusAreas || '');

    // Construct the full prompt
    const instructions = `IMPORTANT: NO Markdown formatting

You are an expert literary editor specializing in prose improvement and optimization. Your task is to analyze the provided manuscript for adjective and adverb usage, focusing particularly on: ${focusAreaText}.

Follow Ursula K. Le Guin's principle from "Steering the Craft" that "when the quality that the adverb indicates can be put in the verb itself... the prose will be cleaner, more intense, more vivid." Look for opportunities to replace weak verb+adverb combinations with strong verbs, and generic noun+adjective pairs with specific, evocative nouns.

Pay special attention to:
1. Overused qualifiers that weaken prose (very, rather, quite, just, really, somewhat, etc.)
2. Adverbs that could be eliminated by choosing stronger verbs
3. Generic adjectives that add little value (nice, good, bad, etc.)
4. Places where multiple adjectives could be replaced with one precise descriptor or a stronger noun
5. Abstract descriptions that could be made more concrete and sensory

For each issue you identify, provide:
- The original passage
- What makes it less effective
- A specific recommendation for improvement

Create a comprehensive modifier analysis with these sections:
${instructionSet}

Format your analysis as a clear, organized report with sections and subsections. Use plain text formatting only (NO Markdown). Use numbered or bulleted lists where appropriate for clarity.

Be specific in your examples and suggestions, showing how prose can be strengthened without changing the author's voice or intention. Focus on practical changes that will make the writing more vivid, clear, and powerful.
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
   * @param {Array} focusAreas - Areas to focus on
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
      const baseFilename = `adjective_adverb_optimizer${level}_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];
      
      // Format focusAreas for stats
      const focusAreasStr = Array.isArray(focusAreas) ? focusAreas.join(', ') : focusAreas;
      
      // Create stats for thinking file
      const stats = `
Details:  ${dateTimeStr}
Analysis type: Adjective and adverb optimization
Analysis level: ${analysisLevel}
Focus areas: ${focusAreasStr}
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
        const thinkingContent = `=== ADJECTIVE AND ADVERB OPTIMIZATION ANALYSIS ===

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

module.exports = AdjectiveAdverbOptimizer;