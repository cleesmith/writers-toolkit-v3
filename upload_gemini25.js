const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = require('@google/genai');
const fs = require('fs');
const path = require('path');

async function main() {
  const apiKeyFromEnv = process.env.GEMINI_API_KEY;
  if (!apiKeyFromEnv) {
    console.error("ERROR: GEMINI_API_KEY environment variable is not set.");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey: apiKeyFromEnv });

  const manuscriptFilePath = 'manuscript.txt';
  let manuscriptContent = ''; // For size log

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

  let uploadedFileMetadata;
  try {
    console.log(`\n--- Uploading File to Gemini via ai.files.upload: ${manuscriptFilePath} ---`);
    const uploadStartTime = new Date();

    const uploadParams = {
      file: manuscriptFilePath,
      config: {
        mimeType: 'text/plain',
        displayName: `Manuscript: ${path.basename(manuscriptFilePath)}`
      }
    };

    let uploadResponse;

    if (ai.files && typeof ai.files.upload === 'function') {
      console.log("Using ai.files.upload() with params:", JSON.stringify(uploadParams, null, 2));
      uploadResponse = await ai.files.upload(uploadParams);
    } else {
      console.error("CRITICAL ERROR: 'ai.files.upload' is NOT a function on the initialized 'ai' object. Cannot proceed with file upload.");
      process.exit(1);
    }

    if (uploadResponse && uploadResponse.uri && uploadResponse.mimeType) {
      uploadedFileMetadata = uploadResponse;
    } else {
      console.error("ERROR: Uploaded file response from 'ai.files.upload' is not in the expected 'File' object format or is missing 'uri'/'mimeType'.");
      console.error("Received response:", JSON.stringify(uploadResponse, null, 2));
      process.exit(1);
    }

    const uploadEndTime = new Date();
    const uploadDurationMs = uploadEndTime.getTime() - uploadStartTime.getTime();
    console.log(`File uploaded successfully via ai.files in ${(uploadDurationMs / 1000).toFixed(2)} seconds.`);
    console.log(`Uploaded File URI: ${uploadedFileMetadata.uri}`);
    console.log(`Uploaded File MIME Type: ${uploadedFileMetadata.mimeType}`);
    if (uploadedFileMetadata.name) console.log(`Uploaded File Name (ID): ${uploadedFileMetadata.name}`);
    if (uploadedFileMetadata.displayName) console.log(`Uploaded File Display Name: ${uploadedFileMetadata.displayName}`);
    if (uploadedFileMetadata.sizeBytes) console.log(`Uploaded File Size (from API): ${uploadedFileMetadata.sizeBytes} bytes`);
    console.log(`--- End of File Upload ---`);

  } catch (uploadError) {
    console.error(`\nERROR: Failed to upload file '${manuscriptFilePath}' to Gemini via ai.files.`);
    console.error("File upload error details:", uploadError.message);
    if (uploadError.stack) console.error("Stack:", uploadError.stack);
    if (uploadError.response && uploadError.response.data) {
        console.error("API Error Data:", JSON.stringify(uploadError.response.data, null, 2));
    } else if (uploadError.cause) {
        console.error("Cause:", uploadError.cause);
    }
    process.exit(1);
  }

  const modelName = 'gemini-2.5-pro-preview-05-06';
  const generationConfiguration = {
    responseMimeType: 'text/plain',
  };

  const contentsForRequest = [ /* ... same as before ... */
    {
      role: 'user',
      parts: [
        {
          fileData: {
            mimeType: uploadedFileMetadata.mimeType,
            fileUri: uploadedFileMetadata.uri,
          },
        },
        {
          text: `\n\n---\nINSTRUCTIONS:\nYour responses must be in PLAIN TEXT ONLY.
ABSOLUTELY DO NOT use any Markdown formatting (such as **, *, #, lists with -, etc.) in any part of your response.

You will proofread the creative fiction manuscript provided above the '--- INSTRUCTIONS:' line (which is now an uploaded file).
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


  const instructionsTextForLogging = contentsForRequest[0].parts[1].text;
  console.log(`\n--- Sending Prompt to Model (${modelName}) ---`);
  console.log("(Prompt references the uploaded manuscript file)");
  console.log(`Instructions Sent to Model:\n${instructionsTextForLogging}`);
  console.log(`--- End of Instructions Sent ---`);

  let timerInterval;

  try {
    if (!(ai.models && typeof ai.models.generateContentStream === 'function')) {
      console.error("CRITICAL ERROR: 'ai.models.generateContentStream' is NOT a function.");
      process.exit(1);
    }

    const apiCallStartTime = new Date();
    console.log(`\nAPI Call Start Time: ${apiCallStartTime.toLocaleTimeString()}\n`);
    process.stdout.write("elapsed: 0m 0s");
    const updateTimer = () => {
      const now = new Date();
      const elapsedMs = now.getTime() - apiCallStartTime.getTime();
      const totalSeconds = Math.floor(elapsedMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      process.stdout.cursorTo(0);
      process.stdout.clearLine(0);
      process.stdout.write(`elapsed: ${minutes}m ${seconds}s`);
    };
    timerInterval = setInterval(updateTimer, 1000);

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

    clearInterval(timerInterval);
    process.stdout.write('\n');

    const callEndTime = new Date();
    console.log(`\nAPI Call End Time (stream initiated): ${callEndTime.toLocaleTimeString()}\n`);
    const durationMs = callEndTime.getTime() - apiCallStartTime.getTime();
    const durationSeconds = durationMs / 1000;
    const displayTotalSeconds = Math.floor(durationSeconds);
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
      // ... (rest of stream processing logic)
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
      console.log(`Candidates Token Count: ${lastUsageMetadata.candidatesTokenCount}`);
      console.log(`Total Token Count: ${lastUsageMetadata.totalTokenCount}`);
      if (lastUsageMetadata.thoughtsTokenCount !== undefined) {
        console.log(`Thoughts Token Count: ${lastUsageMetadata.thoughtsTokenCount}`);
      }
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
    const wholeSeconds = Math.floor(totalDurationSeconds);
    console.log(`\nTotal operation time (API call + stream processing): ${Math.floor(wholeSeconds / 60)}m ${wholeSeconds % 60}s.`);

  } catch (error) {
    if (timerInterval) {
        clearInterval(timerInterval);
        process.stdout.write('\n');
    }
    console.error("\nERROR during 'ai.models.generateContentStream' call or stream processing:");
    console.error("Error message:", error.message);
    if (error.stack) console.error("Stack:", error.stack);
    if (error.cause) console.error("Cause:", error.cause);
    if (error.response) {
        console.error("API Response (if available from error object):", JSON.stringify(error.response, null, 2));
    }
  } finally {
    // if (uploadedFileMetadata && uploadedFileMetadata.name) {
    //   console.log(`\n--- Attempting to delete uploaded file: ${uploadedFileMetadata.name} ---`);
    //   try {
    //     if (ai.files && typeof ai.files.delete === 'function') {
    //       const deleteParams = { name: uploadedFileMetadata.name };
    //       console.log("Calling ai.files.delete() with params:", JSON.stringify(deleteParams));
    //       await ai.files.delete(deleteParams);
    //       console.log(`File ${uploadedFileMetadata.name} deleted successfully.`);
    //     } else {
    //       console.warn("WARN: 'ai.files.delete' is not a function. Cannot delete uploaded file.");
    //     }
    //   } catch (deleteError) {
    //     console.error(`ERROR: Failed to delete file '${uploadedFileMetadata.name}'.`);
    //     console.error("File deletion error details:", deleteError.message);
    //     if (deleteError.stack) console.error("Deletion Stack:", deleteError.stack);
    //   }
    //   console.log(`--- End of File Deletion Attempt ---`);
    // }

    // --- NEW: List files at the very end ---
    console.log(`\n--- Listing all project files (after potential deletion) ---`);
    try {
      if (ai.files && typeof ai.files.list === 'function') {
        // The example shows using a 'config' object for pageSize, but it's optional for default listing
        // const listParams = { config: { 'pageSize': 10 } }; // Optional: for pagination control
        const listParams = {}; // Default parameters (lists all, with default page size)
        console.log("Calling ai.files.list() with params:", JSON.stringify(listParams));
        const listResponsePager = await ai.files.list(listParams); // Returns a Pager<File>

        let filesFound = false;
        // The Pager object needs to be iterated using `for await...of`
        for await (const file of listResponsePager) {
          filesFound = true;
          console.log(`  - Name: ${file.name}, DisplayName: ${file.displayName || 'N/A'}, URI: ${file.uri}, Size: ${file.sizeBytes || 'N/A'} bytes, MIME: ${file.mimeType}`);
        }
        if (!filesFound) {
          console.log("  No files found for this project.");
        }
      } else {
        console.warn("WARN: 'ai.files.list' is not a function. Cannot list project files.");
      }
    } catch (listError) {
      console.error(`ERROR: Failed to list project files.`);
      console.error("File listing error details:", listError.message);
      if (listError.stack) console.error("Listing Stack:", listError.stack);
    }
    console.log(`--- End of File Listing ---`);
    // --- END NEW ---
  }
}

main().catch(error => {
  console.error("\n--- A FATAL UNHANDLED ERROR OCCURRED IN main() ---");
  console.error("Error message:", error.message);
  if (error.stack) console.error("Stack trace:", error.stack);
  if (error.cause) console.error("Cause:", error.cause);
  process.exit(1);
});