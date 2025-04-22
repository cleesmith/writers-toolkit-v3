// chapter-writer.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * ChapterWriter Tool
 * Uses the outline, chapters list, world document, and any existing manuscript to write rough draft chapters
 */
class ChapterWriter extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('chapter_writer', config);
    this.claudeService = claudeService;
    // console.log('ChapterWriter Tool initialized with config:', config);
  }
  
  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing ChapterWriter with options:', options);
    
    // Clear the cache for this tool
    const toolName = 'chapter_writer';
    fileCache.clear(toolName);
    
    // Extract options
    const request = options.request;
    const chaptersToWrite = options.chapters_to_write;
    const manuscriptFile = options.manuscript || 'manuscript.txt';
    const outlineFile = options.outline || 'outline.txt';
    const worldFile = options.world || 'world.txt';
    const language = options.lang || 'English';
    const chapterDelay = options.chapter_delay || 15;
    const noDialogueEmphasis = options.no_dialogue_emphasis || false;
    const noAppend = options.no_append || false;
    const backup = options.backup || false;
    const showTokenStats = options.show_token_stats || false;
    
    const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    const outputFiles = [];
    const summary = [];
    
    // Validate save directory
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }
    
    // Validate that either request or chaptersToWrite is provided
    if (!request && !chaptersToWrite) {
      const errorMsg = 'Error: You must provide either request for a single chapter or chapters_to_write for multiple chapters.\n';
      this.emitOutput(errorMsg);
      throw new Error('No chapter request provided');
    }
    
    try {
      // If chapters_to_write is provided, process multiple chapters
      if (chaptersToWrite) {
        // Read chapters list file
        this.emitOutput(`Reading chapters to write from: ${chaptersToWrite}\n`);
        const chaptersPath = this.ensureAbsolutePath(chaptersToWrite, saveDir);
        const chaptersContent = await this.readInputFile(chaptersPath);
        
        // Parse chapter list - non-empty lines
        const chapterList = chaptersContent
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);
        
        if (chapterList.length === 0) {
          this.emitOutput(`Error: Chapters file is empty: ${chaptersToWrite}\n`);
          throw new Error('Chapters file is empty');
        }
        
        this.emitOutput(`Found ${chapterList.length} chapters to process:\n`);
        chapterList.forEach((chapter, index) => {
          this.emitOutput(`  ${index + 1}. ${chapter}\n`);
        });
        
        // Process each chapter with a delay between them
        for (let i = 0; i < chapterList.length; i++) {
          const chapterRequest = chapterList[i];
          
          this.emitOutput(`\nProcessing chapter ${i + 1} of ${chapterList.length}: ${chapterRequest}\n`);
          
          const result = await this.processChapter(
            chapterRequest,
            manuscriptFile,
            outlineFile,
            worldFile,
            language,
            noDialogueEmphasis,
            noAppend,
            backup,
            showTokenStats,
            saveDir,
            i + 1,
            chapterList.length
          );
          
          if (result) {
            outputFiles.push(result.chapterFile);
            if (result.thinkingFile) {
              outputFiles.push(result.thinkingFile);
            }
            summary.push(result);
          }
          
          // If this isn't the last chapter, wait before processing the next one
          if (i < chapterList.length - 1) {
            this.emitOutput(`Waiting ${chapterDelay} seconds before next chapter...\n`);
            await new Promise(resolve => setTimeout(resolve, chapterDelay * 1000));
          }
        }
        
        // Output summary of all processed chapters
        this.emitOutput("\n" + "=".repeat(80) + "\n");
        this.emitOutput("SUMMARY OF ALL CHAPTERS PROCESSED\n");
        this.emitOutput("=".repeat(80) + "\n");
        
        let totalWords = 0;
        let totalTime = 0;
        
        for (const result of summary) {
          totalWords += result.wordCount;
          totalTime += result.elapsedTime;
          const minutes = Math.floor(result.elapsedTime / 60);
          const seconds = result.elapsedTime % 60;
          
          this.emitOutput(`Chapter ${result.chapterNum}: ${result.wordCount} words, ${minutes}m ${seconds.toFixed(1)}s, saved to: ${path.basename(result.chapterFile)}\n`);
        }
        
        // Calculate averages and totals
        const avgWords = summary.length > 0 ? totalWords / summary.length : 0;
        const totalMinutes = Math.floor(totalTime / 60);
        const totalSeconds = totalTime % 60;
        
        this.emitOutput(`\nTotal chapters: ${summary.length}\n`);
        this.emitOutput(`Total words: ${totalWords}\n`);
        this.emitOutput(`Average words per chapter: ${avgWords.toFixed(1)}\n`);
        this.emitOutput(`Total time: ${totalMinutes}m ${totalSeconds.toFixed(1)}s\n`);
        this.emitOutput("=".repeat(80) + "\n");
      } else {
        // Process a single chapter
        const result = await this.processChapter(
          request,
          manuscriptFile,
          outlineFile,
          worldFile,
          language,
          noDialogueEmphasis,
          noAppend,
          backup,
          showTokenStats,
          saveDir
        );
        
        if (result) {
          outputFiles.push(result.chapterFile);
          if (result.thinkingFile) {
            outputFiles.push(result.thinkingFile);
          }
          summary.push(result);
        }
      }
      
      // Add all files to the cache
      for (const file of outputFiles) {
        fileCache.addFile(toolName, file);
      }
      
      return {
        success: true,
        outputFiles,
        stats: {
          chapterCount: summary.length,
          totalWords: summary.reduce((sum, result) => sum + result.wordCount, 0),
          elapsedTime: summary.reduce((sum, result) => sum + result.elapsedTime, 0)
        }
      };
      
    } catch (error) {
      console.error('Error in ChapterWriter:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Process a single chapter
   * @param {string} chapterRequest - Chapter request text
   * @param {string} manuscriptFile - Path to manuscript file
   * @param {string} outlineFile - Path to outline file
   * @param {string} worldFile - Path to world file
   * @param {string} language - Language to write in
   * @param {boolean} noDialogueEmphasis - Whether to disable dialogue emphasis
   * @param {boolean} noAppend - Whether to disable auto-appending to manuscript
   * @param {boolean} backup - Whether to create a backup of manuscript
   * @param {boolean} showTokenStats - Whether to only show token stats without generation
   * @param {string} saveDir - Directory to save output files
   * @param {number} currentIdx - Current chapter index (for multiple chapters)
   * @param {number} totalChapters - Total number of chapters (for multiple chapters)
   * @returns {Promise<Object>} - Result of chapter processing
   */
  async processChapter(
    chapterRequest,
    manuscriptFile,
    outlineFile,
    worldFile,
    language,
    noDialogueEmphasis,
    noAppend,
    backup,
    showTokenStats,
    saveDir,
    currentIdx = null,
    totalChapters = null
  ) {
    try {
      // Extract chapter number and formatted chapter number
      const { chapterNum, formattedChapter } = this.extractChapterNum(chapterRequest);
      
      // Log processing info
      const currentTime = new Date().toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: true 
      }).toLowerCase().replace(/^0/, '');
      
      if (currentIdx !== null && totalChapters !== null) {
        this.emitOutput(`${currentTime} - Processing chapter ${currentIdx} of ${totalChapters}: Chapter ${chapterNum}\n`);
      } else {
        this.emitOutput(`${currentTime} - Processing: Chapter ${chapterNum}\n`);
      }
      
      // Read files
      // Read outline file (required)
      let outlineContent = "";
      try {
        this.emitOutput(`Reading outline file: ${outlineFile}\n`);
        outlineContent = await this.readInputFile(this.ensureAbsolutePath(outlineFile, saveDir));
      } catch (error) {
        this.emitOutput(`Error: Required outline file not found: ${outlineFile}\n`);
        this.emitOutput("The outline file is required to continue.\n");
        throw error;
      }
      
      // Read manuscript file or create it if it doesn't exist
      let novelContent = "";
      try {
        this.emitOutput(`Reading manuscript file: ${manuscriptFile}\n`);
        novelContent = await this.readInputFile(this.ensureAbsolutePath(manuscriptFile, saveDir));
      } catch (error) {
        this.emitOutput(`Error: Required manuscript file not found: ${manuscriptFile}\n`);
        this.emitOutput("Creating a new manuscript file.\n");
        
        // Create an empty manuscript file
        await fs.writeFile(this.ensureAbsolutePath(manuscriptFile, saveDir), "");
      }
      
      // Read world file (optional)
      let worldContent = "";
      try {
        this.emitOutput(`Reading world file: ${worldFile}\n`);
        worldContent = await this.readInputFile(this.ensureAbsolutePath(worldFile, saveDir));
      } catch (error) {
        this.emitOutput(`Note: World file not found: ${worldFile}\n`);
        this.emitOutput("Continuing without world information.\n");
        // Don't throw an error - continue with empty worldContent
      }
      
      // Format chapter request for consistency in prompt
      const formattedRequest = this.formatChapterRequest(chapterRequest);
      const formattedOutlineRequest = this.formatOutlineRequest(chapterRequest);
      
      // Create prompt
      const prompt = this.createChapterPrompt(
        formattedRequest,
        formattedOutlineRequest,
        outlineContent,
        worldContent,
        novelContent,
        language,
        noDialogueEmphasis
      );
      
      // Create a prompt version for logging (without full file content)
      const promptForLogging = this.createPromptForLogging(
        formattedOutlineRequest,
        language,
        noDialogueEmphasis
      );
      
      // Count tokens in prompt
      this.emitOutput(`Counting tokens in prompt...\n`);
      const promptTokens = await this.claudeService.countTokens(prompt);
      
      // Calculate available tokens after prompt
      const contextWindow = this.config.context_window || 200000;
      const desiredOutputTokens = this.config.desired_output_tokens || 12000;
      const configuredThinkingBudget = this.config.thinking_budget_tokens || 32000;
      const betasMaxTokens = this.config.betas_max_tokens || 128000;
      
      const availableTokens = contextWindow - promptTokens;
      
      // For API call, max_tokens must respect the API limit
      const maxTokens = Math.min(availableTokens, betasMaxTokens);
      
      // Thinking budget must be LESS than max_tokens to leave room for visible output
      const thinkingBudget = maxTokens - desiredOutputTokens;
      
      // Display token stats
      this.emitOutput(`\nToken stats:\n`);
      this.emitOutput(`Max AI model context window: [${contextWindow}] tokens\n`);
      this.emitOutput(`Input prompt tokens: [${promptTokens}] ...\n`);
      this.emitOutput(`                     = request + chapters.txt + manuscript.txt\n`);
      this.emitOutput(`                       + outline.txt + world.txt + prompt instructions\n`);
      this.emitOutput(`Available tokens: [${availableTokens}]  = ${contextWindow} - ${promptTokens} = context_window - prompt\n`);
      this.emitOutput(`Desired output tokens: [${desiredOutputTokens}]\n`);
      this.emitOutput(`AI model thinking budget: [${thinkingBudget}] tokens  = ${maxTokens} - ${desiredOutputTokens}\n`);
      this.emitOutput(`Max output tokens (max_tokens): [${maxTokens}] tokens  = min(${availableTokens}, ${betasMaxTokens})\n`);
      this.emitOutput(`                                = can not exceed: 'betas=["output-128k-2025-02-19"]'\n`);
      
      // Check if prompt is too large for the configured thinking budget
      if (thinkingBudget < configuredThinkingBudget) {
        this.emitOutput(`Error: prompt is too large to have a ${configuredThinkingBudget} thinking budget!\n`);
        this.emitOutput(`Run aborted!\n`);
        throw new Error(`Prompt is too large for ${configuredThinkingBudget} thinking budget - run aborted`);
      }
      
      // Show token stats only if requested
      if (showTokenStats) {
        this.emitOutput(`FYI: token stats shown without creating chapters, to aid in making adjustments.\n`);
        this.emitOutput(`\nNote: with Claude 3.7 Sonnet, 'max_tokens' is enforced as a strict limit,\n`);
        this.emitOutput(`      which includes your thinking budget when thinking is enabled.\n`);
        this.emitOutput(`      So Claude API will now return a validation error if:\n`);
        this.emitOutput(`      'prompt tokens' + 'max_tokens' exceeds the 'context window' size.\n`);
        this.emitOutput(`      Where 'prompt tokens' includes: request, chapters.txt, manuscript.txt, outline.txt, world.txt,\n`);
        this.emitOutput(`      and the prompt instructions to the AI -- see: 'Input prompt tokens:' for each run.\n`);
        return null;
      }
      
      // Call Claude API with streaming
      this.emitOutput(`Sending request to Claude API (streaming)...\n`);
      
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
        this.emitOutput(`\n*** Error during generation:\n${error.message}\n`);
        throw error;
      }
      
      // Calculate elapsed time
      const elapsed = (Date.now() - startTime) / 1000;
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      
      // Clean response (skipping the complex cleaning functions from Python for now)
      const cleanedResponse = fullResponse;
      
      // Create timestamp for filename
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
      const chapterFilename = `${formattedChapter}_chapter_${timestamp}.txt`;
      const chapterPath = path.join(saveDir, chapterFilename);
      
      // Write chapter to file
      await this.writeOutputFile(cleanedResponse, saveDir, chapterFilename);
      
      // Count words in chapter
      const chapterWordCount = this.countWords(cleanedResponse);
      
      // Count tokens in chapter
      const chapterTokenCount = await this.claudeService.countTokens(cleanedResponse);
      
      // Append the new chapter to the manuscript file if not disabled
      if (!noAppend) {
        const appendSuccess = await this.appendToManuscript(
          cleanedResponse, 
          this.ensureAbsolutePath(manuscriptFile, saveDir), 
          backup
        );
        
        if (appendSuccess) {
          this.emitOutput(`Chapter ${chapterNum} appended to manuscript file: ${manuscriptFile}\n`);
        } else {
          this.emitOutput(`Warning: Failed to append chapter to manuscript file\n`);
        }
      }
      
      // Stats for thinking file
      const stats = `
Details:
Max request timeout: ${this.config.request_timeout || 300} seconds
Max retries: ${this.config.max_retries || 1}
Max AI model context window: ${contextWindow} tokens
Input prompt tokens: ${promptTokens}
AI model thinking budget: ${thinkingBudget} tokens
Max output tokens: ${maxTokens} tokens
Elapsed time: ${minutes}m ${seconds.toFixed(2)}s
Chapter ${chapterNum}: ${chapterWordCount} words
Chapter ${chapterNum} token count: ${chapterTokenCount}
`;
      
      // Save thinking content if available
      let thinkingPath = null;
      if (thinkingContent) {
        const thinkingTokenCount = await this.claudeService.countTokens(thinkingContent);
        const thinkingEfficiency = (thinkingTokenCount / thinkingBudget) * 100;
        const thinkingToOutputRatio = thinkingTokenCount / chapterTokenCount;
        
        const analytics = `
--------------------------
CHAPTER GENERATION METRICS
--------------------------
Token Counts:
- Thinking tokens used: ${thinkingTokenCount.toLocaleString()} of ${thinkingBudget.toLocaleString()} (${thinkingEfficiency.toFixed(1)}%)
- Chapter output tokens: ${chapterTokenCount.toLocaleString()}
- Thinking-to-output ratio: ${thinkingToOutputRatio.toFixed(2)}:1

Notes:
1. Token counts were calculated using full API parameters to match 
   the actual token accounting used for API billing.

2. The thinking token count represents the raw content returned 
   by the API. This gives insight into how much reasoning Claude 
   performed before producing the chapter.
   
3. A higher thinking-to-output ratio typically indicates more 
   extensive reasoning before generating content, which may 
   correlate with more complex narrative development.

4. The API does not provide details about exact internal 
   tokens or time usage, so this is just an estimate based
   on token counts alone.
`;
        
        const thinkingFilename = `${formattedChapter}_thinking_${timestamp}.txt`;
        thinkingPath = path.join(saveDir, thinkingFilename);
        
        const thinkingContent2 = `=== PROMPT USED (EXCLUDING NOVEL CONTENT) ===
${promptForLogging}

=== AI'S THINKING PROCESS ===

${thinkingContent}

=== END AI'S THINKING PROCESS ===
${stats}
${analytics}
###
`;
        
        await this.writeOutputFile(thinkingContent2, saveDir, thinkingFilename);
        this.emitOutput(`AI thinking saved to: ${thinkingPath}\n`);
      }
      
      this.emitOutput(`Completed Chapter ${chapterNum}: ${chapterWordCount} words (${minutes}m ${seconds.toFixed(2)}s) - saved to: ${path.basename(chapterPath)}\n`);
      
      // Return chapter information
      return {
        chapterNum,
        wordCount: chapterWordCount, 
        tokenCount: chapterTokenCount,
        elapsedTime: elapsed,
        chapterFile: chapterPath,
        thinkingFile: thinkingPath
      };
      
    } catch (error) {
      console.error('Error processing chapter:', error);
      this.emitOutput(`\nError processing chapter: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Extract chapter number from request
   * @param {string} request - Chapter request text
   * @returns {Object} - Chapter number and formatted chapter number
   */
  extractChapterNum(request) {
    // Check for the different formats
    const fullPattern = /^Chapter\s+(\d+)[:\.]?\s+(.+)$/i;
    const colonPattern = /^(\d+):\s+(.+)$/;
    const periodPattern = /^(\d+)\.\s+(.+)$/;
    
    let chapterNum;
    let fullMatch = request.match(fullPattern);
    let colonMatch = request.match(colonPattern);
    let periodMatch = request.match(periodPattern);
    
    if (fullMatch) {
      chapterNum = fullMatch[1];
    } else if (colonMatch) {
      chapterNum = colonMatch[1];
    } else if (periodMatch) {
      chapterNum = periodMatch[1];
    } else {
      this.emitOutput("\nERROR: it's best to copy your next chapter number and title from your outline, as\n");
      this.emitOutput("'--request' must be like:\n\t--request \"Chapter X: Title\"\n...or\n\t--request \"X: Title\"\n...or\n\t--request \"X. Title\"\n... where X is a number.\n");
      this.emitOutput(`But your request was: '${request}'\n\n`);
      throw new Error('Invalid chapter request format');
    }
    
    // Format the chapter number as 3-digit
    const formattedChapter = String(parseInt(chapterNum)).padStart(3, '0');
    
    return { chapterNum, formattedChapter };
  }
  
  /**
   * Format chapter request for consistency in the prompt
   * @param {string} request - Chapter request text
   * @returns {string} - Formatted chapter request
   */
  formatChapterRequest(request) {
    // Check if already in "Chapter X: Title" format
    if (/^Chapter\s+\d+/i.test(request)) {
      return request;
    }
    
    // Extract number and title
    const match = request.match(/^(\d+)[:\.]?\s+(.+)$/);
    if (match) {
      const [, num, title] = match;
      return `Chapter ${num}: ${title}`;
    }
    
    // Fallback (should never happen due to extractChapterNum validation)
    return request;
  }
  
  /**
   * Format outline request for consistency
   * @param {string} request - Chapter request text
   * @returns {string} - Formatted outline request
   */
  formatOutlineRequest(request) {
    // Check if already in "Chapter X: Title" format
    if (/^Chapter\s+\d+/i.test(request)) {
      // Convert to "Chapter X. Title" format
      return request.replace(/^(Chapter\s+\d+):\s+(.+)$/i, '$1. $2');
    }
    
    // Extract number and title
    const match = request.match(/^(\d+)[:\.]?\s+(.+)$/);
    if (match) {
      const [, num, title] = match;
      return `Chapter ${num}. ${title}`;
    }
    
    // Fallback
    return request;
  }
  
  /**
   * Create the chapter prompt
   * @param {string} formattedRequest - Formatted chapter request
   * @param {string} formattedOutlineRequest - Formatted outline request for consistency
   * @param {string} outlineContent - Content of outline file
   * @param {string} worldContent - Content of world file
   * @param {string} novelContent - Content of manuscript file
   * @param {string} language - Language to write in
   * @param {boolean} noDialogueEmphasis - Whether to disable dialogue emphasis
   * @returns {string} - Complete prompt for Claude API
   */
  createChapterPrompt(
    formattedRequest,
    formattedOutlineRequest,
    outlineContent,
    worldContent,
    novelContent,
    language,
    noDialogueEmphasis
  ) {
    // Dialogue emphasis option - included by default unless disabled
    let dialogueOption = "";
    if (!noDialogueEmphasis) {
      dialogueOption = `
- DIALOGUE EMPHASIS: Significantly increase the amount of dialogue, both external conversations between characters and internal thoughts/monologues. At least 40-50% of the content should be dialogue. Use dialogue to reveal character, advance plot, create tension, and show (rather than tell) emotional states. Ensure each character's dialogue reflects their unique personality, background, and relationship dynamics as established in the WORLD and MANUSCRIPT.
`;
    }
    
    // Character restriction is always included
    const characterRestriction = `- CHARACTER RESTRICTION: Do NOT create any new named characters. Only use characters explicitly mentioned in the WORLD, OUTLINE, or MANUSCRIPT. You may only add minimal unnamed incidental characters when absolutely necessary (e.g., a waiter, cashier, landlord) but keep these to an absolute minimum.
- WORLD FOCUS: Make extensive use of the world details provided in the WORLD section. Incorporate the settings, locations, history, culture, and atmosphere described there to create an immersive, consistent environment.
`;
    
    return `=== OUTLINE ===
${outlineContent}
=== END OUTLINE ===

=== WORLD ===
${worldContent}
=== END WORLD ===

=== EXISTING MANUSCRIPT ===
${novelContent}
=== END EXISTING MANUSCRIPT ===

You are a skilled novelist writing ${formattedRequest} in fluent, authentic ${language}. 
Draw upon your knowledge of worldwide literary traditions, narrative techniques, and creative approaches from across cultures, while expressing everything in natural, idiomatic ${language} that honors its unique linguistic character.

Consider the following in your thinking:
- IMPORTANT: always review the included WORLD, OUTLINE, and MANUSCRIPT
- Refer to the included WORLD of characters and settings provided
- Analyze how each chapter advances the overall narrative and character development
- Creating compelling opening and closing scenes
- Incorporating sensory details and vivid descriptions
- Maintaining consistent tone and style with previous chapters
- Do NOT add new characters, only used characters from: WORLD, OUTLINE, and MANUSCRIPT

IMPORTANT:
- NO Markdown formatting
- Use hyphens only for legitimate ${language} words
- Begin with: ${formattedOutlineRequest} and write in plain text only
- Write 2,000-3,000 words
- Do not repeat content from existing chapters
- Do not start working on the next chapter
- Maintain engaging narrative pacing through varied sentence structure, strategic scene transitions, and appropriate balance between action, description, and reflection
- Prioritize natural, character-revealing dialogue as the primary narrative vehicle, ensuring each conversation serves multiple purposes (character development, plot advancement, conflict building). Include distinctive speech patterns for different characters, meaningful subtext, and strategic dialogue beats, while minimizing lengthy exposition and internal reflection.
- Write all times in 12-hour numerical format with a space before lowercase am/pm (e.g., "10:30 am," "2:15 pm," "7:00 am") rather than spelling them out as words or using other formats
- Prioritize lexical diversity by considering multiple alternative word choices before finalizing each sentence. For descriptive passages especially, select precise, context-specific terminology rather than relying on common metaphorical language. When using figurative language, vary the sensory domains from which metaphors are drawn (visual, auditory, tactile, etc.). Actively monitor your own patterns of word selection across paragraphs and deliberately introduce variation.
- In your 'thinking' before writing always indicate and explain what you're using from: WORLD, OUTLINE, and MANUSCRIPT (previous chapters)${dialogueOption}${characterRestriction}
`;
  }
  
  /**
   * Create a logging version of the prompt without file contents
   * @param {string} formattedOutlineRequest - Formatted outline request
   * @param {string} language - Language to write in
   * @param {boolean} noDialogueEmphasis - Whether to disable dialogue emphasis
   * @returns {string} - Prompt for logging
   */
  createPromptForLogging(formattedOutlineRequest, language, noDialogueEmphasis) {
    // Dialogue emphasis option - included by default unless disabled
    let dialogueOption = "";
    if (!noDialogueEmphasis) {
      dialogueOption = `
- DIALOGUE EMPHASIS: Significantly increase the amount of dialogue, both external conversations between characters and internal thoughts/monologues. At least 40-50% of the content should be dialogue. Use dialogue to reveal character, advance plot, create tension, and show (rather than tell) emotional states. Ensure each character's dialogue reflects their unique personality, background, and relationship dynamics as established in the WORLD and MANUSCRIPT.
`;
    }
    
    // Character restriction is always included
    const characterRestriction = `- CHARACTER RESTRICTION: Do NOT create any new named characters. Only use characters explicitly mentioned in the WORLD, OUTLINE, or MANUSCRIPT. You may only add minimal unnamed incidental characters when absolutely necessary (e.g., a waiter, cashier, landlord) but keep these to an absolute minimum.
- WORLD FOCUS: Make extensive use of the world details provided in the WORLD section. Incorporate the settings, locations, history, culture, and atmosphere described there to create an immersive, consistent environment.
`;
    
    return `You are a skilled novelist writing ${formattedOutlineRequest} in fluent, authentic ${language}. 
Draw upon your knowledge of worldwide literary traditions, narrative techniques, and creative approaches from across cultures, while expressing everything in natural, idiomatic ${language} that honors its unique linguistic character.

Consider the following in your thinking:
- IMPORTANT: always review the included OUTLINE thoroughly 
- Refer to the included WORLD of characters and settings, if provided
- How this chapter advances the overall narrative and character development
- Creating compelling opening and closing scenes
- Incorporating sensory details and vivid descriptions
- Maintaining consistent tone and style with previous chapters

IMPORTANT:
- NO Markdown formatting
- Use hyphens only for legitimate ${language} words
- Begin with: ${formattedOutlineRequest} and write in plain text only
- Write 2,000-3,000 words
- Do not repeat content from existing chapters
- Do not start working on the next chapter
- Maintain engaging narrative pacing through varied sentence structure, strategic scene transitions, and appropriate balance between action, description, and reflection
- Prioritize natural, character-revealing dialogue as the primary narrative vehicle, ensuring each conversation serves multiple purposes (character development, plot advancement, conflict building). Include distinctive speech patterns for different characters, meaningful subtext, and strategic dialogue beats, while minimizing lengthy exposition and internal reflection.
- Write all times in 12-hour numerical format with a space before lowercase am/pm (e.g., "10:30 am," "2:15 pm," "7:00 am") rather than spelling them out as words or using other formats
- Prioritize lexical diversity by considering multiple alternative word choices before finalizing each sentence. For descriptive passages especially, select precise, context-specific terminology rather than relying on common metaphorical language. When using figurative language, vary the sensory domains from which metaphors are drawn (visual, auditory, tactile, etc.). Actively monitor your own patterns of word selection across paragraphs and deliberately introduce variation.
- In your 'thinking' before writing always indicate and explain what you're using from: WORLD, OUTLINE, and MANUSCRIPT (previous chapters)${dialogueOption}${characterRestriction}
note: The actual prompt included the outline, world, manuscript which are not logged to save space.
`;
  }
  
  /**
   * Append the new chapter to the manuscript file
   * @param {string} chapterText - Text of the new chapter
   * @param {string} manuscriptPath - Path to the manuscript file
   * @param {boolean} backup - Whether to create a backup
   * @returns {Promise<boolean>} - Whether appending was successful
   */
  async appendToManuscript(chapterText, manuscriptPath, backup) {
    try {
      // Read the existing manuscript
      let manuscriptContent = await fs.readFile(manuscriptPath, 'utf8');
      
      // Create backup if requested
      if (backup) {
        const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
        const backupPath = `${manuscriptPath}_${timestamp}.bak`;
        await fs.writeFile(backupPath, manuscriptContent);
      }
      
      // Ensure manuscript ends with exactly one newline
      manuscriptContent = manuscriptContent.trim() + '\n';
      
      // Append chapter with proper formatting (two blank lines)
      const updatedContent = manuscriptContent + '\n\n' + chapterText;
      
      // Write updated content back to manuscript
      await fs.writeFile(manuscriptPath, updatedContent);
      
      return true;
    } catch (error) {
      console.error('Error appending to manuscript:', error);
      this.emitOutput(`Error appending to manuscript: ${error.message}\n`);
      return false;
    }
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

module.exports = ChapterWriter;
