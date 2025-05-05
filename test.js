// Import the text processor module
const textProcessor = require('./textProcessor');
const fs = require('fs');

// Example text to process - matches the terminal output example
const sampleText = `
Chapter 1: the one

This is the first paragraph of chapter one.

This is the second paragraph.


This is after two blank lines.



This is after three blank lines.


Chapter 2. the deuce

This is the first paragraph of chapter two.

This is the second paragraph.

CHAPTER 3: another title

This shows case-insensitive matching.
`;

// console.log("Original Text:");
// console.log("=============");
// console.log(sampleText);

// console.log("\nProcessed Text:");
// console.log("==============");
// console.log(textProcessor.processText(sampleText));

// Function to process a real manuscript file
function processFile(inputPath, outputPath) {
  try {
    // Read the input file
    const text = fs.readFileSync(inputPath, 'utf8');
    
    // Process the text
    const processed = textProcessor.processText(text);
    
    // Write the processed text to the output file
    fs.writeFileSync(outputPath, processed);
    
    console.log(`\nSuccessfully processed file from ${inputPath} to ${outputPath}`);
  } catch (error) {
    console.error('Error processing file:', error);
  }
}

// Uncomment the following line to process an actual manuscript file
processFile('manuscript_hattie.txt', 'manuscript-raw.txt');
console.log("\nProcessed Text:");
console.log("==============");
console.log(textProcessor.processText(sampleText));

