// manuscript-to-outline-characters-world.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * ManuscriptToOutlineCharactersWorld Tool
 * Analyzes a manuscript file and generates three output files:
 * 1. outline.txt - Structured outline of the manuscript
 * 2. characters.txt - List of characters from the manuscript
 * 3. world.txt - Description of the world/setting in the manuscript
 */
class ManuscriptToOutlineCharactersWorld extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('manuscript_to_outline_characters_world', config);
    this.claudeService = claudeService;
  }
  
  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing ManuscriptToOutlineCharactersWorld with options:', options);
    console.log('appState.CURRENT_PROJECT=', appState.CURRENT_PROJECT);

    // Extract options
    let manuscriptFile = options.manuscript_file;
    const description = options.description;

    // the only logical OR allowed:
    const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    console.log('execute: saveDir', saveDir);
    
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                       'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }

    // Ensure manuscript file is provided
    if (!manuscriptFile) {
      const errorMsg = 'Error: No manuscript file specified.\n' +
                       'Please specify a manuscript file with the manuscript_file parameter.';
      this.emitOutput(errorMsg);
      throw new Error('No manuscript file specified');
    }

    // Ensure file paths are absolute
    manuscriptFile = this.ensureAbsolutePath(manuscriptFile, saveDir);
    
    // Log the full paths for debugging
    console.log('Using manuscript file:', manuscriptFile);

    const outputFiles = [];
    
    try {
      // Read the manuscript file
      this.emitOutput(`Reading manuscript file: ${manuscriptFile}\n`);
      const manuscriptContent = await this.readInputFile(manuscriptFile);
      
      const outlineFile = await this.generateOutline(manuscriptContent, saveDir, description);
      outputFiles.push(outlineFile);
    
      const charactersFile = await this.generateCharacters(manuscriptContent, saveDir, description);
      outputFiles.push(charactersFile);
    
      const worldFile = await this.generateWorld(manuscriptContent, saveDir, description);
      outputFiles.push(worldFile);
      
      // Add files to the cache
      const toolName = 'manuscript_to_outline_characters_world';
      outputFiles.forEach(file => {
        fileCache.addFile(toolName, file);
      });
      
      // Return the result
      return {
        success: true,
        outputFiles
      };
    } catch (error) {
      console.error('Error in ManuscriptToOutlineCharactersWorld:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Generate outline from manuscript
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} saveDir - Directory to save to
   * @param {string} description - Optional description
   * @returns {Promise<string>} - Path to the saved outline file
   */
  async generateOutline(manuscriptContent, saveDir, description) {
    this.emitOutput(`\n\nGenerating outline...\n`);
    
    // Create the prompt for outline
    const prompt = this.createOutlinePrompt(manuscriptContent);
    
    // Call Claude API
    const { content, thinking, promptTokens, responseTokens } = await this.callClaudeAPI(prompt, 'Outline');
    
    // Save the outline to a file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const desc = description ? `_${description}` : '';
    const outlineFilename = `outline${desc}_${timestamp}.txt`;
    const outlinePath = path.join(saveDir, outlineFilename);
    
    await this.writeOutputFile(content, saveDir, outlineFilename);
    this.emitOutput(`Outline saved to: ${outlinePath}\n`);
    
    // Save thinking if available and not skipped
    // if (thinking) {
    //   const thinkingFilename = `outline_thinking${desc}_${timestamp}.txt`;
    //   await this.saveThinking(thinking, saveDir, thinkingFilename, promptTokens, responseTokens, 'Outline');
    // }
    
    return outlinePath;
  }
  
  /**
   * Generate characters list from manuscript
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} saveDir - Directory to save to
   * @param {string} description - Optional description
   * @returns {Promise<string>} - Path to the saved characters file
   */
  async generateCharacters(manuscriptContent, saveDir, description) {
    this.emitOutput(`\n\nGenerating characters list...\n`);
    
    // Create the prompt for character
    const prompt = this.createCharactersPrompt(manuscriptContent);
    
    // Call Claude API
    const { content, thinking, promptTokens, responseTokens } = await this.callClaudeAPI(prompt, 'Characters');
    
    // Save the characters to a file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const desc = description ? `_${description}` : '';
    const charactersFilename = `characters${desc}_${timestamp}.txt`;
    const charactersPath = path.join(saveDir, charactersFilename);
    
    await this.writeOutputFile(content, saveDir, charactersFilename);
    this.emitOutput(`Characters saved to: ${charactersPath}\n`);
    
    // Save thinking if available and not skipped
    // if (thinking) {
    //   const thinkingFilename = `characters_thinking${desc}_${timestamp}.txt`;
    //   await this.saveThinking(thinking, saveDir, thinkingFilename, promptTokens, responseTokens, 'Characters');
    // }
    
    return charactersPath;
  }
  
  /**
   * Generate world description from manuscript
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} saveDir - Directory to save to
   * @param {string} description - Optional description
   * @returns {Promise<string>} - Path to the saved world file
   */
  async generateWorld(manuscriptContent, saveDir, description) {
    this.emitOutput(`\n\nGenerating world description...\n`);
    
    // Create the prompt for world
    const prompt = this.createWorldPrompt(manuscriptContent);
    
    // Call Claude API
    const { content, thinking, promptTokens, responseTokens } = await this.callClaudeAPI(prompt, 'World');
    
    // Save the world description to a file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const desc = description ? `_${description}` : '';
    const worldFilename = `world${desc}_${timestamp}.txt`;
    const worldPath = path.join(saveDir, worldFilename);
    
    await this.writeOutputFile(content, saveDir, worldFilename);
    this.emitOutput(`World description saved to: ${worldPath}\n`);
    
    // Save thinking if available and not skipped
    // if (thinking) {
    //   const thinkingFilename = `world_thinking${desc}_${timestamp}.txt`;
    //   await this.saveThinking(thinking, saveDir, thinkingFilename, promptTokens, responseTokens, 'World');
    // }
    
    return worldPath;
  }
  
  /**
   * Call Claude API with thinking
   * @param {string} prompt - Prompt for Claude API
   * @param {string} label - Label for logging
   * @returns {Promise<Object>} - API response
   */
  async callClaudeAPI(prompt, label) {
    // Count tokens in the prompt
    this.emitOutput(`Counting tokens for: ${label} prompt...\n`);
    const promptTokens = await this.claudeService.countTokens(prompt);

    // Call the shared token budget calculator
    const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);

    // Handle logging based on the returned values
    this.emitOutput(`\n${label} Token stats:\n`);
    this.emitOutput(`Max AI model context window: [${tokenBudgets.contextWindow}] tokens\n`);
    this.emitOutput(`Input prompt tokens: [${tokenBudgets.promptTokens}] tokens\n`);
    this.emitOutput(`Available tokens: [${tokenBudgets.availableTokens}] tokens\n`);
    this.emitOutput(`Desired output tokens: [${tokenBudgets.desiredOutputTokens}] tokens\n`);
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
    this.emitOutput(`\n\nSending request to Claude API (streaming) for ${label}...\n`);
    
    // Add a message about waiting
    this.emitOutput(`****************************************************************************\n`);
    this.emitOutput(`*  Generating ${label} content from your manuscript...                     \n`);
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
    
    this.emitOutput(`\n${label} generation completed in ${minutes}m ${seconds.toFixed(2)}s.\n`);
    
    // Count words in response
    const wordCount = this.countWords(fullResponse);
    this.emitOutput(`${label} has approximately ${wordCount} words.\n`);
    
    // Count tokens in response
    const responseTokens = await this.claudeService.countTokens(fullResponse);
    this.emitOutput(`${label} response token count: ${responseTokens}\n`);

    // Remove any markdown formatting
    fullResponse = this.removeMarkdown(fullResponse);
    
    return {
      content: fullResponse,
      thinking: thinkingContent,
      promptTokens,
      responseTokens
    };
  }
  
  /**
   * Save thinking content to file
   * @param {string} thinking - Thinking content
   * @param {string} saveDir - Directory to save to
   * @param {string} filename - Filename for thinking content
   * @param {number} promptTokens - Prompt token count
   * @param {number} responseTokens - Response token count
   * @param {string} label - Label for the thinking content
   */
  async saveThinking(thinking, saveDir, filename, promptTokens, responseTokens, label) {
    const thinkingPath = path.join(saveDir, filename);
    
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
    
    // Create stats for thinking file
    const stats = `
Details:  ${dateTimeStr}
Analysis type: ${label} from manuscript
Max request timeout: ${this.config.request_timeout} seconds
Max AI model context window: ${this.config.context_window} tokens
AI model thinking budget: ${this.config.thinking_budget_tokens} tokens
Desired output tokens: ${this.config.desired_output_tokens} tokens

Input tokens: ${promptTokens}
Output tokens: ${responseTokens}
`;
    
    const thinkingContent = `=== ${label.toUpperCase()} EXTRACTION ===

=== AI'S THINKING PROCESS ===

${thinking}

=== END AI'S THINKING PROCESS ===
${stats}`;
    
    await this.writeOutputFile(thinkingContent, saveDir, filename);
    this.emitOutput(`AI thinking saved to: ${thinkingPath}\n`);
  }
  
  /**
   * Create outline extraction prompt
   * @param {string} manuscriptContent - Manuscript content
   * @returns {string} - Prompt for Claude API
   */
  createOutlinePrompt(manuscriptContent) {
    return `=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

=== PROJECT TITLE ===
${appState.CURRENT_PROJECT}
=== END PROJECT TITLE ===

CRITICAL INSTRUCTION: This project is titled "${appState.CURRENT_PROJECT}". Do NOT create or suggest a new title. Always refer to this work by its existing title shown above.

IMPORTANT: NO Markdown formatting

You are an expert fiction editor and story analyst. Your task is to extract a detailed outline from the provided manuscript. Create an outline that includes chapter divisions, key plot points, and story structure.

Focus on:

1. OVERALL STORY STRUCTURE:
   - Identify the major sections or acts of the story
   - Note key turning points in the narrative
   - Outline the main storyline from beginning to end

2. CHAPTER BREAKDOWN:
   - Create outline entries for each chapter or major section
   - Provide a title or number for each chapter
   - Summarize the key events and developments in each chapter

3. SCENE MAPPING:
   - Within each chapter, note important scene transitions
   - Identify significant locations, time periods, or POV shifts
   - Track subplot developments

The outline should be comprehensive enough to serve as a blueprint for the entire story, capturing all major developments and character arcs. Use ONLY plain text formatting with standard paragraph structure.

Format the outline consistently, with clear chapter/section designations. Use numbering for chapters and dashes for bullet points rather than Markdown symbols. The outline should be usable as a reference document for other editing tools.`;
  }
  
  /**
   * Create characters extraction prompt
   * @param {string} manuscriptContent - Manuscript content
   * @returns {string} - Prompt for Claude API
   */
  createCharactersPrompt(manuscriptContent) {
    return `=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

=== PROJECT TITLE ===
${appState.CURRENT_PROJECT}
=== END PROJECT TITLE ===

CRITICAL INSTRUCTION: This project is titled "${appState.CURRENT_PROJECT}". Do NOT create or suggest a new title. Always refer to this work by its existing title shown above.

IMPORTANT: NO Markdown formatting

You are an expert fiction editor and character analyst. Your task is to extract a comprehensive list of characters from the provided manuscript. Create detailed character profiles for all significant characters in the story.

Focus on:

1. CHARACTER IDENTIFICATION:
   - Identify ALL named characters in the manuscript
   - Note characters who appear multiple times or have significant roles
   - Include minor but notable characters

2. CHARACTER PROFILES:
   - For each significant character, provide:
     a) Full name and any aliases or titles
     b) Role in the story (protagonist, antagonist, supporting character, etc.)
     c) Physical description based on details in the manuscript
     d) Personality traits and characteristics shown in the text
     e) Background information revealed in the manuscript
     f) Key relationships with other characters
     g) Character arc or development through the story

3. CHARACTER HIERARCHY:
   - Clearly distinguish between main characters, supporting characters, and minor characters
   - Group related characters (families, teams, organizations)
   - Note characters' relative importance to the plot

The character list should be comprehensive and detailed enough to serve as a reference document for the story. Use ONLY plain text formatting with standard paragraph structure and indentation.

Format each character profile consistently, starting with the character's name followed by their details. Use dashes for bullet points rather than Markdown symbols. The character list should be usable as a reference document for other editing tools.`;
  }
  
  /**
   * Create world extraction prompt
   * @param {string} manuscriptContent - Manuscript content
   * @returns {string} - Prompt for Claude API
   */
  createWorldPrompt(manuscriptContent) {
    return `=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

=== PROJECT TITLE ===
${appState.CURRENT_PROJECT}
=== END PROJECT TITLE ===

CRITICAL INSTRUCTION: This project is titled "${appState.CURRENT_PROJECT}". Do NOT create or suggest a new title. Always refer to this work by its existing title shown above.

IMPORTANT: NO Markdown formatting

You are an expert fiction editor and world-building analyst. Your task is to extract a comprehensive description of the story world from the provided manuscript. Create a detailed document that catalogs the setting, rules, history, and other world elements.

Focus on:

1. SETTING OVERVIEW:
   - Identify the time period and general setting of the story
   - Note the primary locations and environments
   - Describe the overall atmosphere and mood of the world

2. WORLD ELEMENTS:
   - Physical geography and locations
   - Social structures, governments, and organizations
   - Cultural elements, customs, and traditions
   - Technology, magic systems, or special rules of the world
   - Historical events mentioned that shape the current world

3. WORLD RULES AND LOGIC:
   - Identify any special rules or laws (natural, supernatural, or societal)
   - Note unique aspects of how this world functions
   - Document any limitations or constraints established in the text

The world description should be comprehensive enough to serve as a reference for understanding the story's setting and rules. Use ONLY plain text formatting with standard paragraph structure.

Format the world document with clear sections and consistent structure. Use dashes for bullet points rather than Markdown symbols. The document should be usable as a reference for other editing tools.`;
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

module.exports = ManuscriptToOutlineCharactersWorld;
