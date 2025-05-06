// brainstorm.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * Brainstorm Tool
 * Helps generate initial story ideas, prompts, and creative angles.
 * Appends more ideas to the existing 'ideas.txt' file.
 */
class BrainstormTool extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('brainstorm', config);
    this.claudeService = claudeService;
  }
  
  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    // Clear the cache for this tool
    const toolName = 'brainstorm';
    fileCache.clear(toolName);
    
    // Extract options
    const ideasFile = options.ideas_file;
    const outputFiles = [];
    const conceptOnly = options.concept_only || false;
    const charactersOnly = options.characters_only || false;
    let saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    
    // Validate save directory
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }
    
    // Ensure file paths are absolute
    const absoluteIdeasFile = this.ensureAbsolutePath(ideasFile, saveDir);
    
    try {
      // Read ideas file
      this.emitOutput(`Reading ideas file: ${absoluteIdeasFile}\n`);
      const ideasContent = await this.readIdeasFile(absoluteIdeasFile);
      
      // Generate concept and/or characters based on options
      if (charactersOnly) {
        const outputFile = await this.generateAndAppend("characters", ideasContent, absoluteIdeasFile, saveDir, options);
        outputFiles.push(outputFile);
      } else if (conceptOnly) {
        const outputFile = await this.generateAndAppend("concept", ideasContent, absoluteIdeasFile, saveDir, options);
        outputFiles.push(outputFile);
      } else {
        // Generate both by default
        this.emitOutput("Generating both concept and characters...\n");
        const conceptFile = await this.generateAndAppend("concept", ideasContent, absoluteIdeasFile, saveDir, options);
        outputFiles.push(conceptFile);
        
        // Read updated ideas file after concept generation
        const updatedIdeasContent = await this.readIdeasFile(absoluteIdeasFile);
        const charactersFile = await this.generateAndAppend("characters", updatedIdeasContent, absoluteIdeasFile, saveDir, options);
        outputFiles.push(charactersFile);
      }
      
      this.emitOutput("\nGeneration complete!\n");
      this.emitOutput(`All content has been appended to: ${absoluteIdeasFile}\n`);
      this.emitOutput(`To continue developing this story, use the --continue option with this tool.\n`);
      
      // Return the result
      return {
        success: true,
        outputFiles,
        stats: {
          ideasFile: absoluteIdeasFile
        }
      };
      
    } catch (error) {
      console.error('Error in Brainstorm Tool:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Read ideas file
   * @param {string} filepath - Path to ideas file
   * @returns {Promise<string>} - File content
   */
  async readIdeasFile(filepath) {
    try {
      const content = await this.readInputFile(filepath);
      return content.trim();
    } catch (error) {
      this.emitOutput(`Error: Ideas file '${filepath}' not found or couldn't be read.\n`);
      this.emitOutput(`Please specify an existing ideas file with the ideas_file parameter.\n`);
      throw error;
    }
  }
  
  /**
   * Generate content and append to ideas file
   * @param {string} promptType - Type of prompt ("concept" or "characters")
   * @param {string} ideasContent - Content of ideas file
   * @param {string} ideasFile - Path to ideas file
   * @param {string} saveDir - Directory to save output
   * @param {Object} options - Tool options
   * @returns {Promise<string>} - Path to saved file
   */
  async generateAndAppend(promptType, ideasContent, ideasFile, saveDir, options) {
    // Create appropriate prompt
    let prompt;
    if (promptType === "concept") {
      prompt = this.createConceptPrompt(ideasContent, options);
    } else { // characters
      prompt = this.createCharacterPrompt(ideasContent, options);
    }

    this.emitOutput(`\n*** Working on: ${promptType}.txt file...\n`);

    // Count tokens in the prompt
    this.emitOutput(`Counting tokens in prompt...\n`);
    const promptTokens = await this.claudeService.countTokens(prompt);

    // Call the shared token budget calculator
    const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);

    // Handle logging based on the returned values
    this.emitOutput(`Token stats:\n`);
    this.emitOutput(`Max AI model context window: [${tokenBudgets.contextWindow}] tokens\n`);
    this.emitOutput(`Input prompt tokens: [${tokenBudgets.promptTokens}] ...\n`);
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
    const systemPrompt = "NO Markdown! Never respond with Markdown formatting, plain text only.";

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
    
    // No need to remove markdown formatting - trust the API response directly
    const cleanedResponse = fullResponse;
    
    // Count words in response
    const wordCount = this.countWords(cleanedResponse);
    this.emitOutput(`Generated ${promptType} has approximately ${wordCount} words.\n`);
    
    // Count tokens in response
    const responseTokens = await this.claudeService.countTokens(cleanedResponse);
    this.emitOutput(`Response token count: ${responseTokens}\n`);
    
    // Append to ideas file
    await this.appendToIdeasFile(ideasFile, cleanedResponse, promptType);
    this.emitOutput(`Content appended to: ${ideasFile}\n`);
    
    // Save a backup copy
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const backupFilename = `${promptType}_${timestamp}.txt`;
    const backupPath = path.join(saveDir, backupFilename);
    await this.writeOutputFile(cleanedResponse, saveDir, backupFilename);
    this.emitOutput(`Backup saved to: ${backupPath}\n`);
    
    // Add to the file cache
    fileCache.addFile('brainstorm', backupPath);
    
    // Save thinking content if not skipped
    if (thinkingContent) {
      const thinkingFilename = `${promptType}_thinking_${timestamp}.txt`;
      const thinkingPath = path.join(saveDir, thinkingFilename);
      
      // Stats for thinking file
      const stats = `
Details:
Max request timeout: ${this.config.request_timeout} seconds
Max AI model context window: ${this.config.context_window} tokens
AI model thinking budget: ${this.config.thinking_budget_tokens} tokens
Desired output tokens: ${this.config.desired_output_tokens} tokens

Input tokens: ${promptTokens}
Output tokens: ${responseTokens}
Elapsed time: ${minutes}m ${seconds.toFixed(2)}s
Output has ${wordCount} words
`;
      
      const thinkingContentWithPrompt = `=== PROMPT USED ===
${prompt}

=== AI'S THINKING PROCESS ===

${thinkingContent}

=== END AI'S THINKING PROCESS ===
${stats}`;
      
      await this.writeOutputFile(thinkingContentWithPrompt, saveDir, thinkingFilename);
      this.emitOutput(`AI thinking saved to: ${thinkingPath}\n`);
      
      // Add thinking file to the cache too
      fileCache.addFile('brainstorm', thinkingPath);
    }
    
    return backupPath;
  }
  
  /**
   * Append content to ideas file
   * @param {string} filepath - Path to ideas file
   * @param {string} newContent - New content to append
   * @param {string} contentType - Type of content ("Concept" or "Characters")
   * @returns {Promise<void>}
   */
  async appendToIdeasFile(filepath, newContent, contentType) {
    try {
      // Read existing content
      let existingContent = await fs.readFile(filepath, 'utf8');
      
      // Format content type with proper capitalization
      const formattedType = contentType.charAt(0).toUpperCase() + contentType.slice(1);
      
      // Get current timestamp
      const timestamp = new Date().toLocaleString();
      
      // Format new content to append
      const contentToAppend = `\n\n# ${formattedType} (Generated ${timestamp})\n\n${newContent}`;
      
      // Append to file
      await fs.writeFile(filepath, existingContent + contentToAppend);
    } catch (error) {
      this.emitOutput(`Error appending to ideas file: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create concept prompt
   * @param {string} ideasContent - Content of ideas file
   * @param {Object} options - Tool options
   * @returns {string} - Concept prompt
   */
  createConceptPrompt(ideasContent, options) {
    const continueFlag = options.continue && ideasContent ? 
      "Continue and expand on the existing concept. Add new details and develop existing ideas further." : "";
    
    const titleSuggestion = options.title ? `TITLE: ${options.title}` : "";
    const genreSuggestion = options.genre ? `GENRE: ${options.genre}` : "";
    const lang = options.lang || "English";
    const worldbuildingDepth = options.worldbuilding_depth || 3;
    
    return `You are a skilled novelist and worldbuilder helping to create a detailed concept document in fluent, authentic ${lang}.
Draw upon your knowledge of worldwide literary traditions, narrative structure, and worldbuilding approaches from across cultures,
while expressing everything in natural, idiomatic ${lang}.

=== IDEAS FILE CONTENT ===
${ideasContent}
${titleSuggestion}
${genreSuggestion}
=== END IDEAS FILE CONTENT ===

${continueFlag}

Create a detailed concept document that explores and develops this writing idea. Focus on worldbuilding, setting, themes, and plot possibilities.
The depth level requested is ${worldbuildingDepth}/5, so adjust your detail accordingly.

Structure your response as a CONCEPT DOCUMENT with these clearly labeled sections:

1. HIGH CONCEPT (1-2 paragraphs summarizing the core idea)
2. WORLD/SETTING (detailed description of the world, era, technology, social structures, etc.)
3. CENTRAL CONFLICT (the main tension driving the story)
4. THEMES & MOTIFS (3-5 major themes to be explored)
5. UNIQUE ELEMENTS (what makes this concept fresh and original)
6. PLOT POSSIBILITIES (2-3 paragraphs on possible story directions)
7. TONE & ATMOSPHERE (the feeling and mood of the story)
8. WORLDBUILDING NOTES (10-15 specific details about how this world works)

IMPORTANT FORMATTING INSTRUCTIONS:
1. DO NOT use Markdown formatting (no #, ##, ###, *, **, etc.)
2. Start with "CONCEPT DOCUMENT:" at the top of your response
3. Use plain text section headers like "HIGH CONCEPT:"
4. Use plain numbered or bullet lists where appropriate
5. Keep your writing clear, concise, and creative
6. This content will be appended to an ideas file for writing development`;
  }
  
  /**
   * Create character prompt
   * @param {string} ideasContent - Content of ideas file
   * @param {Object} options - Tool options
   * @returns {string} - Character prompt
   */
  createCharacterPrompt(ideasContent, options) {
    const continueFlag = options.continue && ideasContent ? 
      "Review the existing characters in the ideas file. Build on these characters by expanding their details and deepening their characterization. If appropriate, create additional characters to reach the requested total number." : "";
    
    const titleSuggestion = options.title ? `TITLE: ${options.title}` : "";
    const genreSuggestion = options.genre ? `GENRE: ${options.genre}` : "";
    const lang = options.lang || "English";
    const numCharacters = options.num_characters || 5;
    const includeRelationships = options.character_relationships;
    
    // Determine character name handling based on arguments
    let characterNameInstructions = "";
    if (options.allow_new_characters) {
      characterNameInstructions = `
You are permitted to create new characters that fit the concept.
Create characters that align with and enhance the world, themes, and plot described in the ideas file.
Use Title Case (camel-case) for all character names.`;
    } else {
      characterNameInstructions = `
STRICT CHARACTER NAME INSTRUCTIONS:
- You MUST use ONLY the exact character names provided in: === CHARACTERS === through === END CHARACTERS === section, if provided
- DO NOT create any new character names not in: === CHARACTERS === through === END CHARACTERS ===
- DO NOT modify, expand, or add to the character names in any way (no adding first/last names, titles, etc.)
- Keep the exact capitalization/title case of each name as provided
- If a character has only a first name or nickname in the list, use ONLY that exact name
- If a character is referred to differently in different parts of the ideas file, use ONLY the specific format provided in the list

BACKGROUND CHARACTER INSTRUCTIONS:
- For incidental characters who briefly appear in scenes (cashiers, waiters, doormen, passersby, etc.), refer to them ONLY by their role or function (e.g., "the cashier," "the doorman").
- DO NOT assign names to these background characters unless they become recurring or important to the plot.
- DO NOT develop backstories for these functional characters.
- Background characters should only perform actions directly related to their function or brief interaction with named characters.
- Keep interactions with background characters brief and purposeful - they should serve the story without becoming story elements themselves.
- If a background character needs to speak, use phrases like "the clerk asked" rather than creating a name.
- Remember that background characters exist to create a realistic world but should remain in the background to keep focus on the main characters and plot.`;
    }
    
    return `You are a skilled novelist and character developer helping to create detailed character descriptions in fluent, authentic ${lang}.
Draw upon your knowledge of worldwide literary traditions, character development, and psychological complexity from across cultures,
while expressing everything in natural, idiomatic ${lang}.

=== IDEAS FILE CONTENT ===
${ideasContent}
${titleSuggestion}
${genreSuggestion}
=== END IDEAS FILE CONTENT ===

${characterNameInstructions}

${continueFlag}

Create details for ${numCharacters} characters that would fit well in this story concept.

Structure your response as a CHARACTER DOCUMENT with these elements for EACH character:

1. NAME & ROLE (full name and their function in the story)
2. PHYSICAL DESCRIPTION (key physical traits and appearance)
3. PERSONALITY (core character traits, strengths, flaws)
4. BACKGROUND (relevant history and formative experiences)
5. MOTIVATION (what drives this character)
6. ARC (how this character might change throughout the story)
7. SPECIAL SKILLS/ABILITIES (what makes them effective in this world)
${includeRelationships ? "8. RELATIONSHIPS (how they connect to other characters)" : ""}

IMPORTANT FORMATTING INSTRUCTIONS:
1. DO NOT use Markdown formatting (no #, ##, ###, *, **, etc.)
2. Number each character entry like "1. Character Name"
3. Use plain text for character details with bullet points or dashes
4. For each character attribute use a dash or bullet format like:
   - role: protagonist
   - personality: determined, resourceful
5. Separate each character with a blank line
6. Keep your writing clear, concise, and psychologically insightful
7. This content will be appended to an ideas file for writing development`;
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

module.exports = BrainstormTool;
