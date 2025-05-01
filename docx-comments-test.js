// docx-comments-extractor.js
// For use with @anthropic-ai/sdk@0.39.0
// Extracts comments from a DOCX file using Claude 3.7 Sonnet
// Usage: node docx-comments-extractor.js path/to/your-document.docx [output-directory]

const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { Anthropic } = require('@anthropic-ai/sdk');
require('dotenv').config();

// Configuration
const CONFIG = {
  model_name: "claude-3-7-sonnet-20250219",
  max_tokens: 12000
};

async function extractCommentsFromDocx(docxFilePath, outputDir) {
  console.log('Starting DOCX comment extraction');
  console.log('File:', docxFilePath);
  
  // Validate API key
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not found in environment variables");
  }
  
  // Create Anthropic client
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });
  
  try {
    // Verify file exists
    await fsPromises.access(docxFilePath);
    
    // Prepare the content message
    const prompt = 'Extract all comments from this DOCX file along with the text they refer to. ' +
      'Format as "ORIGINAL TEXT:" followed by the text, then "Comment #X:" followed by the comment. ' +
      'Include any editorial sections like "Write Up" in full at the end.';
    
    console.log('Preparing request to Claude API...');
    console.log('Using model:', CONFIG.model_name);
    console.log('Max tokens:', CONFIG.max_tokens);
    
    const startTime = Date.now();
    
    // Read file as binary data and convert to base64
    const fileBuffer = await fsPromises.readFile(docxFilePath);
    const base64File = fileBuffer.toString('base64');
    
    // Create message with document attachment using correct type
    const response = await client.messages.create({
      model: CONFIG.model_name,
      max_tokens: CONFIG.max_tokens,
      system: "Extract comments from DOCX files accurately and completely.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                data: base64File
              }
            }
          ]
        }
      ]
    });
    
    // Extract the text content from the response
    const fullResponse = response.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
    
    // Calculate elapsed time
    const elapsed = (Date.now() - startTime) / 1000;
    const minutes = Math.floor(elapsed / 60);
    const seconds = Math.floor(elapsed % 60);
    
    console.log('Extraction complete!');
    console.log(`Process took ${minutes}m ${seconds}s`);
    
    // Ensure output directory exists
    await fsPromises.mkdir(outputDir, { recursive: true });
    
    // Create output filename with timestamp
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
    const baseFileName = path.basename(docxFilePath, '.docx');
    const outputFilename = `${baseFileName}_comments_${timestamp}.txt`;
    const outputPath = path.join(outputDir, outputFilename);
    
    // Save results
    await fsPromises.writeFile(outputPath, fullResponse, 'utf8');
    
    console.log('Results saved to:', outputPath);
    
    return { outputPath };
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response && error.response.data) {
      console.error('API Response:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: node docx-comments-extractor.js <path-to-docx-file> [output-directory]');
    process.exit(1);
  }
  
  const docxFilePath = args[0];
  const outputDir = args.length > 1 ? args[1] : './output';
  
  extractCommentsFromDocx(docxFilePath, outputDir)
    .then(result => {
      console.log('Comment extraction completed successfully.');
      process.exit(0);
    })
    .catch(error => {
      console.error('Extraction failed:', error.message);
      process.exit(1);
    });
}