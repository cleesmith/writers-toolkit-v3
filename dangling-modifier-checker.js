// dangling-modifier-checker.js
const BaseTool = require('./base-tool');
const path = require('path');
const util = require('util');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * DanglingModifierChecker Tool
 * Analyzes manuscript for dangling and misplaced modifiers using the Claude API.
 * Identifies phrases that don't logically connect to the subject they're meant to modify,
 * which can create unintended humor or confusion, following Ursula K. Le Guin's 
 * writing guidance on clarity and precision.
 */
class DanglingModifierChecker extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('dangling_modifier_checker', config);
    this.claudeService = claudeService;
    // console.log('DanglingModifierChecker initialized with config:', 
    //   util.inspect(config, { depth: 1, colors: true }));
  }
  
  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing Dangling Modifier Checker with options:', options);
    
    // Extract options
    let manuscriptFile = options.manuscript_file;
    const analysisLevel = options.analysis_level;
    const modifierTypes = options.modifier_types;
    const sensitivity = options.sensitivity;
    const analysisDescription = options.analysis_description;
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
      const prompt = this.createModifierAnalysisPrompt(manuscriptContent, analysisLevel, modifierTypes, sensitivity);

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
      this.emitOutput(`*  Analyzing dangling and misplaced modifiers in your manuscript...        \n`);
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

      // Use the calculated values in the API call - FIXED to match narrative-integrity.js pattern
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
        modifierTypes,
        sensitivity,
        fullResponse,
        thinkingContent,
        promptTokens,
        responseTokens,
        saveDir,
        analysisDescription
      );
      
      // Add all output files to the result
      outputFiles.push(...outputFile);
      
      // Add files to the cache
      const toolName = 'dangling_modifier_checker';
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
          modifierTypes,
          sensitivity
        }
      };
    } catch (error) {
      console.error('Error in DanglingModifierChecker:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create modifier analysis prompt
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} analysisLevel - Analysis level (basic, standard, detailed)
   * @param {Array|string} modifierTypes - Types of modifiers to analyze
   * @param {string} sensitivity - Sensitivity level (low, medium, high)
   * @returns {string} - Prompt for Claude API
   */
  createModifierAnalysisPrompt(manuscriptContent, analysisLevel = "standard", modifierTypes = ["dangling", "misplaced", "squinting", "limiting"], sensitivity = "medium") {
    // Build instruction section based on analysis level
    const basicInstructions = `
1. MODIFIER PROBLEM OVERVIEW:
   - Identify the most obvious dangling and misplaced modifiers in the manuscript
   - Highlight patterns of modifier usage that create confusion
   - Explain how these problems affect clarity and readability

2. DANGLING MODIFIER ANALYSIS:
   - Identify introductory phrases that don't logically connect to the subject that follows
   - Flag participial phrases (-ing, -ed) that appear to modify the wrong noun
   - Point out modifiers that create unintentional humor or confusion
   - Provide clear examples with correction suggestions

3. MISPLACED MODIFIER ANALYSIS:
   - Identify words, phrases, or clauses positioned where they modify the wrong element
   - Point out adverbs or adjectives that are placed too far from what they modify
   - Highlight restrictive modifiers (only, just, nearly, etc.) that modify the wrong element
   - Suggest proper placement for clarity
`;

    const standardInstructions = basicInstructions + `
4. SQUINTING MODIFIER ANALYSIS:
   - Identify modifiers that could logically apply to either preceding or following elements
   - Flag ambiguous adverbs that create unclear meaning
   - Examine sentences where it's unclear what a modifier is intended to modify
   - Suggest restructuring for clarity

5. COORDINATION PROBLEMS:
   - Identify faulty parallelism in lists or series that creates modifier problems
   - Point out correlative conjunctions (not only/but also, either/or) with misaligned elements
   - Analyze comparisons that create logical inconsistencies
   - Suggest restructuring to maintain logical relationships
`;

    const detailedInstructions = standardInstructions + `
6. CONTEXTUAL MODIFIER ISSUES:
   - Analyze how modifier problems affect character voice or narrative clarity
   - Identify patterns of modifier issues in different types of passages (dialogue, description, action)
   - Examine how modifier issues affect pacing or create reader confusion
   - Suggest revision strategies tailored to different passage types

7. LIMITING MODIFIER ANALYSIS:
   - Identify modifiers that create unintended restrictions or qualifications
   - Analyze how placement of limiting modifiers (only, just, even, etc.) affects meaning
   - Examine noun phrase modifiers that create ambiguity
   - Suggest precise placement to convey intended meaning

8. COMPLEX STRUCTURE ISSUES:
   - Identify problems in sentences with multiple clauses or nested modifiers
   - Analyze long sentences where modifier relationships become unclear
   - Examine complex descriptive passages for modifier clarity
   - Suggest simplification or restructuring strategies
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

    // Construct the modifier types emphasis
    let modifierTypesText;
    if (Array.isArray(modifierTypes)) {
      modifierTypesText = modifierTypes.join(", ");
    } else {
      // Handle the case where modifierTypes might be a string
      modifierTypesText = String(modifierTypes);
    }

    // Adjust instructions based on sensitivity level
    const sensitivityInstructions = {
      "low": "Focus only on the most obvious and confusing modifier issues that significantly impact meaning.",
      "medium": "Identify moderate to major modifier issues, balancing technical correctness with stylistic considerations.",
      "high": "Perform a detailed analysis of all potential modifier issues, noting even subtle cases of ambiguity."
    };
    
    const sensitivityText = sensitivityInstructions[sensitivity] || sensitivityInstructions["medium"];

    // Construct the full prompt
    const instructions = `IMPORTANT: NO Markdown formatting

You are an expert literary editor specializing in grammatical clarity and precision. Your task is to analyze the provided manuscript for dangling and misplaced modifiers, focusing particularly on: ${modifierTypesText}.

Follow Ursula K. Le Guin's guidance from "Steering the Craft" on the importance of clear, precise sentence construction. Dangling modifiers occur when a descriptive phrase doesn't connect logically to what it's supposed to modify, creating confusion or unintentional humor. In her words, "danglers can really wreck the scenery."

Sensitivity level: ${sensitivity}. ${sensitivityText}

Pay special attention to:
1. Introductory phrases that don't logically connect to the subject that follows
   Example: "Walking down the street, the trees were beautiful." (Who is walking?)
   Corrected: "Walking down the street, I thought the trees were beautiful."

2. Participial phrases (-ing, -ed) that appear to modify the wrong noun
   Example: "Rushing to catch the train, my coffee spilled everywhere." (The coffee wasn't rushing)
   Corrected: "Rushing to catch the train, I spilled my coffee everywhere."

3. Modifiers placed too far from what they're modifying
   Example: "She served cake to the children on paper plates." (Were the children on paper plates?)
   Corrected: "She served cake on paper plates to the children."

4. Limiting modifiers (only, just, nearly, almost) that modify the wrong element
   Example: "He only eats vegetables on Tuesdays." (Does he do nothing else with vegetables on Tuesdays?)
   Corrected: "He eats vegetables only on Tuesdays."

5. Squinting modifiers that could apply to either what comes before or after
   Example: "Drinking coffee quickly improves alertness." (Does "quickly" modify drinking or improves?)
   Corrected: "Quickly drinking coffee improves alertness." OR "Drinking coffee improves alertness quickly."

For each issue you identify, provide:
- The original sentence with the modifier problem
- An explanation of why it's problematic
- A suggested revision that maintains the author's intended meaning

Create a comprehensive modifier analysis with these sections:
${instructionSet}

Format your analysis as a clear, organized report with sections and subsections. Use plain text formatting only (NO Markdown). Use numbered or bulleted lists where appropriate for clarity.

Be specific in your examples and suggestions, showing how modifier placement can be improved without changing the author's voice or intention. Focus on practical changes that will make the writing clearer and more effective.
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
   * @param {Array|string} modifierTypes - Types of modifiers analyzed
   * @param {string} sensitivity - Sensitivity level (low, medium, high)
   * @param {string} content - Response content
   * @param {string} thinking - Thinking content
   * @param {number} promptTokens - Prompt token count
   * @param {number} responseTokens - Response token count
   * @param {string} saveDir - Directory to save to
   * @param {string} description - Optional description
   * @returns {Promise<string[]>} - Array of paths to saved files
   */
  async saveReport(
    analysisLevel,
    modifierTypes,
    sensitivity,
    content,
    thinking,
    promptTokens,
    responseTokens,
    saveDir,
    description
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
      const level = analysisLevel !== 'standard' ? `_${analysisLevel}` : '';
      const baseFilename = `dangling_modifier_check${desc}${level}_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];
      
      // Format modifierTypes for stats
      const modifierTypesStr = Array.isArray(modifierTypes) ? modifierTypes.join(', ') : modifierTypes;
      
      // Create stats for thinking file
      const stats = `
Details:  ${dateTimeStr}
Analysis type: Dangling and misplaced modifier analysis
Analysis level: ${analysisLevel}
Modifier types: ${modifierTypesStr}
Sensitivity level: ${sensitivity}
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
        const thinkingContent = `=== DANGLING MODIFIER ANALYSIS ===

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

module.exports = DanglingModifierChecker;