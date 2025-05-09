const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = require('@google/genai');
const fs = require('fs'); // Node.js File System module

async function main() {
  const apiKeyFromEnv = process.env.GEMINI_API_KEY;
  if (!apiKeyFromEnv) {
    console.error("ERROR: GEMINI_API_KEY environment variable is not set.");
    process.exit(1);
  }

  // 1. Initialize the GoogleGenAI client (Log removed)
  const ai = new GoogleGenAI({ apiKey: apiKeyFromEnv });

  const manuscriptFilePath = 'manuscript.txt';
  let manuscriptContent = '';

  // 2. Read the manuscript file content
  try {
    if (!fs.existsSync(manuscriptFilePath)) {
      console.error(`ERROR: Manuscript file not found at: ${manuscriptFilePath}`);
      process.exit(1);
    }
    manuscriptContent = fs.readFileSync(manuscriptFilePath, 'utf8');
    console.log(`Successfully read content from ${manuscriptFilePath} (Size: ${Buffer.byteLength(manuscriptContent, 'utf8')} bytes).`);
  } catch (fileReadError) {
    console.error(`ERROR: Failed to read file '${manuscriptFilePath}'.`);
    console.error("File read error details:", fileReadError.message);
    process.exit(1);
  }

  // 3. Define the model name
  const modelName = 'gemini-2.5-pro-preview-05-06';

  // 4. Define generation configuration
  const generationConfiguration = {
    responseMimeType: 'text/plain',
  };

  // 5. Prepare the content parts for the prompt
  const contentsForRequest = [
    {
      role: 'user',
      parts: [
        { text: manuscriptContent }, // Manuscript content is the first part
        { // Instructions are the second part
          text: `\n\n---\nINSTRUCTIONS:\nYour responses must be in PLAIN TEXT ONLY.
ABSOLUTELY DO NOT use any Markdown formatting (such as **, *, #, lists with -, etc.) in any part of your response.

You will proofread the creative fiction manuscript provided above the '--- INSTRUCTIONS:' line.
Focus ONLY on grammar, spelling, and punctuation issues.

DO NOT include any introductory or concluding remarks (e.g., "Okay, here's a proofread...", "Overall, the manuscript is...").
DO NOT repeat any parts of the manuscript that are correct or do not have issues.
Your response should ONLY consist of the identified issues, formatted as follows for EACH issue found:

Original: [The complete original sentence from the manuscript with the error, exactly as it appears, with no extra quotation marks added by you around the sentence itself.]
Issue(s): [A brief description of the specific grammar, spelling, or punctuation problem(s) in that sentence.]
Correction: [The complete corrected sentence.]

After each "Correction:", add two newlines before presenting the "Original:" of the next identified issue.

For example, if the manuscript contained these lines:
Its a lovely day. The dog runned fast. See the cat.

Your response should be formatted exactly like this:

Original: Its a lovely day.
Issue(s): Spelling - "Its" should be "It's" (contraction of "it is" or "it has").
Correction: It's a lovely day.


Original: The dog runned fast.
Issue(s): Grammar - Incorrect past tense of "run".
Correction: The dog ran fast.

Now, please provide the proofread for the manuscript above using this exact format.
`,
        },
      ],
    }
  ];

  // Log only the instructions part of the prompt being sent
  const instructionsTextForLogging = contentsForRequest[0].parts[1].text;
  console.log(`\n--- Sending Prompt to Model (${modelName}) ---`);
  console.log(`Instructions Sent to Model:\n${instructionsTextForLogging}`);
  // console.log(`(Full prompt includes the manuscript content beforehand)`); // Optional clarification
  console.log(`--- End of Instructions Sent ---`);


  try {
    if (!(ai.models && typeof ai.models.generateContentStream === 'function')) {
      console.error("CRITICAL ERROR: 'ai.models.generateContentStream' is NOT a function.");
      process.exit(1);
    }

    // --- LIVE TIMER START ---
    const apiCallStartTime = new Date();
    console.log(`\nAPI Call Start Time: ${apiCallStartTime.toLocaleTimeString()}\n`);
    // Initial timer display - \r is carriage return to overwrite the line
    process.stdout.write("elapsed: 0m 0s");

    let timerInterval;
    const updateTimer = () => {
      const now = new Date();
      const elapsedMs = now.getTime() - apiCallStartTime.getTime();
      const totalSeconds = Math.floor(elapsedMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      // Move cursor to beginning of line, clear line, then write new time
      process.stdout.cursorTo(0); // Go to beginning of the line
      process.stdout.clearLine(0); // Clear the current line
      process.stdout.write(`elapsed: ${minutes}m ${seconds}s`);
    };
    timerInterval = setInterval(updateTimer, 1000); // Update every second
    // --- END LIVE TIMER START ---

    let lastUsageMetadata = null;

    const responseStream = await ai.models.generateContentStream({
      model: modelName,
      contents: contentsForRequest,
      generationConfig: generationConfiguration,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ],
    });

    clearInterval(timerInterval); // Stop the timer updating
    // MODIFICATION: Do NOT clear the timer line. Add a newline so subsequent logs appear below.
    process.stdout.write('\n'); // Ensure next log is on a new line below the frozen timer.

    const callEndTime = new Date();
    console.log(`\nAPI Call End Time (stream initiated): ${callEndTime.toLocaleTimeString()}\n`);
    const durationMs = callEndTime.getTime() - apiCallStartTime.getTime();
    const durationSeconds = durationMs / 1000;
    const displayTotalSeconds = Math.floor(durationSeconds); // Get whole seconds
    const displayMinutes = Math.floor(displayTotalSeconds / 60);
    const displayRemainingSeconds = displayTotalSeconds % 60;
    console.log(`Time to initiate stream: ${displayMinutes}m ${displayRemainingSeconds}s`);

    console.log("\nCall to ai.models.generateContentStream has returned, processing stream...");

    console.log("\n--- Gemini Response Stream ---");
    let output = "";
    let chunkCount = 0;
    const streamProcessingStartTime = new Date();

    for await (const chunk of responseStream) {
      chunkCount++;
      if (chunk.usageMetadata) {
        lastUsageMetadata = chunk.usageMetadata;
      }
      if (chunk && chunk.candidates && chunk.candidates.length > 0 &&
          chunk.candidates[0].content && chunk.candidates[0].content.parts &&
          chunk.candidates[0].content.parts.length > 0 &&
          typeof chunk.candidates[0].content.parts[0].text === 'string') {
        const textContent = chunk.candidates[0].content.parts[0].text;
        output += textContent;
        process.stdout.write(textContent);
      } else if (chunk && chunk.error) {
        console.error(`\nERROR in stream chunk ${chunkCount}:`, JSON.stringify(chunk.error));
        break;
      } else {
        console.warn(`\nSkipping unrecognized or non-text chunk structure in stream (chunk ${chunkCount}):`, JSON.stringify(chunk));
      }
    }
    process.stdout.write('\n');

    if (lastUsageMetadata) {
      console.log(`\n--- Usage Statistics (from last relevant chunk) ---`);
      console.log(`Prompt Token Count: ${lastUsageMetadata.promptTokenCount}`);
      // The 'candidatesTokenCount' in the streaming response usually accumulates
      // and the one in the *last* chunk with usageMetadata represents the total for candidates.
      console.log(`Candidates Token Count: ${lastUsageMetadata.candidatesTokenCount}`);
      console.log(`Total Token Count: ${lastUsageMetadata.totalTokenCount}`);

      // Optional: Check for other specific fields you might have seen
      if (lastUsageMetadata.promptTokensDetails) {
        // console.log(`Prompt Tokens Details:`, JSON.stringify(lastUsageMetadata.promptTokensDetails, null, 2));
      }
      if (lastUsageMetadata.thoughtsTokenCount !== undefined) {
        console.log(`Thoughts Token Count: ${lastUsageMetadata.thoughtsTokenCount}`);
      }
      // For full inspection:
      // console.log("Full Final Usage Metadata:", JSON.stringify(lastUsageMetadata, null, 2));
      console.log(`--- End Usage Statistics ---`);
    } else {
      console.log("\nNo usage metadata was found in the response stream.");
    }

    const streamProcessingEndTime = new Date();
    const streamDurationMs = streamProcessingEndTime.getTime() - streamProcessingStartTime.getTime();
    const streamDurationSeconds = streamDurationMs / 1000;

    if (chunkCount === 0) {
        console.log("WARNING: Stream completed with 0 chunks containing parsable text.");
    }
    console.log(`--- End of Stream (processed ${chunkCount} chunks in ${streamDurationSeconds.toFixed(2)} seconds) ---`);

    const totalEndTime = new Date();
    const totalDurationMs = totalEndTime.getTime() - apiCallStartTime.getTime();
    const totalDurationSeconds = totalDurationMs / 1000;
    // console.log(`\nTotal operation time (API call + stream processing): ${totalDurationSeconds.toFixed(2)} seconds.`);
    const wholeSeconds = Math.floor(totalDurationSeconds);
    console.log(`\nTotal operation time (API call + stream processing): ${Math.floor(wholeSeconds / 60)}m ${wholeSeconds % 60}s.`);

  } catch (error) {
    // --- Ensure timer is cleared on error too ---
    if (timerInterval) {
        clearInterval(timerInterval);
        // MODIFICATION: Do NOT clear the timer line if error occurs after it started. Add a newline.
        process.stdout.write('\n');
    }
    // ---
    console.error("\nERROR during 'ai.models.generateContentStream' call or stream processing:");
    console.error("Error message:", error.message);
    if (error.stack) console.error("Stack:", error.stack);
    if (error.cause) console.error("Cause:", error.cause);
    if (error.response) {
        console.error("API Response (if available from error object):", JSON.stringify(error.response, null, 2));
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error("\n--- A FATAL UNHANDLED ERROR OCCURRED IN main() ---");
  console.error("Error message:", error.message);
  if (error.stack) console.error("Stack trace:", error.stack);
  if (error.cause) console.error("Cause:", error.cause);
  process.exit(1);
});
