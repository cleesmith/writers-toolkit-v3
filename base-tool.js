// base-tool.js
const fs = require('fs/promises');
const path = require('path');

/**
 * Base class for all tools
 */
class BaseTool {

  /**
   * Constructor
   * @param {string} name - Tool name
   * @param {object} config - Tool configuration
   */
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    // console.log(`BaseTool initialized: ${name}`);
  }
  
  /**
   * Execute the tool - must be implemented by subclasses
   * @param {object} options - Tool options
   * @returns {Promise<object>} - Tool execution result
   */
  async execute(options) {
    throw new Error(`Tool ${this.name} must implement execute method`);
  }
  
  /**
   * Read a file
   * @param {string} filePath - Path to file
   * @param {string} encoding - File encoding
   * @returns {Promise<string>} - File content
   */
  async readInputFile(filePath, encoding = 'utf-8') {
    try {
      // Handle relative paths by resolving against the current project path
      let resolvedPath = filePath;
      
      // If path is not absolute and doesn't start with ~/ (which will be expanded by Node)
      if (!path.isAbsolute(filePath) && !filePath.startsWith('~/')) {
        // Get current project path from appState
        const projectPath = this.config.save_dir || appState.CURRENT_PROJECT_PATH;
        
        if (projectPath) {
          resolvedPath = path.join(projectPath, filePath);
          console.log(`Resolved relative path "${filePath}" to: "${resolvedPath}"`);
        }
      }
      
      // Read file with resolved path
      const content = await fs.readFile(resolvedPath, encoding);
      if (!content.trim()) {
        throw new Error(`File is empty: ${resolvedPath}`);
      }
      return content;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }
  }  

  /**
   * Write content to a file
   * @param {string} content - Content to write
   * @param {string} saveDir - Directory to save to
   * @param {string} fileName - File name
   * @returns {Promise<string>} - Path to the saved file
   */
  async writeOutputFile(content, saveDir, fileName) {
    try {
      // Ensure the directory exists
      await fs.mkdir(saveDir, { recursive: true });
      
      // Path to the output file
      const outputPath = path.join(saveDir, fileName);
      
      // Write the file
      await fs.writeFile(outputPath, content, 'utf-8');
      
      // Return the absolute path to the file
      return path.resolve(outputPath);
    } catch (error) {
      console.error(`Error writing file ${fileName}:`, error);
      throw error;
    }
  }
  
  /**
   * Emit output to be displayed in the UI
   * This will be overridden by the tool runner
   * @param {string} text - Text to emit
   */
  emitOutput(text) {
    // console.log(text);
  }

  /**
   * Remove Markdown formatting from text
   * @param {string} text - Text with Markdown formatting
   * @returns {string} - Plain text without Markdown
   */
  removeMarkdown(text) {
    const options = {
      listUnicodeChar: false,
      stripListLeaders: true,
      gfm: true,
      useImgAltText: true,
      preserveBlockSpacing: true
    };
    
    let output = text || '';
    // Remove horizontal rules
    output = output.replace(/^(-\s*?|\*\s*?|_\s*?){3,}\s*$/gm, '');
    try {
      // Handle list markers
      if (options.stripListLeaders) {
        if (options.listUnicodeChar) {
          output = output.replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, options.listUnicodeChar + ' $1');
        } else {
          output = output.replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, '$1');
        }
      }
      // Handle GitHub Flavored Markdown features
      if (options.gfm) {
        output = output
          .replace(/\n={2,}/g, '\n')
          .replace(/~{3}.*\n/g, '')
          // Improved code block handling
          .replace(/(`{3,})([\s\S]*?)\1/gm, function(match, p1, p2) {
            return p2.trim() + '%%CODEBLOCK_END%%\n';
          })
          .replace(/~~/g, '');
      }
      // Process main markdown elements
      output = output
        // Remove HTML tags
        .replace(/<[^>]*>/g, '')
        // Remove setext headers
        .replace(/^[=\-]{2,}\s*$/g, '')
        // Remove footnotes
        .replace(/\[\^.+?\](\: .*?$)?/g, '')
        .replace(/\s{0,2}\[.*?\]: .*?$/g, '')
        // Handle images and links
        .replace(/\!\[(.*?)\][\[\(].*?[\]\)]/g, options.useImgAltText ? '$1' : '')
        .replace(/\[(.*?)\][\[\(].*?[\]\)]/g, '$1')
        // Better blockquote handling with spacing
        .replace(/^\s*>+\s?/gm, function(match) {
          return options.preserveBlockSpacing ? '\n' : '';
        })
        // Remove list markers again (thorough cleanup)
        .replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, '$1')
        // Remove reference links
        .replace(/^\s{1,2}\[(.*?)\]: (\S+)( ".*?")?\s*$/g, '')
        // Remove headers
        .replace(/^(\n)?\s{0,}#{1,6}\s+| {0,}(\n)?\s{0,}#{0,} {0,}(\n)?\s{0,}$/gm, '$1$2$3')
        // Remove emphasis
        .replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g, '$2')
        .replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g, '$2')
        // Remove code markers
        .replace(/`(.+?)`/g, '$1');
      // Final cleanup and spacing
      output = output
        // Replace code block markers with proper spacing
        .replace(/%%CODEBLOCK_END%%\n/g, '\n\n\n')
        // Normalize multiple newlines while preserving block spacing
        .replace(/\n{4,}/g, '\n\n\n')
        .replace(/\n{3}/g, '\n\n')
        // Clean up any trailing whitespace
        .trim();
    } catch(e) {
      console.error('Error removing Markdown:', e);
      return text;
    }
    return output;
  }

}

module.exports = BaseTool;
