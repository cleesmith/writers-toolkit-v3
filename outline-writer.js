// outline-writer.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * OutlineWriter Tool
 * Generates a plot outline from your brainstorming file.
 * You can provide your own outline skeleton and let the AI fill in details.
 */
class OutlineWriter extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('outline_writer', config);
    this.claudeService = claudeService;
    // console.log('OutlineWriter Tool initialized with config:', config);
  }
  
  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing OutlineWriter with options:', options);
    
    // Clear the cache for this tool
    const toolName = 'outline_writer';
    fileCache.clear(toolName);
    
    // Extract options
    const premiseFile = options.premise_file;
    const conceptFile = options.concept_file || null;
    const charactersFile = options.characters_file || null;
    const exampleOutline = options.example_outline || null;
    const sections = options.sections || 5;
    const chapters = options.chapters || 25;
    const language = options.lang || 'English';
    const title = options.title || null;
    const genre = options.genre || null;
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
    
    try {
      // Read premise file (required)
      this.emitOutput(`Reading premise file: ${premiseFile}\n`);
      const premiseContent = await this.readInputFile(this.ensureAbsolutePath(premiseFile, saveDir));
      
      // Read concept file if provided
      let conceptContent = "";
      if (conceptFile) {
        try {
          this.emitOutput(`Reading concept file: ${conceptFile}\n`);
          conceptContent = await this.readInputFile(this.ensureAbsolutePath(conceptFile, saveDir));
        } catch (error) {
          this.emitOutput(`Note: Concept file not found or couldn't be read: ${error.message}\n`);
          this.emitOutput("Continuing with just the premise description.\n");
        }
      }
      
      // Read characters file if provided
      let charactersContent = "";
      if (charactersFile) {
        try {
          this.emitOutput(`Reading characters file: ${charactersFile}\n`);
          charactersContent = await this.readInputFile(this.ensureAbsolutePath(charactersFile, saveDir));
        } catch (error) {
          this.emitOutput(`Note: Characters file not found or couldn't be read: ${error.message}\n`);
          this.emitOutput("Continuing without characters information.\n");
        }
      }
      
      // Read example outline if provided
      let exampleOutlineContent = "";
      if (exampleOutline) {
        try {
          this.emitOutput(`Reading example outline: ${exampleOutline}\n`);
          exampleOutlineContent = await this.readInputFile(this.ensureAbsolutePath(exampleOutline, saveDir));
        } catch (error) {
          this.emitOutput(`Note: Example outline file not found or couldn't be read: ${error.message}\n`);
          this.emitOutput("Continuing without example outline.\n");
        }
      }
      
      // Create prompt
      const prompt = this.createPrompt(
        premiseContent,
        conceptContent,
        charactersContent,
        exampleOutlineContent,
        sections,
        chapters,
        language,
        title,
        genre,
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
      this.emitOutput(`                     = premise + concept + characters + example outline + prompt instructions\n`);
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
      this.emitOutput(`\nSending request to Claude API (streaming)...\n`);
      
      // Add a message about waiting
      this.emitOutput(`****************************************************************************\n`);
      this.emitOutput(`*  This usually takes a few minutes...\n`);
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
          // Callback for response text
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
      
      this.emitOutput(`\nCompleted in ${minutes}m ${seconds.toFixed(2)}s.\n`);
      
      // Process response - remove markdown formatting if any
      const cleanedResponse = this.removeMarkdownFormat(fullResponse);
      
      // Count words in response
      const wordCount = this.countWords(cleanedResponse);
      this.emitOutput(`Outline has approximately ${wordCount} words.\n`);
      
      // Count tokens in response
      const responseTokens = await this.claudeService.countTokens(cleanedResponse);
      this.emitOutput(`Outline token count: ${responseTokens}\n`);
      
      // Save the outline to a file
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
      const outlineFilename = `outline_${timestamp}.txt`;
      const outlinePath = path.join(saveDir, outlineFilename);
      
      await this.writeOutputFile(cleanedResponse, saveDir, outlineFilename);
      this.emitOutput(`Outline saved to: ${outlinePath}\n`);
      
      // Add to output files list
      outputFiles.push(outlinePath);
      
      // Add to the file cache
      fileCache.addFile(toolName, outlinePath);
      
      // Save thinking content if available and not skipped
      if (thinkingContent) {
        const thinkingFilename = `outline_thinking_${timestamp}.txt`;
        
        // Create stats for thinking file
        const stats = `
Details:
Max request timeout: ${this.config.request_timeout || 300} seconds
Max AI model context window: ${this.config.context_window || 200000} tokens
AI model thinking budget: ${this.config.thinking_budget_tokens || 32000} tokens
Desired output tokens: ${this.config.desired_output_tokens || 12000} tokens

Estimated input/prompt tokens: ${promptTokens}
Setting max_tokens to: ${maxTokens}

elapsed time: ${minutes} minutes, ${seconds.toFixed(2)} seconds
Outline has ${wordCount} words
Outline token count: ${responseTokens}
Outline saved to: ${outlinePath}
`;
        
        // Create a prompt log without the full content
        const promptForLogging = this.createPromptForLogging(
          sections,
          chapters,
          language,
          title,
          genre,
          detailed
        );
        
        const thinkingContent2 = `=== PROMPT USED (EXCLUDING REFERENCE CONTENT) ===
${promptForLogging}

note: The actual prompt included any example outline, characters, and concept which are not logged here to save space.

=== AI'S THINKING PROCESS ===

${thinkingContent}

=== END AI'S THINKING PROCESS ===
${stats}`;
        
        await this.writeOutputFile(thinkingContent2, saveDir, thinkingFilename);
        const thinkingPath = path.join(saveDir, thinkingFilename);
        this.emitOutput(`AI thinking saved to: ${thinkingPath}\n`);
        
        // Add thinking file to output files and cache
        outputFiles.push(thinkingPath);
        fileCache.addFile(toolName, thinkingPath);
      }
      
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
      console.error('Error in OutlineWriter:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create prompt based on input content
   * @param {string} premiseContent - Premise content
   * @param {string} conceptContent - Concept content
   * @param {string} charactersContent - Characters content
   * @param {string} exampleOutlineContent - Example outline content
   * @param {number} sections - Number of sections
   * @param {number} chapters - Number of chapters
   * @param {string} language - Language
   * @param {string} title - Title
   * @param {string} genre - Genre
   * @param {boolean} detailed - Whether to generate detailed outline
   * @returns {string} - Prompt for Claude API
   */
  createPrompt(
    premiseContent,
    conceptContent,
    charactersContent,
    exampleOutlineContent,
    sections,
    chapters,
    language,
    title,
    genre,
    detailed
  ) {
    // Title and genre placeholders
    const titleSuggestion = title ? 
      `Suggested title: ${title}` : 
      "Please create an appropriate title for this novel.";
    
    const genreSuggestion = genre ? `Genre: ${genre}` : "";
    
    let prompt = `You are a skilled novelist and story architect helping to create a detailed novel outline in fluent, authentic ${language}.
Draw upon your knowledge of worldwide literary traditions, narrative structure, and plot development approaches from across cultures,
while expressing everything in natural, idiomatic ${language} that honors its unique linguistic character.

=== PREMISE ===
${premiseContent}
=== END PREMISE ===

=== CONCEPT ===
${conceptContent}
=== END CONCEPT ===

=== CHARACTERS ===
${charactersContent}
=== END CHARACTERS ===

=== EXAMPLE OUTLINE FORMAT ===
${exampleOutlineContent}
=== END EXAMPLE OUTLINE FORMAT ===

Create a detailed novel outline with approximately ${chapters} chapters organized into ${sections} main parts or sections.
${titleSuggestion}
${genreSuggestion}
Your outline should follow the general format and level of detail shown in the example (if provided), while being completely original.

Consider the following in your thinking:
- Refer to the included CHARACTERS, if provided
- Follow the structure of the EXAMPLE OUTLINE, if provided, but make proper adjustments for this novel
- Do NOT create new characters unless incidental ones like: cashiers, passers-by, if any, and these should remain without names
- Create a compelling narrative arc with rising tension, climax, and resolution
- Develop character arcs that show growth and change
- Include key plot points, conflicts, and important scenes
- Balance external plot with internal character development
- Ensure that each chapter has a clear purpose in advancing the story

IMPORTANT FORMATTING INSTRUCTIONS:
1. DO NOT use Markdown formatting (no #, ##, ###, *, **, etc.)
2. Start with "OUTLINE:" followed by the novel title on the next line
3. For parts/sections, use plain text like: "PART I: THE BEGINNING"
4. For chapters, use ONLY simple numbering like: "1. Chapter Title" (no "Chapter" word, just the number and title)
5. DO NOT include POV markers like "POV: Character"
6. For each chapter, include 4-6 bullet points describing key events and developments
7. Format each bullet point starting with "- " (dash followed by space)
8. Each bullet point should describe a single key event, character moment, or plot development
9. Make bullet points substantive but concise, focusing on important elements
10. Include an optional brief epilogue with bullet points if appropriate for the story
`;

    if (detailed) {
      prompt += `
11. For each chapter, include additional bullet points (up to 7-8 total) covering:
    - Key plot developments
    - Important character moments or revelations
    - Setting details
    - Thematic elements being developed
12. Keep all bullet points in the same format with "- " at the start of each point
`;
    }
    
    return prompt;
  }
  
  /**
   * Create a logging version of the prompt without file contents
   * @param {number} sections - Number of sections
   * @param {number} chapters - Number of chapters
   * @param {string} language - Language
   * @param {string} title - Title
   * @param {string} genre - Genre
   * @param {boolean} detailed - Whether to generate detailed outline
   * @returns {string} - Prompt for logging
   */
  createPromptForLogging(
    sections,
    chapters,
    language,
    title,
    genre,
    detailed
  ) {
    // Title and genre placeholders
    const titleSuggestion = title ? 
      `Suggested title: ${title}` : 
      "Please create an appropriate title for this novel.";
    
    const genreSuggestion = genre ? `Genre: ${genre}` : "";
    
    let prompt = `You are a skilled novelist and story architect helping to create a detailed novel outline in fluent, authentic ${language}.
Draw upon your knowledge of worldwide literary traditions, narrative structure, and plot development approaches from across cultures,
while expressing everything in natural, idiomatic ${language} that honors its unique linguistic character.

Create a detailed novel outline with approximately ${chapters} chapters organized into ${sections} main parts or sections.
${titleSuggestion}
${genreSuggestion}
Your outline should follow the general format and level of detail shown in the example (if provided), while being completely original.

Consider the following in your thinking:
- Refer to the included CHARACTERS, if provided
- Follow the structure of the EXAMPLE OUTLINE if provided
- Do NOT create new characters unless incidental ones like: cashiers, passers-by, if any, and these should remain without names
- Create a compelling narrative arc with rising tension, climax, and resolution
- Develop character arcs that show growth and change
- Include key plot points, conflicts, and important scenes
- Balance external plot with internal character development
- Ensure that each chapter has a clear purpose in advancing the story

IMPORTANT FORMATTING INSTRUCTIONS:
1. DO NOT use Markdown formatting (no #, ##, ###, *, **, etc.)
2. Start with "OUTLINE:" followed by the novel title on the next line
3. For parts/sections, use plain text like: "PART I: THE BEGINNING"
4. For chapters, use ONLY simple numbering like: "1. Chapter Title" (no "Chapter" word, just the number and title)
5. DO NOT include POV markers like "POV: Character"
6. For each chapter, include 4-6 bullet points describing key events and developments
7. Format each bullet point starting with "- " (dash followed by space)
8. Each bullet point should describe a single key event, character moment, or plot development
9. Make bullet points substantive but concise, focusing on important elements
10. Include an optional brief epilogue with bullet points if appropriate for the story
`;

    if (detailed) {
      prompt += `
11. For each chapter, include additional bullet points (up to 7-8 total) covering:
    - Key plot developments
    - Important character moments or revelations
    - Setting details
    - Thematic elements being developed
12. Keep all bullet points in the same format with "- " at the start of each point
`;
    }
    
    return prompt;
  }
  
  /**
   * Remove Markdown formatting from text
   * @param {string} text - Text with possible Markdown
   * @returns {string} - Cleaned text
   */
  removeMarkdownFormat(text) {
    // Replace Markdown headers with plain text format
    let cleaned = text.replace(/^#{1,6}\s+Chapter\s+(\d+):\s+(.*?)$/gm, '$1. $2');
    cleaned = cleaned.replace(/^#{1,6}\s+PART\s+([IVXLCDM]+):\s+(.*?)$/gm, 'PART $1: $2');
    cleaned = cleaned.replace(/^#{1,6}\s+(.*?)$/gm, '$1');
    
    // Remove POV markers
    cleaned = cleaned.replace(/POV:\s+\w+\s*$/gm, '');
    cleaned = cleaned.replace(/POV:\s+\w+\s*\n/gm, '\n');
    
    // Replace special quotes with regular quotes
    cleaned = cleaned.replace(/[""]/g, '"');
    cleaned = cleaned.replace(/['']/g, "'");
    
    // Remove Markdown formatting
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');  // Bold
    cleaned = cleaned.replace(/\*(.*?)\*/g, '$1');      // Italic
    cleaned = cleaned.replace(/`(.*?)`/g, '$1');        // Code
    cleaned = cleaned.replace(/^\s*[-*+]\s+/gm, '- ');  // Standardize bullet points
    
    // Clean up any extra spaces but preserve line breaks
    cleaned = cleaned.replace(/ +/g, ' ');
    cleaned = cleaned.replace(/ +\n/g, '\n');
    cleaned = cleaned.replace(/\n +/g, '\n');
    
    // Ensure consistent chapter formatting when numbers are present
    cleaned = cleaned.replace(/^Chapter\s+(\d+):\s+(.*?)$/gm, '$1. $2');
    
    return cleaned;
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

module.exports = OutlineWriter;