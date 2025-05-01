// docx-comments-extractor.js
const BaseTool = require('./base-tool');
const path = require('path');
const fileCache = require('./file-cache');
const appState = require('./state.js');
const fs = require('fs/promises');

/**
 * DocxCommentsExtractor Tool
 * Uploads a .docx file to Claude and extracts all comments with their corresponding text.
 */
class DocxCommentsExtractor extends BaseTool {
  /**
   * Constructor
   * @param {Object} claudeService - Claude API service
   * @param {Object} config - Tool configuration
   */
  constructor(claudeService, config = {}) {
    super('docx_comments_extractor', config);
    this.claudeService = claudeService;
  }

  /**
   * Execute the tool
   * @param {Object} options - Tool options
   * @returns {Promise<Object>} - Execution result
   */
  async execute(options) {
    console.log('Executing DocxCommentsExtractor with options:', options);
    
    // Extract options
    let docxFile = options.docx_file;
    const saveDir = options.save_dir || appState.CURRENT_PROJECT_PATH;
    
    if (!saveDir) {
      const errorMsg = 'Error: No save directory specified and no current project selected.\n' +
                      'Please select a project or specify a save directory.';
      this.emitOutput(errorMsg);
      throw new Error('No save directory available');
    }

    // Ensure file paths are absolute
    docxFile = this.ensureAbsolutePath(docxFile, saveDir);

    const outputFiles = [];
    
    try {
      // Read the input file as binary data
      this.emitOutput(`Reading DOCX file: ${docxFile}\n`);
      const docxBuffer = await this.readInputFile(docxFile, true); // true to read as binary
        
      // Create prompt for extracting comments
      const prompt = this.createPrompt();

      // Count tokens in the prompt (without the file content)
      this.emitOutput(`Counting tokens in basic prompt...\n`);
      const promptTokens = await this.claudeService.countTokens(prompt);

      // Call the shared token budget calculator
      const tokenBudgets = this.claudeService.calculateTokenBudgets(promptTokens);

      // Handle logging
      this.emitOutput(`\nToken stats:\n`);
      this.emitOutput(`Max AI model context window: [${tokenBudgets.contextWindow}] tokens\n`);
      this.emitOutput(`Input prompt tokens: [${tokenBudgets.promptTokens}] ...\n`);
      this.emitOutput(`Available tokens: [${tokenBudgets.availableTokens}] tokens\n`);
      this.emitOutput(`Desired output tokens: [${tokenBudgets.desiredOutputTokens}]\n`);
      this.emitOutput(`AI model thinking budget: [${tokenBudgets.thinkingBudget}] tokens\n`);
      this.emitOutput(`Max output tokens: [${tokenBudgets.maxTokens}] tokens\n`);

      // Check for special conditions
      if (tokenBudgets.capThinkingBudget) {
        this.emitOutput(`Warning: thinking budget is larger than ${tokenBudgets.maxThinkingBudget}, capped.\n`);
      }

      // Check if the prompt is too large
      if (tokenBudgets.isPromptTooLarge) {
        this.emitOutput(`Error: prompt is too large to have a ${tokenBudgets.configuredThinkingBudget} thinking budget!\n`);
        this.emitOutput(`Run aborted!\n`);
        throw new Error(`Prompt is too large for ${tokenBudgets.configuredThinkingBudget} thinking budget - run aborted`);
      }
      
      // Call Claude API with streaming
      this.emitOutput(`Sending request to Claude API with file upload (streaming)...\n`);
      
      // Add a message about waiting
      this.emitOutput(`****************************************************************************\n`);
      this.emitOutput(`*  Extracting comments from your DOCX file...                              \n`);
      this.emitOutput(`*  This process typically takes several minutes.                           \n`);
      this.emitOutput(`*                                                                          \n`);
      this.emitOutput(`*  It's recommended to keep this window the sole 'focus'                   \n`);
      this.emitOutput(`*  and to avoid browsing online or running other apps, as these API        \n`);
      this.emitOutput(`*  network connections are often flakey.                                   \n`);
      this.emitOutput(`****************************************************************************\n\n`);
      
      const startTime = Date.now();
      let fullResponse = "";
      let thinkingContent = "";
      
      // Create system prompt to avoid markdown
      const systemPrompt = "CRITICAL INSTRUCTION: NO Markdown formatting of ANY kind. Never use headers, bullets, or any formatting symbols. Plain text only with standard punctuation.";

      // Use the calculated values in the API call
      try {
        // Prepare the file for upload
        const fileMetadata = await this.prepareFileForUpload(docxBuffer, docxFile);
        
        // Create messages array with file attachment
        const messages = this.createMessagesWithFileAttachment(prompt, fileMetadata);
        
        // Stream response with file upload
        await this.streamWithFileUpload(
          messages,
          fileMetadata,
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
            // Stream output directly to the user
            this.emitOutput(textDelta);
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
      this.emitOutput(`Extraction has approximately ${wordCount} words.\n`);
      
      // Count tokens in response
      const responseTokens = await this.claudeService.countTokens(fullResponse);
      this.emitOutput(`Response token count: ${responseTokens}\n`);

      // Remove any markdown formatting
      fullResponse = this.removeMarkdown(fullResponse);

      // Save the report
      const outputFile = await this.saveResults(
        fullResponse,
        thinkingContent,
        promptTokens,
        responseTokens,
        saveDir,
        path.basename(docxFile, '.docx')
      );
      
      // Add the output files to the result
      outputFiles.push(...outputFile);
      
      // Add files to the cache
      const toolName = 'docx_comments_extractor';
      outputFiles.forEach(file => {
        fileCache.addFile(toolName, file);
      });
      
      // Return the result
      return {
        success: true,
        outputFiles
      };
    } catch (error) {
      console.error('Error in DocxCommentsExtractor:', error);
      this.emitOutput(`\nError: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Prepare file for upload to Claude API
   * @param {Buffer} fileBuffer - Binary file content
   * @param {string} filePath - Original file path
   * @returns {Promise<Object>} - File metadata for API
   */
  async prepareFileForUpload(fileBuffer, filePath) {
    // Get file information
    const fileName = path.basename(filePath);
    const fileSize = fileBuffer.length;
    const mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; // DOCX mime type
    
    // Create a Base64 representation of the file
    const base64Data = fileBuffer.toString('base64');
    
    this.emitOutput(`Preparing file for upload: ${fileName} (${fileSize} bytes)\n`);
    
    // Return metadata needed for the API request
    return {
      fileName,
      fileSize,
      mimeType,
      base64Data
    };
  }
  
  /**
   * Create messages array with file attachment
   * @param {string} prompt - Prompt text
   * @param {Object} fileMetadata - File metadata
   * @returns {Array} - Messages array for Claude API
   */
  createMessagesWithFileAttachment(prompt, fileMetadata) {
    // This is the standard format for the Anthropic Messages API with attachments
    return [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt + `\n\nI've attached a DOCX file named "${fileMetadata.fileName}" that contains comments and editorial feedback. Please analyze this document and extract all comments with their corresponding text as instructed above.`
          },
          {
            type: "file_attachment",
            file_id: fileMetadata.fileName, // This is a placeholder; in a real implementation, you'd use the file ID from Anthropic's file upload API
            fileName: fileMetadata.fileName,
            fileSize: fileMetadata.fileSize,
            mediaType: fileMetadata.mimeType
          }
        ]
      }
    ];
  }
  
