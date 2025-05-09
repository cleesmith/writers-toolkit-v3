// proofreader_gemini25_cached.js
const {
    GoogleGenAI,
    HarmCategory,
    HarmBlockThreshold,
    createUserContent,
    createPartFromUri,
} = require('@google/genai');
const fs = require('fs');
const path = require('path');

async function main() {
  const apiKeyFromEnv = process.env.GEMINI_API_KEY;
  if (!apiKeyFromEnv) {
    console.error("ERROR: GEMINI_API_KEY environment variable is not set.");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey: apiKeyFromEnv });

  const manuscriptFilePath = 'cls_manuscript.txt';
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

    if (!(ai.files && typeof ai.files.upload === 'function')) {
      console.error("CRITICAL ERROR: 'ai.files.upload' is NOT a function. Cannot proceed with file upload.");
      process.exit(1);
    }
    console.log("Using ai.files.upload() with params:", JSON.stringify(uploadParams, null, 2));
    const uploadResponse = await ai.files.upload(uploadParams);

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

  const modelName = 'gemini-2.5-pro-preview-05-06'; // Ensure this model supports caching
  let createdCache;

  // --- Define the BASE instructions (will go into the cache's systemInstruction) ---
  const baseInstructionsFormat = `Your responses must be in PLAIN TEXT ONLY.
ABSOLUTELY DO NOT use any Markdown formatting (such as **, *, #, lists with -, etc.) in any part of your response.

You will analyze the creative fiction manuscript provided (which has been cached along with these base instructions) for the specific issues described in the user's follow-up prompt.
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

Now, please provide the analysis based on the cached manuscript and these general guidelines, focusing on the specific area outlined in the user's prompt.`;

  try {
    console.log(`\n--- Creating Cache with Uploaded File and Base Instructions ---`);
    const cacheCreationStartTime = new Date();

    if (!(ai.caches && typeof ai.caches.create === 'function')) {
        console.error("CRITICAL ERROR: 'ai.caches.create' is NOT a function. Cannot proceed with caching.");
        process.exit(1);
    }

    const cacheConfig = {
        model: modelName, // Cache is model-specific
        config: {
            contents: [createUserContent(createPartFromUri(uploadedFileMetadata.uri, uploadedFileMetadata.mimeType))],
            systemInstruction: baseInstructionsFormat,
            ttl: `${30 * 60}s` // 30 minutes in seconds (e.g., "900s") - cache will auto-delete after this if not explicitly deleted
        },
        displayName: `Cache for ${path.basename(manuscriptFilePath)} - ${new Date().toISOString()}`
    };

    console.log("Creating cache with config:", JSON.stringify({
        ...cacheConfig,
        config: {
            ...cacheConfig.config,
            contents: `[Content from URI: ${uploadedFileMetadata.uri}]`, // Avoid logging full content object
            systemInstruction: `[Base Instructions - ${baseInstructionsFormat.length} chars]`
        }
    }, null, 2));

    createdCache = await ai.caches.create(cacheConfig);

    if (!createdCache || !createdCache.name) {
        console.error("ERROR: Cache creation response is not in the expected format or is missing 'name'.");
        console.error("Received response:", JSON.stringify(createdCache, null, 2));
        process.exit(1);
    }
    const cacheCreationEndTime = new Date();
    const cacheCreationDurationMs = cacheCreationEndTime.getTime() - cacheCreationStartTime.getTime();
    console.log(`Cache created successfully in ${(cacheCreationDurationMs / 1000).toFixed(2)} seconds.`);
    console.log(`Cache Name (ID): ${createdCache.name}`);
    console.log(`Cache Model: ${createdCache.model}`);
    console.log(`Cache Display Name: ${createdCache.displayName}`);
    console.log(`Cache TTL: ${createdCache.ttl} (Expires: ${new Date(createdCache.expireTime).toLocaleString()})`);
    if (createdCache.usageMetadata) {
        console.log(`Cache Input Token Count: ${createdCache.usageMetadata.totalTokenCount || createdCache.usageMetadata.cachedContentTokenCount || 'N/A'}`);
    }
    console.log(`--- End of Cache Creation ---`);

  } catch (cacheError) {
    console.error(`\nERROR: Failed to create cache for file '${manuscriptFilePath}'.`);
    console.error("Cache creation error details:", cacheError.message);
    if (cacheError.stack) console.error("Stack:", cacheError.stack);
    if (cacheError.response && cacheError.response.data) {
        console.error("API Error Data:", JSON.stringify(cacheError.response.data, null, 2));
    } else if (cacheError.cause) {
        console.error("Cause:", cacheError.cause);
    }
    process.exit(1);
  }

  const generationConfiguration = {
    responseMimeType: 'text/plain',
  };
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ];

  // --- Define the tasks (focus prompts only) ---
  const tasks = [
    {
      name: "Grammar, Spelling, and Punctuation",
      focusPrompt: `FOCUS AREA: Grammar, spelling, and punctuation issues.\nFor the "Correction/Suggestion:" line, provide the directly corrected sentence.`
    },
    {
      name: "Character Consistency",
      focusPrompt: `FOCUS AREA: Character consistency issues. This includes:\n- Consistent naming of characters.\n- Consistent physical descriptions (unless changes are clearly part of the plot/development).\n- Consistent personality traits, voice, and behavior (unless character development is explicitly shown and justified).\n- Consistent memories, skills, or knowledge attributed to characters.\n- Consistent relationships between characters.\nFor the "Correction/Suggestion:" line, describe the inconsistency and suggest how to make it consistent or what parts of the manuscript to review for alignment.`
    },
    {
      name: "Plot Consistency",
      focusPrompt: `FOCUS AREA: Plot consistency issues. This includes:\n- Timeline consistency (logical sequence of events, no unexplained time jumps or contradictions).\n- Cause and effect (actions having believable consequences, or lack of consequences being addressed).\n- Adherence to established rules or logic of the story world (e.g., magic systems, technology).\n- Unresolved plot threads or plot holes.\n- Consistency in objects, locations, or significant plot devices.\n- Character motivations aligning with their actions within the plot.\nFor the "Correction/Suggestion:" line, describe the plot inconsistency, plot hole, or unresolved thread, and suggest how it might be resolved or what parts of the manuscript to review for alignment.`
    }
  ];

  try {
    for (const task of tasks) {
      console.log(`\n\n======================================================================`);
      console.log(`--- Starting Task: ${task.name} (using cached content) ---`);
      console.log(`======================================================================`);

      // The manuscript and base instructions are in the cache.
      // We only send the task-specific focus prompt.
      const contentsForRequest = [
        {
          role: 'user',
          parts: [
            { text: task.focusPrompt }, // Only the task-specific part
          ],
        }
      ];

      const instructionsTextForLogging = contentsForRequest[0].parts[0].text;
      console.log(`\n--- Sending Task-Specific Prompt to Model (${modelName}) for task: ${task.name} ---`);
      console.log(`(Manuscript and base instructions are referenced from cache: ${createdCache.name})`);
      console.log(`Task-Specific Instructions Sent:\n${instructionsTextForLogging.substring(0, 500)}... (truncated if long)`);
      console.log(`--- End of Task-Specific Instructions Sent ---`);

      let taskSpecificTimerInterval;
      try {
        if (!(ai.models && typeof ai.models.generateContentStream === 'function')) {
          console.error("CRITICAL ERROR: 'ai.models.generateContentStream' is NOT a function. Skipping task.");
          continue;
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
          model: modelName, // Must match the model used for caching
          contents: contentsForRequest,
          generationConfig: generationConfiguration,
          safetySettings: safetySettings,
          cachedContent: createdCache.name, // Referencing the cache
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
          console.log(`Prompt Token Count: ${lastUsageMetadata.promptTokenCount} (This is for the task-specific prompt)`);
          if (lastUsageMetadata.cachedContentTokenCount !== undefined) { // Check if this field exists in the response
             console.log(`Cached Content Token Count: ${lastUsageMetadata.cachedContentTokenCount} (Tokens from the cache)`);
          }
          console.log(`Candidates Token Count: ${lastUsageMetadata.candidatesTokenCount}`);
          console.log(`Total Token Count: ${lastUsageMetadata.totalTokenCount} (Includes prompt, cached, and candidates)`);
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
    }
  } catch (fatalError) {
      console.error("\n--- A FATAL ERROR OCCURRED BEFORE OR DURING TASK LOOP ---");
      console.error("Error message:", fatalError.message);
      if (fatalError.stack) console.error("Stack trace:", fatalError.stack);
  } finally {
    if (createdCache && createdCache.name) {
      console.log(`\n\n======================================================================`);
      console.log(`--- Attempting to delete created cache: ${createdCache.name} ---`);
      console.log(`======================================================================`);
      try {
        if (ai.caches && typeof ai.caches.delete === 'function') {
          const deleteParams = { name: createdCache.name };
          console.log("Calling ai.caches.delete() with params:", JSON.stringify(deleteParams));
          await ai.caches.delete(deleteParams);
          console.log(`Cache ${createdCache.name} deleted successfully.`);
        } else {
          console.warn("WARN: 'ai.caches.delete' is not a function. Cannot delete created cache.");
        }
      } catch (deleteError) {
        console.error(`ERROR: Failed to delete cache '${createdCache.name}'.`);
        console.error("Cache deletion error details:", deleteError.message);
        if (deleteError.stack) console.error("Deletion Stack:", deleteError.stack);
      }
      console.log(`--- End of Cache Deletion Attempt ---`);
    }

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
    console.log(`--- Listing all project caches (after potential deletion) ---`);
    console.log(`======================================================================`);
    try {
        if (ai.caches && typeof ai.caches.list === 'function') {
            const listParams = { pageSize: 10 }; // Example pageSize
            console.log("Calling ai.caches.list() with params:", JSON.stringify(listParams));
            const listResponsePager = await ai.caches.list(listParams);

            let cachesFound = false;
            for await (const cache of listResponsePager) {
                cachesFound = true;
                console.log(`  - Name: ${cache.name}, Model: ${cache.model}, DisplayName: ${cache.displayName || 'N/A'}, TTL: ${cache.ttl}, Expires: ${new Date(cache.expireTime).toLocaleString()}`);
            }
            if (!cachesFound) {
                console.log("  No caches found for this project.");
            }
        } else {
            console.warn("WARN: 'ai.caches.list' is not a function. Cannot list project caches.");
        }
    } catch (listError) {
        console.error(`ERROR: Failed to list project caches.`);
        console.error("Cache listing error details:", listError.message);
        if (listError.stack) console.error("Listing Stack:", listError.stack);
    }
    console.log(`--- End of Cache Listing ---`);


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
}

main().catch(error => {
  console.error("\n--- A FATAL UNHANDLED ERROR OCCURRED IN main() AND WASN'T CAUGHT BY INNER BLOCKS ---");
  console.error("Error message:", error.message);
  if (error.stack) console.error("Stack trace:", error.stack);
  if (error.cause) console.error("Cause:", error.cause);
  process.exit(1);
});
