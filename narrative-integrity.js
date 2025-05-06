// narrative-integrity.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

// You've identified exactly what makes the Narrative Integrity tool so
// valuable in a comprehensive editing toolkit. Let me expand on why its
// focus on consistency issues specifically makes it worth keeping in
// the lineup:

// Why Consistency Checking Deserves Its Own Tool

// The focus on consistency issues rather than general improvement suggestions gives this tool unique value because:

// 1. Objectivity vs. Subjectivity
//    Most developmental editing is inherently subjective—suggestions about making characters more compelling or plots more engaging involve personal judgment. Consistency issues, however, are largely objective problems with clear right/wrong answers (either something contradicts established facts or it doesn't).

// 2. The Cognitive Blind Spot Problem
//    Writers and even human editors are notoriously bad at catching their own consistency errors. Our brains tend to "fill in" what we expect to see rather than what's actually on the page. This is why we miss when a character's car changes from blue to red between chapters.

// 3. Scale and Complexity Challenge
//    In longer works (novels, series), the sheer volume of details to track becomes overwhelming. No human editor can realistically hold hundreds of character traits, world rules, and previously established facts in working memory while reading.

// 4. Different Mental Process
//    Looking for inconsistencies requires a different mental approach than improving story elements. It's systematic cross-referencing rather than creative enhancement. Having a dedicated tool for this prevents this critical task from getting lost in broader revision processes.

// 5. Foundational to Other Editing
//    Consistency issues undermine reader trust and engagement. If these fundamental problems aren't addressed first, more advanced stylistic improvements may be built on shaky ground.

// The tool fills a crucial gap between developmental editing
// (which focuses on making the story better) and copy editing
// (which focuses on correctness and style). Without it, consistency
// checking often falls between the cracks or is handled incompletely
// during these other phases.

// What makes this particularly valuable is that consistency errors are
// both the most damaging to reader experience and among the hardest for
// writers to self-identify without technological assistance.

/**
 * NarrativeIntegrity Tool
 * Checks a manuscript for integrity against:
 *    a world document and optionally an outline
 * Supports different types of consistency/integrity checks: 
 *    world, internal, development, unresolved
 */
