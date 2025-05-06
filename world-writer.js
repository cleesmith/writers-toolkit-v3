// world-writer.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * WorldWriter Tool
 * Extract and develop characters and world elements from a novel outline.
 * It requires: title, POV, and characters.txt and outline.txt.
 */
class WorldWriter extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('world_writer', config);
    this.claudeService = claudeService;
    // console.log('WorldWriter Tool initialized with config:', config);
  }
  
  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing WorldWriter with options:', options);
    
    // Clear the cache for this tool
    const toolName = 'world_writer';
    fileCache.clear(toolName);
    
    // Extract options
    const title = options.title;
    const pov = options.pov;
    const charactersFile = options.characters_file;
    const outlineFile = options.outline_file;
    const language = options.lang || 'English';
    const detailed = options.detailed || false;
    
    const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    const outputFiles = [];
    
    // Validate save directory
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }
    
    // Validate required fields
    if (!title) {
      const errorMsg = 'Error: Title is required.\n';
      this.emitOutput(errorMsg);
      throw new Error('Title is required');
    }
    
    if (!pov) {
      const errorMsg = 'Error: Point of view (pov) is required.\n';
      this.emitOutput(errorMsg);
      throw new Error('Point of view is required');
    }
    
    try {
      // Read characters file (required)
      this.emitOutput(`Reading characters file: ${charactersFile}\n`);
      const charactersContent = await this.readInputFile(this.ensureAbsolutePath(charactersFile, saveDir));
      
      // Read outline file (required)
      this.emitOutput(`Reading outline file: ${outlineFile}\n`);
      const outlineContent = await this.readInputFile(this.ensureAbsolutePath(outlineFile, saveDir));
      
      // Create prompt
      const prompt = this.createPrompt(
        title,
        pov,
        charactersContent,
        outlineContent,
        language,
        detailed
      );
      
      // Count tokens in prompt
      this.emitOutput(`Counting tokens in prompt...\n`);
      const promptTokens = await this.claudeService.countTokens(prompt);
      
      // Calculate available tokens after prompt
      const contextWindow = this.config.context_window || 200000;
      const desiredOutputTokens = this.config.desired_output_tokens || 12000;
      const configuredThinkingBudget = this.config.thinking_budget_tokens || 32000;
      
      const availableTokens = contextWindow - promptTokens;
      
      // For API call, max_tokens must respect the API limit
      const maxTokens = Math.min(availableTokens, 128000); // Limited by beta feature
      
      // Thinking budget must be LESS than max_tokens to leave room for visible output
      let thinkingBudget = maxTokens - desiredOutputTokens;
      if (thinkingBudget > 32000) {
        this.emitOutput("Warning: thinking budget is larger than 32K, set to 32K.\n");
        thinkingBudget = 32000;
      }
      
      // Display token stats
      this.emitOutput(`\nToken stats:\n`);
      this.emitOutput(`Max AI model context window: [${contextWindow}] tokens\n`);
      this.emitOutput(`Input prompt tokens: [${promptTokens}] ...\n`);
      this.emitOutput(`                     = characters + outline + prompt instructions\n`);
      this.emitOutput(`Available tokens: [${availableTokens}]  = ${contextWindow} - ${promptTokens} = context_window - prompt\n`);
      this.emitOutput(`Desired output tokens: [${desiredOutputTokens}]\n`);
      this.emitOutput(`AI model thinking budget: [${thinkingBudget}] tokens  = ${maxTokens} - ${desiredOutputTokens}\n`);
      this.emitOutput(`Max output tokens (max_tokens): [${maxTokens}] tokens  = min(${availableTokens}, 128000)\n`);
      this.emitOutput(`                                = can not exceed: 'betas=["output-128k-2025-02-19"]'\n`);
      
      // Check if prompt is too large for the configured thinking budget
      if (thinkingBudget < configuredThinkingBudget) {
        this.emitOutput(`Error: prompt is too large to have a ${configuredThinkingBudget} thinking budget!\n`);
        this.emitOutput(`Run aborted!\n`);
        throw new Error(`Prompt is too large for ${configuredThinkingBudget} thinking budget - run aborted`);
      }
      
      // Call Claude API with streaming
      this.emitOutput(`\nGenerating world document (including characters) for novel: ${title}\n`);
      this.emitOutput(`Sending request to Claude API (streaming)...\n`);
      
      // Add a message about waiting
      this.emitOutput(`****************************************************************************\n`);
      this.emitOutput(`*  Generating world document with character profiles...\n`);
      this.emitOutput(`*  This process typically takes several minutes.\n`);
      this.emitOutput(`*  \n`);
      this.emitOutput(`*  It's recommended to keep this window the sole 'focus'\n`);
      this.emitOutput(`*  and to avoid browsing online or running other apps, as these API\n`);
      this.emitOutput(`*  network connections are often flakey, like delicate echoes of whispers.\n`);
      this.emitOutput(`*  \n`);
      this.emitOutput(`*  So breathe, remove eye glasses, stretch, relax, and be like water 🥋 🧘🏽‍♀️\n`);
      this.emitOutput(`****************************************************************************\n\n`);
      
      const startTime = Date.now();
      let fullResponse = "";
      let thinkingContent = "";
      
      // Create system prompt to avoid markdown
      const systemPrompt = "NO Markdown! Never respond with Markdown formatting, plain text only.";
      
      try {
        // Use streaming API call
        await this.claudeService.streamWithThinking(
          prompt,
          {
            model: "claude-3-7-sonnet-20250219",
            system: systemPrompt,
            max_tokens: maxTokens,
            thinking: {
              type: "enabled",
              budget_tokens: thinkingBudget
            },
            betas: ["output-128k-2025-02-19"]
          },
          // Callback for thinking content
          (thinkingDelta) => {
            thinkingContent += thinkingDelta;
          },
          // Callback for response text - simply accumulate without progress indicators
          (textDelta) => {
            fullResponse += textDelta;
          }
        );
      } catch (error) {
        this.emitOutput(`\nAPI Error: ${error.message}\n`);
        throw error;
      }
      
      // Calculate time elapsed
      const elapsed = (Date.now() - startTime) / 1000;
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      
      this.emitOutput(`\nWorld document completed in: ${minutes}m ${seconds.toFixed(2)}s.\n`);
      
      // Count words in response
      const wordCount = this.countWords(fullResponse);
      this.emitOutput(`World document has approximately ${wordCount} words.\n`);
      
      // Count tokens in response
      const responseTokens = await this.claudeService.countTokens(fullResponse);
      this.emitOutput(`World document token count: ${responseTokens}\n`);
      
      // Save the world document to a file
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
      const worldFilename = `world_${timestamp}.txt`;
      const worldPath = path.join(saveDir, worldFilename);
      
      await this.writeOutputFile(fullResponse, saveDir, worldFilename);
      this.emitOutput(`World document saved to: ${worldPath}\n`);
      
      // Add to output files list
      outputFiles.push(worldPath);
      
      // Add to the file cache
      fileCache.addFile(toolName, worldPath);
      
      // Save thinking content if available and not skipped
      if (thinkingContent) {
        const thinkingFilename = `world_thinking_${timestamp}.txt`;
        
        // Create stats for thinking file
        const stats = `
Stats:
Prompt tokens: ${promptTokens}
Elapsed time: ${minutes} minutes, ${seconds.toFixed(2)} seconds
Word count: ${wordCount}
`;
        
        const thinkingContent2 = `=== PROMPT USED (EXCLUDING REFERENCE CONTENT) ===
Generating world document (including characters) for novel: ${title}

=== AI'S THINKING PROCESS ===

${thinkingContent}

=== END AI'S THINKING PROCESS ===
${stats}

Files saved to: ${saveDir}
###`;
        
        await this.writeOutputFile(thinkingContent2, saveDir, thinkingFilename);
        const thinkingPath = path.join(saveDir, thinkingFilename);
        this.emitOutput(`AI thinking saved to: ${thinkingPath}\n`);
        
        // Add thinking file to output files and cache
        outputFiles.push(thinkingPath);
        fileCache.addFile(toolName, thinkingPath);
      }
      
      this.emitOutput(`\nFiles saved to: ${saveDir}\n`);
      this.emitOutput(`###\n`);
      
      // Return the result
      return {
        success: true,
        outputFiles,
        stats: {
          wordCount,
          tokenCount: responseTokens,
          elapsedTime: `${minutes}m ${seconds.toFixed(2)}s`
        }
      };
      
    } catch (error) {
      console.error('Error in WorldWriter:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create prompt for world document generation
   * @param {string} title - Novel title
   * @param {string} pov - Point of view
   * @param {string} charactersContent - Characters content
   * @param {string} outlineContent - Outline content
   * @param {string} language - Language
   * @param {boolean} detailed - Whether to generate detailed profiles
   * @returns {string} - Prompt for Claude API
   */
  createPrompt(
    title,
    pov,
    charactersContent,
    outlineContent,
    language,
    detailed
  ) {
    // Start with the basic world prompt
    let prompt = `You are a skilled novelist, worldbuilder, and character developer helping to create a comprehensive world document in fluent, authentic ${language}.
This document will include both the world elements and detailed character profiles for a novel based on the outline below.

=== OUTLINE ===
${outlineContent}
=== END OUTLINE ===

Create a detailed world document with the following sections:

----------------------------------------------
WORLD: ${title}
----------------------------------------------

1. SETTING OVERVIEW:
   - Time period and era
   - General geography and environment
   - Notable locations mentioned in the outline

2. SOCIAL STRUCTURE:
   - Government or ruling systems
   - Social classes or hierarchies
   - Cultural norms and values

3. HISTORY:
   - Major historical events that impact the story
   - Historical figures relevant to the plot
   - Timeline of important developments

4. TECHNOLOGY AND MAGIC:
   - Level of technological development
   - Technological systems or devices crucial to the plot
   - If applicable: magic systems, supernatural elements, or fantastic creatures

5. ECONOMY:
   - Economic systems
   - Resources and trade
   - Economic conflicts relevant to the story

6. THEMES AND SYMBOLS:
   - Recurring motifs and symbols
   - Philosophical or moral questions explored
   - Cultural or religious symbolism

7. RULES OF THE WORLD:
   - Laws (both legal and natural/supernatural)
   - Limitations and constraints
   - Unique aspects of how this world functions

8. CHARACTER PROFILES:
`;

    // Add character profile instructions
    prompt += `
   For each of the following characters, create a detailed profile but do NOT change the character names:

    === CHARACTERS ===
    ${charactersContent}
    === END CHARACTERS ===

   Include for each character:

   a) CHARACTER NAME: [Full name]
   b) ROLE: [Protagonist, Antagonist, Supporting Character, etc.]
   c) AGE: [Age or age range]
   d) PHYSICAL DESCRIPTION: [Detailed physical appearance]
   e) BACKGROUND: [Personal history relevant to the story]
   f) PERSONALITY: [Core personality traits, strengths, and flaws]
   g) MOTIVATIONS: [What drives this character? What do they want?]
   h) CONFLICTS: [Internal struggles and external conflicts]
   i) RELATIONSHIPS: [Important relationships with other characters]
   j) ARC: [How this character changes throughout the story]
   k) NOTABLE QUOTES: [3-5 examples of how this character might speak]`;

    // Add detailed character profile elements if requested
    if (detailed) {
      prompt += `
   l) SKILLS & ABILITIES: [Special skills, knowledge, or supernatural abilities]
   m) HABITS & QUIRKS: [Distinctive behaviors and mannerisms]
   n) SECRETS: [What this character is hiding]
   o) FEARS & WEAKNESSES: [What makes this character vulnerable]
   p) SYMBOLIC ELEMENTS: [Any symbolic elements associated with this character]
   q) NARRATIVE FUNCTION: [How this character serves the themes and plot]
`;
    }

    // Add formatting instructions
    prompt += `
IMPORTANT FORMATTING INSTRUCTIONS:
- Write in ${pov}
- Make the existing character profiles deep and psychologically nuanced
- Ensure the existing character motivations are complex and realistic
- Ensure the existing characters have traits and backgrounds that naturally arise from the world of the story
- Ensure the existing characters will create interesting dynamics and conflicts with each other
- Keep all details consistent with the outline and list of characters
- Focus on elements that directly impact the characters and plot
- Provide enough detail to give the world depth while leaving room for creative development
- Ensure the world elements support and enhance the narrative
- Separate each major section with a line of dashes (------)
- Separate each character profile with a line of dashes (------)
- Be consistent in formatting throughout the document
- Use plain text formatting with NO markdown in your outputs
- Do NOT change nor add to character names
`;

    return prompt;
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
}

module.exports = WorldWriter;