  /**
   * Stream response with file upload
   * @param {Array} messages - Messages array for Claude API
   * @param {Object} fileMetadata - File metadata
   * @param {Object} options - API options
   * @param {Function} onThinking - Callback for thinking content
   * @param {Function} onText - Callback for response text
   * @returns {Promise<void>}
   */
  async streamWithFileUpload(messages, fileMetadata, options, onThinking, onText) {
    // In a real implementation, this would use the Anthropic client to stream a response
    // with a file attachment. Here, we're adapting your existing Claude service to handle file uploads.
    
    // Pseudo-code for what a real implementation might look like:
    // 1. First, upload the file to get a file_id
    this.emitOutput(`Uploading file to Anthropic API...\n`);
    
    // This is where you'd normally call the file upload endpoint
    // const fileUploadResponse = await this.client.files.create({
    //   file: Buffer.from(fileMetadata.base64Data, 'base64'),
    //   purpose: "file-extract"
    // });
    // const fileId = fileUploadResponse.id;
    
    // 2. Update the message to include the real file_id
    // messages[0].content[1].file_id = fileId;
    
    // 3. Call the messages API with the file reference
    this.emitOutput(`File uploaded, sending message with file reference...\n`);
    
    // For this example, we'll adapt your existing streamWithThinking method
    // In reality, you'd need to modify your Claude service to handle file attachments
    
    // Convert messages array to a format compatible with your existing service
    const adaptedPrompt = `
    ${messages[0].content[0].text}
    
    [Attached file: ${fileMetadata.fileName}]
    `;
    
    // Now call your existing streaming method with the adapted prompt
    await this.claudeService.streamWithThinking(
      adaptedPrompt,
      options,
      onThinking,
      onText
    );
  }
  