class NarrativeIntegrity extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('narrative_integrity', config);
    this.claudeService = claudeService;
  }
  
  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    // Extract options
    let manuscriptFile = options.manuscript_file;
    let worldFile = options.world_file;
    let outlineFile = options.outline_file;
    const checkType = options.check_type;
    let saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    
    // Check if we have a valid save directory
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }

    // Ensure file paths are absolute by prepending the project path if needed
    manuscriptFile = this.ensureAbsolutePath(manuscriptFile, saveDir);
    worldFile = this.ensureAbsolutePath(worldFile, saveDir);
    if (outlineFile) {
      outlineFile = this.ensureAbsolutePath(outlineFile, saveDir);
    }
    
    // Log the full paths for debugging
    // console.log('Using full paths:');
    // console.log(`Manuscript: ${manuscriptFile}`);
    // console.log(`World: ${worldFile}`);
    // if (outlineFile) {
    //   console.log(`Outline: ${outlineFile}`);
    // }

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
      
      // Read the world file
      this.emitOutput(`Reading world file: ${worldFile}\n`);
      const worldContent = await this.readInputFile(worldFile);
      
      // Prepare check types to run
      const checkTypes = checkType === 'all' 
        ? ['world', 'internal', 'development', 'unresolved']
        : [checkType];
      
      // Run each check type
      for (const type of checkTypes) {
        this.emitOutput(`\nRunning ${type.toUpperCase()} integrity check...\n`);
        
        // Create the prompt for this check type
        const prompt = this.createPrompt(type, outlineContent, worldContent, manuscriptContent);

        // Count tokens in the prompt
        this.emitOutput(`Counting tokens in prompt...\n`);
        const promptTokens = await this.claudeService.countTokens(prompt);

        // Call the shared token budget calculator
        const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);

        // Handle logging based on the returned values
        this.emitOutput(`\nToken stats:\n`);
        this.emitOutput(`Max AI model context window: [${tokenBudgets.contextWindow}] tokens\n`);
        this.emitOutput(`Input prompt tokens: [${tokenBudgets.promptTokens}]\n`);
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
          console.log(`\n*** client.js: execute:\nAPI Error: ${error.message}\n`);
          // client.js: execute:
          // API Error: 400 {
          //     "type":"error",
          //     "error":{
          //       "type":"invalid_request_error",
          //       "message":"input length and `max_tokens` exceed 
          //          context limit: 107398 + 128000 > 200000, 
          //          decrease input length or `max_tokens` and try again"
          //     }}
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

        fullResponse = this.removeMarkdown(fullResponse);

        // Save the report
        const outputFile = await this.saveReport(
          type,
          fullResponse,
          thinkingContent,
          promptTokens,
          responseTokens,
          saveDir
        );
        
        // Use spread operator to push all elements individually
        outputFiles.push(...outputFile);
      }
      
      // Return the result
      return {
        success: true,
        outputFiles,
        stats: {
          checkTypes: checkTypes
        }
      };
    } catch (error) {
      console.error('Error in NarrativeIntegrity:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
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
   * Count words in text
   * @param {string} text - Text to count words in
   * @returns {number} - Word count
   */
  countWords(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }
  
  /**
   * Create prompt based on check type
   * @param {string} checkType - Type of integrity check
   * @param {string} outlineContent - Outline content
   * @param {string} worldContent - World content
   * @param {string} manuscriptContent - Manuscript content
   * @returns {string} - Prompt for Claude API
   */
  createPrompt(checkType, outlineContent, worldContent, manuscriptContent) {
    // cls: to be honest this has no effect:
    const noMarkdown = "IMPORTANT: - NO Markdown formatting";
    
    const prompts = {
      "world": `=== OUTLINE ===
${outlineContent}
=== END OUTLINE ===

=== WORLD ===
${worldContent}
=== END WORLD ===

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor with exceptional attention to detail.
Using the WORLD document as the established source of truth, analyze
the MANUSCRIPT for any inconsistencies or contradictions with the
established facts. Focus on:

1. CHARACTER INTEGRITY:
   - Are characters acting in ways that match their established
     personality traits?
   - Does dialogue reflect their documented speech patterns and
     knowledge level?
   - Are relationships developing consistently with established
     dynamics?
   - Are physical descriptions matching those in the WORLD document?

2. SETTING & WORLD INTEGRITY:
   - Are locations described consistently with their established
     features?
   - Does the manuscript respect the established rules of the world?

3. TIMELINE COHERENCE:
   - Does the manuscript respect the established historical events and
     their sequence?
   - Are there any temporal contradictions with established dates?
   - Is character knowledge appropriate for their place in the
     timeline?
   - Are seasonal elements consistent with the story's temporal
     placement?

4. THEMATIC INTEGRITY:
   - Are the established themes being consistently developed?
   - Are symbolic elements used consistently with their established meanings?

For each inconsistency, lacking integrity, provide:
- The specific element in the manuscript that contradicts the WORLD
- The established fact in the WORLD it contradicts
- The location in the manuscript where this occurs using verbatim text
- A suggested correction that would maintain narrative integrity

Use the extensive thinking space to thoroughly cross-reference the
manuscript against the story's world before identifying issues.
`,

      "internal": `=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor focusing on internal narrative
consistency and integrity. Analyze the MANUSCRIPT to identify elements that are
internally inconsistent or contradictory or lacking integrity, regardless of the
established story world. Focus on:

1. NARRATIVE CONTINUITY:
   - Events that contradict earlier established facts within the
     manuscript itself
   - Description inconsistencies (characters, objects, settings
     changing without explanation)
   - Dialogue that contradicts earlier statements by the same
     character
   - Emotional arcs that show sudden shifts without sufficient
     development

2. SCENE-TO-SCENE COHERENCE:
   - Physical positioning and transitions between locations
   - Time of day and lighting inconsistencies
   - Character presence/absence in scenes without explanation
   - Weather or environmental conditions that change illogically

3. PLOT LOGIC:
   - Character motivations that seem inconsistent with their actions
   - Convenient coincidences that strain credibility
   - Information that characters possess without logical means of
     acquisition
   - Plot developments that contradict earlier established rules or
     limitations

4. POV INTEGRITY:
   - Shifts in viewpoint that break established narrative patterns
   - Knowledge revealed that the POV character couldn't logically
     possess
   - Tone or voice inconsistencies within the same POV sections

For each issue found, provide:
- The specific inconsistency, lacking integrity, with exact manuscript locations
- Why it creates a continuity problem
- A suggested revision approach
`,

      "development": `=== OUTLINE ===
${outlineContent}
=== END OUTLINE ===

=== WORLD ===
${worldContent}
=== END WORLD ===

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor analyzing character and plot
development. Track how key elements evolve throughout the manuscript
and identify any development issues:

1. CHARACTER ARC TRACKING:
   - For each major character, trace their development through the manuscript
   - Identify key transformation moments and their emotional progression
   - Highlight any character development that feels rushed, stalled,
     or inconsistent
   - Note if their arc is following the trajectory established in the
     WORLD document

2. MYSTERY DEVELOPMENT:
   - Track the progression of the central mystery
   - Ensure clues are being revealed at an appropriate pace
   - Identify any critical information that's missing or presented out
     of logical sequence
   - Check if red herrings and misdirections are properly balanced
     with genuine progress

3. RELATIONSHIP EVOLUTION:
   - Track how key relationships develop
   - Ensure relationship changes are properly motivated and paced
   - Identify any significant jumps in relationship dynamics that need
     development

4. THEME DEVELOPMENT:
   - Track how the core themes from the WORLD document are being
     developed
   - Identify opportunities to strengthen thematic elements
   - Note if any established themes are being neglected

Provide a structured analysis showing the progression points for each
tracked element, identifying any gaps, pacing issues, or development
opportunities.
`,

      "unresolved": `=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

${noMarkdown}

You are an expert fiction editor specializing in narrative
completeness. Analyze the MANUSCRIPT to identify elements that have
been set up but not resolved:

1. UNRESOLVED PLOT ELEMENTS:
   - Mysteries or questions raised but not answered
   - Conflicts introduced but not addressed
   - Promises made to the reader (through foreshadowing or explicit
     setup) without payoff
   - Character goals established but not pursued

2. CHEKHOV'S GUNS:
   - Significant objects introduced but not used
   - Skills or abilities established but never employed
   - Locations described in detail but not utilized in the plot
   - Information revealed but not made relevant

3. CHARACTER THREADS:
   - Side character arcs that begin but don't complete
   - Character-specific conflicts that don't reach resolution
   - Backstory elements introduced but not integrated into the main
     narrative
   - Relationship dynamics that are established but not developed

For each unresolved element, provide:
- What was introduced and where in the manuscript
- Why it creates an expectation of resolution
- Suggested approaches for resolution or intentional non-resolution
`
    };
    
    return prompts[checkType] || "";
  }

  /**
   * Save report and thinking content to files
   * @param {string} checkType - Type of integrity check
   * @param {string} content - Response content
   * @param {string} thinking - Thinking content
   * @param {number} promptTokens - Prompt token count
   * @param {number} responseTokens - Response token count
   * @param {string} saveDir - Directory to save to
   * @param {string} description - Optional description
   * @returns {Promise<string[]>} - Array of paths to saved files
   */
  async saveReport(checkType, content, thinking, promptTokens, responseTokens, saveDir, description) {
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
      const dateTimeStr2 = formatter.format(new Date());

      // Create timestamp for filename
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
      
      // Create descriptive filename
      const desc = description ? `_${description}` : '';
      const baseFilename = `narrative_integrity_${checkType}${desc}_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];
      
      // Create stats for thinking file
      const stats = `
Details:  ${dateTimeStr2}
Check type: ${checkType} narrative integrity check
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
        const thinkingContent = `=== NARRATIVE INTEGRITY CHECK TYPE ===
${checkType}

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

module.exports = NarrativeIntegrity;
