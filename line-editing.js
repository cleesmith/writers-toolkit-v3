// line-editing.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * LineEditing Tool
 * Performs detailed line editing analysis on a specific chapter of a fiction manuscript.
 */
class LineEditing extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('line_editing', config);
    this.claudeService = claudeService;
  }

  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing Line Editing with options:', options);
    
    // Extract options
    let manuscriptFile = options.manuscript_file;
    const chapterNumber = options.chapter_number;
    const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }

    // Ensure file paths are absolute
    manuscriptFile = this.ensureAbsolutePath(manuscriptFile, saveDir);

    const outputFiles = [];
    
    try {
      // Read the input files
      this.emitOutput(`Reading files...\n`);

      // Read the manuscript file
      this.emitOutput(`Reading manuscript file: ${manuscriptFile}\n`);
      const manuscriptContent = await this.readInputFile(manuscriptFile);
        
      const prompt = this.createPrompt(manuscriptContent, chapterNumber);

      // Count tokens in the prompt
      this.emitOutput(`Counting tokens in prompt...\n`);
      const promptTokens = await this.claudeService.countTokens(prompt);

      // Call the shared token budget calculator
      const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);

      // Handle logging based on the returned values
      this.emitOutput(`\nToken stats:\n`);
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
      
      // Add a message about waiting
      this.emitOutput(`****************************************************************************\n`);
      this.emitOutput(`*  Line Editing Chapter ${chapterNumber} in progress...                    \n`);
      this.emitOutput(`*  This process typically takes several minutes.                           \n`);
      this.emitOutput(`*                                                                          \n`);
      this.emitOutput(`*  It's recommended to keep this window the sole 'focus'                   \n`);
      this.emitOutput(`*  and to avoid browsing online or running other apps, as these API        \n`);
      this.emitOutput(`*  network connections can be fragile.                                     \n`);
      this.emitOutput(`*                                                                          \n`);
      this.emitOutput(`*  Please wait while Claude analyzes the chapter...                        \n`);
      this.emitOutput(`****************************************************************************\n\n`);
      
      const startTime = Date.now();
      let fullResponse = "";
      let thinkingContent = "";
      
      // Create system prompt to avoid markdown
      const systemPrompt = "CRITICAL INSTRUCTION: NO Markdown formatting of ANY kind. Never use headers, bullets, or any formatting symbols. Plain text only with standard punctuation.";

      // Use the calculated values in the API call
      // console.log(`prompt:\n`, prompt);
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
      this.emitOutput(`Line editing analysis has approximately ${wordCount} words.\n`);
      
      // Count tokens in response
      const responseTokens = await this.claudeService.countTokens(fullResponse);
      this.emitOutput(`Response token count: ${responseTokens}\n`);

      // Remove any markdown formatting
      fullResponse = this.removeMarkdown(fullResponse);

      // Save the report
      const outputFile = await this.saveReport(
        fullResponse,
        thinkingContent,
        promptTokens,
        responseTokens,
        saveDir,
        chapterNumber
      );
      
      // Add the output files to the result
      outputFiles.push(...outputFile);
      
      // Add files to the cache
      const toolName = 'line_editing';
      outputFiles.forEach(file => {
        fileCache.addFile(toolName, file);
      });
      
      // Return the result
      return {
        success: true,
        outputFiles
      };
    } catch (error) {
      console.error('Error in LineEditing:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Create prompt
   * @param {string} manuscriptContent - Manuscript content
   * @param {string} chapterNumber - Chapter number to analyze
   * @returns {string} - Prompt for Claude API
   */
  //   createPrompt(manuscriptContent, chapterNumber) {
  //     const prompt = `You are an expert line editor specializing in creative fiction. Your task is to provide detailed line editing feedback on the fiction manuscript text provided, focusing specifically on the chapter referenced.

  // I'm providing:
  // 1. A complete fiction manuscript
  // 2. A chapter reference: ${chapterNumber}

  // IMPORTANT: Provide your entire response in plain text only. NO Markdown formatting of ANY kind. Do not use #, *, _, or any other Markdown symbols. Use only standard text formatting with clear section breaks using plain text characters like equals signs and dashes.

  // First, you will need to extract the specified chapter from the manuscript. Look for the chapter heading that matches the reference (accounting for different formatting like "Chapter ${chapterNumber}", "${chapterNumber}.", "CHAPTER ${this.numberToWord(chapterNumber).toUpperCase()}", etc.). Extract all text from this chapter heading until the next chapter heading or the end of the manuscript.

  // Once you've identified the chapter text, proceed with your line editing analysis.

  // Begin your response with the exact chapter heading/title as it appears in the manuscript. This should be prominently displayed at the top of your analysis.

  // For each sentence in the extracted chapter, you will:
  // 1. Quote the original sentence exactly as written
  // 2. List ALL line editing issues in that sentence, with no artificial limit - be thorough and identify every issue you detect
  // 3. Provide one sample rewrite that addresses all identified issues
  // 4. DO NOT add any quotation marks that aren't already in the original text

  // Your fiction-focused analysis should address:
  // - Character voice consistency and authenticity
  // - Dialogue that sounds natural and distinctive
  // - Balance of showing vs. telling
  // - Sensory details and vivid imagery
  // - Emotional resonance and impact
  // - Sentence rhythm and flow for dramatic effect
  // - Word choice and precision for fiction
  // - Eliminating weak modifiers, clichés, and redundancies
  // - Strengthening verbs and removing unnecessary adverbs
  // - Point of view consistency
  // - Improving clarity without sacrificing style
  // - Enhancing pacing appropriate to scene intensity

  // At the end of each paragraph, add:
  // 1. A comprehensive paragraph-level analysis that addresses:
  //    - Scene-building effectiveness
  //    - Emotional arc within the paragraph
  //    - Character development revealed
  //    - Balance of action, dialogue, and description
  //    - Overall flow and coherence
  //    - Appropriate length for story pacing
  //    - Any recurring issues across multiple sentences

  // Format your feedback like this (using ONLY plain text, NO Markdown):

  // ====================
  // [EXACT CHAPTER HEADING/TITLE AS IT APPEARS IN THE MANUSCRIPT]
  // ====================

  // ORIGINAL: [exact original sentence]
  // ISSUES:
  // - [Issue 1]
  // - [Issue 2]
  // - [Continue listing ALL issues you identify]
  // SUGGESTED REWRITE: [your revised version]

  // [After the last sentence in a paragraph]
  // PARAGRAPH ANALYSIS: [Your detailed insights about paragraph-level issues]

  // Remember:
  // 1. Preserve the author's unique fictional voice and style
  // 2. Focus on enhancing the emotional and sensory impact
  // 3. Maintain character consistency in dialogue and actions
  // 4. Aim for prose that serves the story and engages readers
  // 5. Be precise but supportive in your critique
  // 6. Offer concrete improvements rather than just identifying problems
  // 7. Be as thorough as possible - don't limit your analysis due to space concerns
  // 8. Use plain text ONLY - avoid any special formatting characters

  // Your final output should be a comprehensive line edit of the extracted chapter that helps the author elevate their fiction without changing their distinct voice or storytelling approach, formatted in clean, easy-to-edit plain text.

  // === MANUSCRIPT ===
  // ${manuscriptContent}
  // === END MANUSCRIPT ===`;

  //     return prompt;
  //   }

  createPrompt(manuscriptContent, chapterNumber) {
    const prompt = `You are an expert line editor specializing in creative fiction. Your task is to provide detailed line editing feedback on the fiction manuscript text provided, focusing specifically on the chapter referenced.
Your goal is to enhance the clarity, flow, conciseness, word choice, sentence structure, and overall impact of the provided text at the sentence and paragraph level, while preserving the author's unique voice and style.

I'm providing:
1. A complete fiction manuscript
2. A chapter reference: ${chapterNumber}

IMPORTANT: Provide your entire response in plain text only. NO Markdown formatting of ANY kind. Do not use #, *, _, or any other Markdown symbols. Use only standard text formatting with clear section breaks using plain text characters like equals signs and dashes.

TASK: Perform a detailed line edit on the following manuscript, focusing specifically on the chapter referenced: ${chapterNumber}.
Focus ONLY on line-level improvements. 
Do NOT address plot, character arcs, or overall structure (developmental edits). 
Do NOT perform simple proofreading (catching only typos/grammar errors), although you should mention obvious errors you encounter.

CRITICAL PRELIMINARY ANALYSIS (REQUIRED):
Before suggesting any edits, thoroughly read the entire manuscript to establish:

1. Genre Context: Identify the genre and its conventions. Different genres permit different approaches to pacing, description, dialogue, and technical elements.

2. Writer's Style: Note distinctive patterns in:
   - Sentence structure (short and punchy vs. flowing and complex)
   - Word choice (formal vs. colloquial, sparse vs. rich)
   - Use of literary devices (metaphors, alliteration, repetition)
   - Handling of transitions between ideas

3. Writer's Voice: Recognize the unique personality coming through in:
   - Narrative tone (serious, humorous, ironic, etc.)
   - Level of authorial presence/distance
   - Distinctive phrases or cadences
   - Character voice differentiation in dialogue
   - How emotions and thoughts are conveyed

4. Structural Rhythm/Whitespace: Observe patterns in:
   - Balance between dialogue and description
   - Paragraph length variation
   - Scene vs. summary
   - Use of white space to create pacing effects

VERY IMPORTANT: 
Do not suggest changes to every sentence. 
Many apparent "deviations" from standard writing conventions are 
deliberate stylistic choices that contribute to the author's unique voice. 
efore suggesting any edit, ask yourself: 
"Is this truly improving the writing, or am I simply enforcing a convention that may not apply to this author's style or genre?"

FOCUS AREAS FOR LINE EDITING (apply selectively, respecting the author's established style):

1. Clarity & Precision:
   - Are there genuinely ambiguous sentences or phrases?
   - Can any sentences be made clearer or more direct without sacrificing the author's voice?
   - Are there vague words that could be replaced with stronger, more specific ones?

2. Conciseness:
   - Identify and remove redundant words, phrases, or sentences.
   - Tighten wordy constructions that don't serve a stylistic purpose.
   - Eliminate unnecessary filler words that don't contribute to rhythm or voice.

3. Flow & Rhythm:
   - Check sentence structure variation. Are there too many sentences of the same length or structure?
   - Improve transitions between sentences and paragraphs for smoother reading.
   - Does the text have a good rhythm, or does it feel choppy or monotonous in ways that don't serve the content?

4. Word Choice (Diction):
   - Are there clichés or overused phrases that could be refreshed?
   - Is the vocabulary appropriate for the genre, tone, and characters/narrator?
   - Are there stronger verbs or more evocative adjectives that could be used?
   - Ensure consistent tone and voice that matches the author's established style.

5. Sentence Structure (Syntax):
   - Correct genuinely awkward phrasing or confusing sentence structures.
   - Check for misplaced modifiers or parallelism issues that impede understanding.
   - Ensure subject-verb agreement and correct pronoun usage.

6. Show, Don't Tell:
   - Identify instances of "telling" that could be replaced with "showing" through action, dialogue, sensory details, or internal thought. (Apply lightly at the line-edit stage)

7. Consistency:
   - Check for consistent terminology, character voice (within dialogue), and narrative perspective.

INSTRUCTIONS FOR OUTPUT FORMAT:

Present your line edits in the following consistent format for each paragraph or section where changes are suggested. 
PAY CAREFUL ATTENTION TO THE NEWLINES AFTER EACH LABEL:

ORIGINAL TEXT: [put a newline here]
[Copy the exact original text verbatim on a new line after this label]

ISSUES IDENTIFIED: [put a newline here]
- [Issue 1]: [Brief explanation]
- [Issue 2]: [Brief explanation]
(Only list genuine issues that need addressing)

SUGGESTED CHANGES: [put a newline here]
[Present the revised text with changes clearly marked on a new line after this label]

EXPLANATION: [put a newline here]
[Brief explanation on a new line after this label, explaining why these changes improve the text while respecting the author's voice]


FORMATTING EXAMPLE:

ORIGINAL TEXT: 
She ran quickly to the store, her feet pounding against the sidewalk as she hurried with great speed toward her destination.

ISSUES IDENTIFIED:
- Redundancy: "ran quickly" and "hurried with great speed" express the same idea twice
- Wordiness: The sentence could be more concise while maintaining the sense of urgency

SUGGESTED CHANGES:
She ran to the store, her feet pounding against the sidewalk as she hurried toward her destination.

EXPLANATION: 
This edit removes redundant phrasing while preserving the urgency and physical description in the original sentence.


For passages that need no editing, simply state: "This passage effectively achieves its purpose while maintaining the author's voice. No edits suggested."

Maintain the author's original voice and intent. Do not rewrite extensively. Focus on quality over quantity of edits - prioritize changes that will have meaningful impact.
After all, the author can re-run this prompt after applying changes to the manuscript.    

=== MANUSCRIPT ===
${manuscriptContent}
=== END MANUSCRIPT ===

DENSITY OF EDITING: Please provide moderate line editing, focusing on the most impactful changes rather than attempting to "fix" every possible issue.

Thank you for your thoughtful and respectful approach to line editing.`;

    return prompt;
  }


  /**
   * Convert a number to its word representation (for chapter numbers)
   * @param {number|string} num - The number to convert
   * @returns {string} - Word representation
   */
  numberToWord(num) {
    // Convert string to number if necessary
    num = parseInt(num, 10);
    
    const words = [
      'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
      'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
      'twenty'
    ];
    
    // Handle simple cases
    if (num <= 20) return words[num];
    
    // For simplicity, just return the number as string for larger numbers
    // A more comprehensive implementation would handle all numbers
    return num.toString();
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
   * @param {string} content - Response content
   * @param {string} thinking - Thinking content
   * @param {number} promptTokens - Prompt token count
   * @param {number} responseTokens - Response token count
   * @param {string} saveDir - Directory to save to
   * @param {string} chapterNumber - Chapter number that was analyzed
   * @returns {Promise<string[]>} - Array of paths to saved files
   */
  async saveReport(
    content,
    thinking,
    promptTokens,
    responseTokens,
    saveDir,
    chapterNumber
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
      const baseFilename = `line_editing_chapter_${chapterNumber}_${timestamp}`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];
      
      // Create stats for thinking file
      const stats = `
Details:  ${dateTimeStr}
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
      this.emitOutput(`Line editing analysis saved to: ${reportPath}\n`);
      
      // Save thinking content to a separate file
      const thinkingFilename = `${baseFilename}_thinking.txt`;
      const thinkingPath = path.join(saveDir, thinkingFilename);
      await this.writeOutputFile(thinking + "\n\n" + stats, saveDir, thinkingFilename);
      savedFilePaths.push(thinkingPath);
      this.emitOutput(`AI thinking process saved to: ${thinkingPath}\n`);
      
      return savedFilePaths;
    } catch (error) {
      console.error(`Error saving report:`, error);
      this.emitOutput(`Error saving report: ${error.message}\n`);
      throw error;
    }
  }
}

module.exports = LineEditing;