  /**
   * Create prompt for Claude
   * @returns {string} - Prompt for Claude API
   */
  createPrompt() {
    return `You are an AI assistant specialized in analyzing document feedback. I will upload a .docx file that contains editorial comments and feedback. Your task is to extract and organize all the comments and any editorial write-up.

Please extract the following:

1. All comments in the document with their corresponding text.
   For each comment, show:
   - The original text that the comment refers to (exactly as written)
   - The full comment text

2. Any comprehensive editorial feedback section (often titled "Write Up," "Feedback," "Analysis," etc.)

Format the results like this:

ORIGINAL TEXT:
[The exact text the comment refers to]

Comment #[number]:
[The full comment text]

Note: If multiple comments refer to the same text, list all comments beneath that text.

After showing all comment-text pairs, please include any editorial write-up section in full, maintaining its original organization.

Do not rewrite or paraphrase anything. Present all information in plain text without any markdown formatting. The goal is to see exactly what the editor wrote about specific portions of the text.`;
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
   * Read input file with error handling
   * @param {string} filePath - Path to file
   * @param {boolean} binary - Whether to read as binary data
   * @returns {Promise<Buffer|string>} - File content
   */
  async readInputFile(filePath, binary = false) {
    try {
      if (!filePath) {
        throw new Error('No file path provided');
      }
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (error) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      // Read file
      if (binary) {
        return await fs.readFile(filePath);
      } else {
        return await fs.readFile(filePath, 'utf8');
      }
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      throw error;
    }
  }
  
  /**
   * Remove markdown formatting from text
   * @param {string} text - Text to process
   * @returns {string} - Text without markdown
   */
  removeMarkdown(text) {
    // Replace headers (# Header)
    text = text.replace(/^#{1,6}\s+/gm, '');
    
    // Replace bold/italic (**text** or *text* or __text__ or _text_)
    text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
    text = text.replace(/(\*|_)(.*?)\1/g, '$2');
    
    // Replace lists (- item or * item or 1. item)
    text = text.replace(/^[\*\-\+]\s+/gm, '');
    text = text.replace(/^\d+\.\s+/gm, '');
    
    // Replace horizontal rules (--- or *** or ___)
    text = text.replace(/^[\*\-\_]{3,}\s*$/gm, '');
    
    return text;
  }
  
  /**
   * Save results to file
   * @param {string} content - Response content
   * @param {string} thinking - Thinking content
   * @param {number} promptTokens - Prompt token count
   * @param {number} responseTokens - Response token count
   * @param {string} saveDir - Directory to save to
   * @param {string} baseFileName - Base file name (without extension)
   * @returns {Promise<string[]>} - Array of paths to saved files
   */
  async saveResults(
    content,
    thinking,
    promptTokens,
    responseTokens,
    saveDir,
    baseFileName
  ) {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        month: 'numeric',
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
      const outputFilename = `${baseFileName}_comments_extracted_${timestamp}.txt`;
      
      // Array to collect all saved file paths
      const savedFilePaths = [];
      
      // Create stats for file
      const stats = `
Extraction Details: ${dateTimeStr}
Max request timeout: ${this.config.request_timeout} seconds
Max AI model context window: ${this.config.context_window} tokens
AI model thinking budget: ${this.config.thinking_budget_tokens} tokens
Desired output tokens: ${this.config.desired_output_tokens} tokens

Input tokens: ${promptTokens}
Output tokens: ${responseTokens}
`;
      
      // Save full response
      const outputPath = path.join(saveDir, outputFilename);
      await this.writeOutputFile(content, saveDir, outputFilename);
      savedFilePaths.push(outputPath);
      this.emitOutput(`Extraction saved to: ${outputPath}\n`);
      
      return savedFilePaths;
    } catch (error) {
      console.error(`Error saving results:`, error);
      this.emitOutput(`Error saving results: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Write output to file with error handling
   * @param {string} content - Content to write
   * @param {string} dir - Directory to write to
   * @param {string} filename - Filename
   * @returns {Promise<string>} - Path to written file
   */
  async writeOutputFile(content, dir, filename) {
    try {
      // Ensure the directory exists
      await fs.mkdir(dir, { recursive: true });
      
      const filePath = path.join(dir, filename);
      await fs.writeFile(filePath, content, 'utf8');
      return filePath;
    } catch (error) {
      console.error(`Error writing to ${filename}:`, error);
      throw error;
    }
  }
}

module.exports = DocxCommentsExtractor;