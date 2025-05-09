const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = require('@google/genai');
const fs = require('fs');
const path = require('path');

async function main() {
  const apiKeyFromEnv = process.env.GEMINI_API_KEY;
  if (!apiKeyFromEnv) {
    console.error("ERROR: GEMINI_API_KEY environment variable is not set.");
    process.exit(1);
  }

  // const ai = new GoogleGenAI({ apiKey: apiKeyFromEnv });
  // New initialization with a 15-minute timeout:
  const ai = new GoogleGenAI({
    apiKey: apiKeyFromEnv,
    httpOptions: {
      timeout: 900000 // 15 minutes in milliseconds (15 * 60 * 1000 = 900,000)
    }
  });

  const manuscriptFilePath = '/Users/chrissmith/writing/HattieGetsAGun/manuscript.txt';
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
    const uploadStartTime = new Date(); // Timer for upload itself

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
    process.exit(1); // Exit if upload fails, as subsequent tasks depend on it
  }

  const modelName = 'gemini-2.5-pro-preview-05-06';
  const generationConfiguration = {
    responseMimeType: 'text/plain',
  };
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ];

  // --- Define the tasks ---
  const baseInstructionsFormat = `Your responses must be in PLAIN TEXT ONLY.
ABSOLUTELY DO NOT use any Markdown formatting (such as **, *, #, lists with -, etc.) in any part of your response.

You will analyze the creative fiction manuscript provided (as an uploaded file) for the specific issues described below.
DO NOT include any introductory or concluding remarks (e.g., "Okay, here's the analysis...", "Overall, the manuscript is...").
DO NOT repeat any parts of the manuscript that are correct or do not have issues related to the current focus.
Your response should ONLY consist of the identified issues, formatted as follows for EACH issue found:

Original: [The complete original sentence or a relevant short passage from the manuscript with the issue, exactly as it appears, with no extra quotation marks added by you around the sentence itself.]
Issue(s): [A brief description of the specific problem(s) in that sentence/passage related to the current focus.]
Correction/Suggestion: [The complete corrected sentence if applicable, OR a suggestion on how to address the consistency issue. For consistency issues, clearly explain the inconsistency and suggest what to review or how to align it.]

After each "Correction/Suggestion:", add two newlines before presenting the "Original:" of the next identified issue.

For example, if the manuscript contained these lines related to the current focus:
Its a lovely day. The dog runned fast. See the cat. [Example for grammar/spelling]
John, who was allergic to cats, later adopted a cat without explanation. [Example for consistency]

Your response for grammar/spelling might be:
Original: Its a lovely day.
Issue(s): Spelling - "Its" should be "It's" (contraction of "it is" or "it has").
Correction/Suggestion: It's a lovely day.

Original: The dog runned fast.
Issue(s): Grammar - Incorrect past tense of "run".
Correction/Suggestion: The dog ran fast.

Your response for character consistency might be:
Original: John, who was allergic to cats, later adopted a cat without explanation.
Issue(s): Character Inconsistency - John was previously stated to be allergic to cats, but later adopts one without addressing the allergy.
Correction/Suggestion: Review John's character details. Either establish how his allergy was resolved, or reconsider the cat adoption to maintain consistency.

Now, please provide the analysis for the manuscript above using this exact format and focusing on the specific area outlined below.`;

  const tasks = [
    {
      name: "Grammar, Spelling, and Punctuation",
      instructions: `${baseInstructionsFormat}\n\nFOCUS AREA: Grammar, spelling, and punctuation issues.\nFor the "Correction/Suggestion:" line, provide the directly corrected sentence.`
    },
    {
      name: "Character Consistency",
      instructions: `${baseInstructionsFormat}\n\nFOCUS AREA: Character consistency issues. This includes:\n- Consistent naming of characters.\n- Consistent physical descriptions (unless changes are clearly part of the plot/development).\n- Consistent personality traits, voice, and behavior (unless character development is explicitly shown and justified).\n- Consistent memories, skills, or knowledge attributed to characters.\n- Consistent relationships between characters.\nFor the "Correction/Suggestion:" line, describe the inconsistency and suggest how to make it consistent or what parts of the manuscript to review for alignment.`
    },
    {
      name: "Plot Consistency",
      instructions: `${baseInstructionsFormat}\n\nFOCUS AREA: Plot consistency issues. This includes:\n- Timeline consistency (logical sequence of events, no unexplained time jumps or contradictions).\n- Cause and effect (actions having believable consequences, or lack of consequences being addressed).\n- Adherence to established rules or logic of the story world (e.g., magic systems, technology).\n- Unresolved plot threads or plot holes.\n- Consistency in objects, locations, or significant plot devices.\n- Character motivations aligning with their actions within the plot.\nFor the "Correction/Suggestion:" line, describe the plot inconsistency, plot hole, or unresolved thread, and suggest how it might be resolved or what parts of the manuscript to review for alignment.`
    }
  ];

  let overallScriptTimerInterval; // To manage the main script timer if needed, though not strictly necessary here

  try { // This outer try handles errors that might prevent the finally block from running if not caught
    for (const task of tasks) {
      console.log(`\n\n======================================================================`);
      console.log(`--- Starting Task: ${task.name} ---`);
      console.log(`======================================================================`);

      const contentsForRequest = [
        {
          role: 'user',
          parts: [
            {
              fileData: {
                mimeType: uploadedFileMetadata.mimeType,
                fileUri: uploadedFileMetadata.uri,
              },
            },
            { text: `\n\n---\nINSTRUCTIONS:\n${task.instructions}` },
          ],
        }
      ];

      const instructionsTextForLogging = contentsForRequest[0].parts[1].text;
      console.log(`\n--- Sending Prompt to Model (${modelName}) for task: ${task.name} ---`);
      // console.log("(Prompt references the uploaded manuscript file)"); // Already clear
      console.log(`Instructions Sent to Model:\n${instructionsTextForLogging.substring(0, 500)}... (truncated for brevity)`); // Log only a part
      console.log(`--- End of Instructions Sent ---`);

      let taskSpecificTimerInterval;
      try {
        if (!(ai.models && typeof ai.models.generateContentStream === 'function')) {
          console.error("CRITICAL ERROR: 'ai.models.generateContentStream' is NOT a function. Skipping task.");
          continue; // Skip to next task
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
        taskSpecificTimerInterval = setInterval(updateTimer, 1000);

        let lastUsageMetadata = null;
        const responseStream = await ai.models.generateContentStream({
          model: modelName,
          contents: contentsForRequest,
          generationConfig: generationConfiguration,
          safetySettings: safetySettings,
        });

        clearInterval(taskSpecificTimerInterval);
        process.stdout.write('\n');

        const callEndTime = new Date();
        console.log(`\nAPI Call End Time (stream initiated): ${callEndTime.toLocaleTimeString()}\n`);
        const durationMs = callEndTime.getTime() - apiCallStartTime.getTime();
        const durationSeconds = durationMs / 1000;
        const displayTotalSeconds = Math.floor(durationSeconds);
        const displayMinutes = Math.floor(displayTotalSeconds / 60);
        const displayRemainingSeconds = displayTotalSeconds % 60;
        console.log(`Time to initiate stream: ${displayMinutes}m ${displayRemainingSeconds}s`);

        console.log(`\nTask '${task.name}' has returned, processing stream...`);
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
          console.log(`\n--- Usage Statistics (from last relevant chunk for task: ${task.name}) ---`);
          console.log(`Prompt Token Count: ${lastUsageMetadata.promptTokenCount}`);
          console.log(`Candidates Token Count: ${lastUsageMetadata.candidatesTokenCount}`);
          console.log(`Total Token Count: ${lastUsageMetadata.totalTokenCount}`);
          if (lastUsageMetadata.thoughtsTokenCount !== undefined) {
            console.log(`Thoughts Token Count: ${lastUsageMetadata.thoughtsTokenCount}`);
          }
          console.log(`--- End Usage Statistics ---`);
        } else {
          console.log("\nNo usage metadata was found in the response stream for this task.");
        }

        const streamProcessingEndTime = new Date();
        const streamDurationMs = streamProcessingEndTime.getTime() - streamProcessingStartTime.getTime();
        const streamDurationSeconds = streamDurationMs / 1000;

        if (chunkCount === 0) {
            console.log(`WARNING: Stream for task '${task.name}' completed with 0 chunks containing parsable text.`);
        }
        console.log(`--- End of Stream for task '${task.name}' (processed ${chunkCount} chunks in ${streamDurationSeconds.toFixed(2)} seconds) ---`);

      } catch (taskError) {
        if (taskSpecificTimerInterval) {
            clearInterval(taskSpecificTimerInterval);
            process.stdout.write('\n');
        }
        console.error(`\nERROR during task '${task.name}':`);
        console.error("Error message:", taskError.message);
        if (taskError.stack) console.error("Stack:", taskError.stack);
        if (taskError.cause) console.error("Cause:", taskError.cause);
        if (taskError.response) {
            console.error("API Response (if available from error object):", JSON.stringify(taskError.response, null, 2));
        }
        console.log(`--- Skipping to next task due to error in '${task.name}' ---`);
      }
    } // End of for...of tasks loop

  } catch (fatalError) {
      console.error("\n--- A FATAL ERROR OCCURRED BEFORE OR DURING TASK LOOP ---");
      console.error("Error message:", fatalError.message);
      if (fatalError.stack) console.error("Stack trace:", fatalError.stack);
      // No process.exit(1) here, let finally block run
  } finally {
    if (uploadedFileMetadata && uploadedFileMetadata.name) {
      console.log(`\n\n======================================================================`);
      console.log(`--- Attempting to delete uploaded file: ${uploadedFileMetadata.name} ---`);
      console.log(`======================================================================`);
      try {
        if (ai.files && typeof ai.files.delete === 'function') {
          const deleteParams = { name: uploadedFileMetadata.name };
          console.log("Calling ai.files.delete() with params:", JSON.stringify(deleteParams));
          await ai.files.delete(deleteParams);
          console.log(`File ${uploadedFileMetadata.name} deleted successfully.`);
        } else {
          console.warn("WARN: 'ai.files.delete' is not a function. Cannot delete uploaded file.");
        }
      } catch (deleteError) {
        console.error(`ERROR: Failed to delete file '${uploadedFileMetadata.name}'.`);
        console.error("File deletion error details:", deleteError.message);
        if (deleteError.stack) console.error("Deletion Stack:", deleteError.stack);
      }
      console.log(`--- End of File Deletion Attempt ---`);
    }

    console.log(`\n\n======================================================================`);
    console.log(`--- Listing all project files (after potential deletion) ---`);
    console.log(`======================================================================`);
    try {
      if (ai.files && typeof ai.files.list === 'function') {
        const listParams = {};
        console.log("Calling ai.files.list() with params:", JSON.stringify(listParams));
        const listResponsePager = await ai.files.list(listParams);

        let filesFound = false;
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
  }
  process.exit(0);
}

main().catch(error => {
  console.error("\n--- A FATAL UNHANDLED ERROR OCCURRED IN main() AND WASN'T CAUGHT BY INNER BLOCKS ---");
  console.error("Error message:", error.message);
  if (error.stack) console.error("Stack trace:", error.stack);
  if (error.cause) console.error("Cause:", error.cause);
  process.exit(1);
});
