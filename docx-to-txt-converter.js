/**
 * DOCX to TXT Converter for Writer's Toolkit
 * 
 * This script converts a .docx file to a plain text file,
 * preserving chapter structure and paragraphs with proper spacing.
 * 
 * Usage:
 * 1. Install dependencies: npm install mammoth jsdom
 * 2. Update the INPUT_DOCX path to your .docx file
 * 3. Run: node final-docx-converter.js
 */

const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

// Configure file paths - update these to your document location
const INPUT_DOCX = path.join(__dirname, 'OvidsTenth.docx'); // Update to your document
const OUTPUT_TXT = path.join(__dirname, 'manuscript_OT.txt');

// Headings that indicate end of content (e.g., back matter)
const STOP_TITLES = ["about the author", "website", "acknowledgments", "appendix"];

/**
 * Converts a DOCX file to a structured plain text file
 * @param {string} docxPath - Path to the input .docx file
 * @param {string} outputPath - Path for the output .txt file
 * @returns {Promise<boolean>} - Success or failure
 */
async function convertDocxToText(docxPath, outputPath) {
  try {
    console.log(`Converting: ${docxPath}`);
    
    // Convert DOCX to HTML - this matches what the web tool does
    const result = await mammoth.convertToHtml({ path: docxPath });
    const htmlContent = result.value;
    
    // Parse the HTML using jsdom
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    
    // Get all block elements (similar to web tool's approach)
    const blocks = document.querySelectorAll("p, h1, h2, h3, h4, h5, h6");
    
    // Process blocks to extract chapters
    let chapters = [];
    let currentChapter = null;
    let ignoreFrontMatter = true;
    let ignoreRest = false;
    
    // Convert NodeList to Array for iteration
    Array.from(blocks).forEach(block => {
      if (ignoreRest) return;
      
      const tagName = block.tagName.toLowerCase();
      const textRaw = block.textContent.trim();
      const textLower = textRaw.toLowerCase();
      
      // Skip everything until first <h1>
      if (ignoreFrontMatter) {
        if (tagName === "h1") {
          ignoreFrontMatter = false;
        } else {
          return;
        }
      }
      
      // If this heading is a "stop" heading, ignore the rest
      if (tagName.startsWith("h") && STOP_TITLES.some(title => textLower.startsWith(title))) {
        ignoreRest = true;
        return;
      }
      
      // If we see a new <h1>, that means a new chapter
      if (tagName === "h1") {
        currentChapter = {
          title: textRaw,
          textBlocks: []
        };
        chapters.push(currentChapter);
      }
      else {
        // If there's no current chapter yet, create one
        if (!currentChapter) {
          currentChapter = { title: "Untitled Chapter", textBlocks: [] };
          chapters.push(currentChapter);
        }
        // Add the block text if not empty
        if (textRaw) {
          currentChapter.textBlocks.push(textRaw);
        }
      }
    });
    
    // Build the manuscript text with proper spacing - SIMPLE VERSION
    let manuscriptText = "";
    
    chapters.forEach((ch, idx) => {
      // Two newlines before each chapter title
      if (idx === 0) {
        manuscriptText += "\n\n";
      } else {
        manuscriptText += "\n\n\n";
      }
      
      // Add chapter title
      manuscriptText += ch.title;
      
      // One newline after chapter title
      manuscriptText += "\n\n";
      
      // Add paragraphs with one blank line between them
      manuscriptText += ch.textBlocks.join("\n\n");
    });
    
    // Write to output file
    fs.writeFileSync(outputPath, manuscriptText);
    
    // Print summary information
    console.log(`Conversion complete. Output saved to: ${outputPath}`);
    console.log(`Found ${chapters.length} chapters`);
    
    if (chapters.length > 0) {
      console.log('\nChapter titles:');
      chapters.forEach((ch, idx) => {
        console.log(`${idx + 1}. ${ch.title}`);
      });
    } else {
      console.log('\nWarning: No chapters detected. Make sure your document has <h1> headers.');
    }
    
    return true;
  } catch (error) {
    console.error('Error converting DOCX:', error);
    return false;
  }
}

// Run the conversion
convertDocxToText(INPUT_DOCX, OUTPUT_TXT)
  .then(success => {
    if (success) {
      console.log('\nSuccess! Your manuscript is ready.');
    } else {
      console.log('\nConversion failed. See error details above.');
    }
  });
