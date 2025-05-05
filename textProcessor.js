/**
 * This script provides text processing functions for manuscript formatting:
 * 1. Remove chapter title lines (pattern "Chapter X: [any title]" or "Chapter X. [any title]")
 * 2. Normalize multiple blank lines to single blank lines
 */

/**
 * Removes lines that match chapter title patterns (case-insensitive)
 * Works with both "Chapter X: title" and "Chapter X. title" formats
 * @param {string} text - The input text to process
 * @return {string} - Text with chapter title lines removed
 */
function removeChapterTitleLines(text) {
  // Match lines that contain only "chapter" (case-insensitive) followed by a number,
  // then either a colon or period, and any title text
  return text.replace(/^chapter \d+[:.] .*$/gim, '');
}

/**
 * Normalize all multiple blank lines to single blank lines
 * @param {string} text - The input text to process
 * @return {string} - Text with consistent single blank lines
 */
function normalizeBlankLines(text) {
  // Replace all instances of multiple blank lines with a single blank line
  return text.replace(/\n{2,}/g, '\n\n');
}

/**
 * Process text by applying all operations in sequence
 * @param {string} text - The input text to process
 * @return {string} - Fully processed text
 */
function processText(text) {
  // First remove chapter title lines
  let processed = removeChapterTitleLines(text);
  
  // Then normalize all blank lines
  processed = normalizeBlankLines(processed);
  
  // Remove any leading blank lines that might remain after chapter title removal
  processed = processed.replace(/^\s+/, '');
  
  // Remove any trailing blank lines
  processed = processed.replace(/\s+$/, '');
  
  return processed;
}

// Export all the functions so they can be imported in other files
module.exports = {
  removeChapterTitleLines,
  normalizeBlankLines,
  processText
};
