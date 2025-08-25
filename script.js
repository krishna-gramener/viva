import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";


const statusElement = document.getElementById('status');
const transcriptionServiceSelect = document.getElementById('transcriptionService');
const microphoneSelect = document.getElementById('microphoneSelect');
const refreshMicsButton = document.getElementById('refreshMics');
const questionsContainer = document.getElementById('questions-container');
const evaluateBtn = document.getElementById('evaluateBtn');
const evaluationStatus = document.getElementById('evaluation-status');
const resultsContainer = document.getElementById('results-container');
const resultsContent = document.getElementById('results-content');
const repoStatusElement = document.getElementById('repo-status');
const fetchRepoBtn = document.getElementById('fetchRepoBtn');
const questionGenSystemPromptElement = document.getElementById('questionGenSystemPrompt');
const evaluationSystemPromptElement = document.getElementById('evaluationSystemPrompt');


// Store loaded questions for later use in evaluation
let loadedQuestions = [];

const { baseUrl, apiKey} = await openaiConfig({
  defaultBaseUrls: ["https://api.openai.com/v1", "https://openrouter.com/api/v1","https://llmfoundry.straive.com/openai/v1"]
});

let mediaRecorder;
let audioChunks = [];
let audioURL = null;
let token = '';
let activeQuestionId = null;

// Create audio player for a specific question
function createAudioPlayer(questionId) {
  const transcriptElement = document.getElementById(`transcript-${questionId}`);
  
  // Check if audio player already exists
  let audioPlayer = document.getElementById(`audioPlayer-${questionId}`);
  if (audioPlayer) return audioPlayer;
  
  const playerContainer = document.createElement('div');
  playerContainer.className = 'mt-2';
  playerContainer.innerHTML = `
    <audio id="audioPlayer-${questionId}" controls class="w-100" style="display: none;"></audio>
  `;
  
  // Insert after transcript element
  transcriptElement.parentNode.insertBefore(playerContainer, transcriptElement.nextSibling);
  return document.getElementById(`audioPlayer-${questionId}`);
}
async function init() {
  try {
    // Get token for API access
    const response = await fetch("https://llmfoundry.straive.com/token", { credentials: "include" });
    const data = await response.json();
    token = data.token;
    
    // Initialize microphone list
    await populateMicrophoneList();
    
    // Load questions JSON but don't display them yet
    await loadQuestions(false);
    
    // Hide the questions card initially
    document.querySelector('#questions-card').style.display = 'none';
    
    // Add event listeners to interview type cards
    attachInterviewCardListeners();
    
    // Add event listener for GitHub repository fetch button
    attachGitHubRepoListener();
    
  } catch (error) {
    console.error('Initialization error:', error);
    document.getElementById('questions-container').innerHTML = `
      <div class="alert alert-danger">
        Error loading questions: ${error.message}
      </div>
    `;
  }
}

// Function to populate questions from JSON data
function populateQuestions(questionsData) {
  // Populate questions
  const questionsContainer = document.getElementById('questions-container');
  questionsContainer.innerHTML = ''; // Clear loading indicator
  
  questionsData.forEach((questionData, index) => {
    const questionId = index + 1;
    const questionElement = createQuestionElement(questionData, questionId);
    questionsContainer.appendChild(questionElement);
  });
  
  // Attach event listeners to mic buttons
  attachMicButtonListeners();
}

// Function to load questions from JSON file
async function loadQuestions(displayQuestions = true, interviewIndex = null) {
  try {
    const response = await fetch('ques.json');
    if (!response.ok) {
      throw new Error('Failed to load questions');
    }
    
    const allQuestions = await response.json();
    
    // Determine which question set to use based on interviewIndex
    if (interviewIndex === null) {
      // If no specific index is requested, use the first set
      loadedQuestions = allQuestions[0];
    } else {
      // Otherwise, use the specific question set by index
      if (allQuestions[interviewIndex]) {
        loadedQuestions = allQuestions[interviewIndex];
      } else {
        throw new Error(`Question set at index ${interviewIndex} not found`);
      }
    }
    
    // Populate the JSON editor with the current questions
    const jsonEditor = document.getElementById('jsonEditor');
    jsonEditor.value = JSON.stringify(loadedQuestions, null, 2);
    
    // Only populate questions UI if displayQuestions is true
    if (displayQuestions) {
      populateQuestions(loadedQuestions);
      
      // Show the questions card
      document.querySelector('#questions-card').style.display = 'block';
      
      // Scroll to questions
      document.querySelector('#questions-card').scrollIntoView({ behavior: 'smooth' });
    }
    
  } catch (error) {
    console.error('Error loading questions:', error);
    questionsContainer.innerHTML = `
      <div class="alert alert-danger">
        Error loading questions: ${error.message}
        <button class="btn btn-sm btn-outline-danger mt-2" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

// Function to create a question element
function createQuestionElement(questionData, questionId) {
  const questionContainer = document.createElement('div');
  questionContainer.className = 'question-container';
  questionContainer.dataset.questionId = questionId;
  
  questionContainer.innerHTML = `
    <div class="d-flex align-items-center">
      <label class="form-label flex-grow-1 question-text">Q${questionId}: ${questionData.question}</label>
      <button type="button" class="btn btn-primary mic-btn" data-question-id="${questionId}">
        <i class="bi bi-mic-fill"></i>
      </button>
    </div>
    <div class="spinner-container" id="spinner-${questionId}">
      <div class="d-flex align-items-center">
        <div class="spinner-grow spinner-grow-sm text-primary me-2" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <span>Transcribing...</span>
      </div>
    </div>
    <div class="transcript-box bg-light p-2 rounded border" id="transcript-${questionId}" contenteditable="true">Your answer will appear here...</div>
  `;
  
  return questionContainer;
}

// Function to get and populate available microphones
async function populateMicrophoneList() {
  try {
    // Clear all existing options
    while (microphoneSelect.options.length > 0) {
      microphoneSelect.remove(0);
    }
    
    // Check if media devices are supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      statusElement.textContent = 'Media devices not supported by your browser';
      // Add default option if media devices aren't supported
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.text = 'Default microphone';
      defaultOption.selected = true;
      microphoneSelect.add(defaultOption);
      return;
    }
    
    // Get all media devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    // Filter for audio input devices (microphones)
    const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
    
    // Debug info removed, keeping console logs for debugging
    
    if (audioInputDevices.length === 0) {
      // No microphones found, add default option
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.text = 'Default microphone';
      defaultOption.selected = true;
      microphoneSelect.add(defaultOption);
      
      const noMicsOption = document.createElement('option');
      noMicsOption.text = 'No microphones found';
      noMicsOption.disabled = true;
      microphoneSelect.add(noMicsOption);
    } else {
      // Add each microphone to the select dropdown
      let firstOption = true;
      audioInputDevices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `Microphone ${microphoneSelect.options.length + 1}`;
        if (firstOption) {
          option.selected = true;
          firstOption = false;
        }
        microphoneSelect.add(option);
      });
    }
    
    statusElement.textContent = 'Microphone list updated';
    setTimeout(() => {
      statusElement.textContent = 'Ready to record';
    }, 2000);
  } catch (error) {
    console.error('Error getting audio devices:', error);
    statusElement.textContent = 'Error getting microphone list';
  }
}

init();

// Add event listener for refresh microphones button
refreshMicsButton.addEventListener('click', populateMicrophoneList);

// Add event listener for evaluate button
evaluateBtn.addEventListener('click', evaluateAnswers);

// Function to attach event listeners to interview type cards
function attachInterviewCardListeners() {
  const interviewCards = document.querySelectorAll('.interview-card');
  
  interviewCards.forEach(card => {
    card.addEventListener('click', function() {
      // Get the index from the card's data attribute
      const cardIndex = parseInt(card.dataset.index);
      
      // Update status
      statusElement.textContent = `Loading ${card.querySelector('.card-title').textContent} interview...`;
      
      // Load the questions for this interview type using the card index
      loadQuestions(true, cardIndex);
      
      // Highlight the selected card and show the selected indicator
      interviewCards.forEach(c => {
        c.classList.remove('border-primary', 'border-success', 'border-info', 'border-3');
        c.querySelector('.card-selected-indicator').style.display = 'none';
      });
      
      // Add appropriate border color based on card index
      const borderClass = cardIndex === 0 ? 'border-primary' : 
                         cardIndex === 1 ? 'border-success' : 'border-info';
      
      card.classList.add(borderClass, 'border-3');
      card.querySelector('.card-selected-indicator').style.display = 'block';
      
      // Add hover effect
      card.style.transform = 'translateY(-5px)';
      setTimeout(() => {
        card.style.transform = 'translateY(0)';
      }, 300);
    });
    
    // Add hover effect
    card.addEventListener('mouseenter', function() {
      if (!card.classList.contains('border-3')) {
        card.style.transform = 'translateY(-3px)';
      }
    });
    
    card.addEventListener('mouseleave', function() {
      if (!card.classList.contains('border-3')) {
        card.style.transform = 'translateY(0)';
      }
    });
  });
}

const runJsonBtn = document.getElementById('runJsonBtn');
runJsonBtn.addEventListener('click', function() {
  try {
    const jsonEditor = document.getElementById('jsonEditor');
    const jsonData = JSON.parse(jsonEditor.value);
    
    // Update the loaded questions with the new JSON data
    loadedQuestions = jsonData;
    
    // Populate the questions UI
    populateQuestions(loadedQuestions);
    
    // Show the questions card
    document.querySelector('#questions-card').style.display = 'block';
    
    // Update status
    statusElement.textContent = 'Questions updated from JSON';
    
    // Close the collapse
    const bsCollapse = bootstrap.Collapse.getInstance(document.getElementById('jsonEditorCollapse'));
    if (bsCollapse) {
      bsCollapse.hide();
    }
    
  } catch (error) {
    console.error('Error parsing JSON:', error);
    statusElement.textContent = `Error: ${error.message}`;
    statusElement.classList.add('text-danger');
    setTimeout(() => {
      statusElement.textContent = 'Ready to record';
      statusElement.classList.remove('text-danger');
    }, 3000);
  }
});

// Function to attach event listener to GitHub repository fetch button
function attachGitHubRepoListener() {
  fetchRepoBtn.addEventListener('click', async function() {
    const repoUrl = document.getElementById('githubRepoUrl').value.trim();
    const githubToken = document.getElementById('githubToken').value.trim();
    
    if (!repoUrl) {
      updateRepoStatus('Please enter a GitHub repository URL', 'danger');
      return;
    }
    
    if (!githubToken) {
      updateRepoStatus('Please enter a GitHub personal access token', 'danger');
      return;
    }
    
    try {
      updateRepoStatus('Parsing repository URL...', 'info');
      const { owner, repo } = parseGitHubUrl(repoUrl);
      
      if (!owner || !repo) {
        updateRepoStatus('Invalid GitHub URL format. Please use https://github.com/username/repository', 'danger');
        return;
      }
      
      updateRepoStatus(`Fetching repository content from ${owner}/${repo}...`, 'info');
      
      // Fetch repository content
      const repoContent = await fetchRepoContent(owner, repo, githubToken);
      
      updateRepoStatus('Generating questions based on repository content...', 'info');
      
      // Generate questions using LLM
      const questions = await generateQuestionsFromRepo(repoContent, owner, repo);
      
      // Update the loaded questions with the new questions
      loadedQuestions = questions;
      
      // Populate the questions UI
      populateQuestions(loadedQuestions);
      
      // Show the questions card
      document.querySelector('#questions-card').style.display = 'block';
      
      // Update the JSON editor with the new questions
      const jsonEditor = document.getElementById('jsonEditor');
      if (jsonEditor) {
        jsonEditor.value = JSON.stringify(questions, null, 2);
      }
      
      // Update status
      updateRepoStatus('Questions generated successfully!', 'success');
      
      // Close the collapse
      const bsCollapse = bootstrap.Collapse.getInstance(document.getElementById('githubRepoCollapse'));
      if (bsCollapse) {
        bsCollapse.hide();
      }
      
    } catch (error) {
      console.error('Error fetching repository:', error);
      updateRepoStatus(`Error: ${error.message}`, 'danger');
    }
  });
}

// Function to update repository status with appropriate styling
function updateRepoStatus(message, type = 'info') {
  repoStatusElement.textContent = message;
  
  // Remove all existing color classes
  repoStatusElement.classList.remove('text-info', 'text-danger', 'text-success', 'text-warning');
  
  // Add appropriate color class
  switch (type) {
    case 'danger':
      repoStatusElement.classList.add('text-danger');
      break;
    case 'success':
      repoStatusElement.classList.add('text-success');
      break;
    case 'warning':
      repoStatusElement.classList.add('text-warning');
      break;
    case 'info':
    default:
      repoStatusElement.classList.add('text-info');
  }
}

// Function to parse GitHub URL and extract owner and repo
function parseGitHubUrl(url) {
  try {
    // Handle different URL formats
    // https://github.com/username/repository
    // https://github.com/username/repository.git
    // git@github.com:username/repository.git
    
    let owner, repo;
    
    if (url.includes('github.com')) {
      // Handle HTTPS URLs
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      
      // Remove empty parts and .git extension
      const cleanParts = pathParts.filter(part => part);
      
      if (cleanParts.length >= 2) {
        owner = cleanParts[0];
        repo = cleanParts[1].replace('.git', '');
      }
    } else if (url.includes('git@github.com:')) {
      // Handle SSH URLs
      const match = url.match(/git@github\.com:([^/]+)\/([^.]+)(\.git)?/);
      if (match && match.length >= 3) {
        owner = match[1];
        repo = match[2];
      }
    }
    
    return { owner, repo };
  } catch (error) {
    console.error('Error parsing GitHub URL:', error);
    return { owner: null, repo: null };
  }
}

// Function to fetch repository content using GitHub API
async function fetchRepoContent(owner, repo, token) {
  try {
    // Fetch the root content
    const endpoint = `repos/${owner}/${repo}/contents`;
    const content = await fetchFromGitHub(endpoint, token);
    
    // Try to fetch the README as well
    let readme = null;
    try {
      readme = await fetchFromGitHub(`repos/${owner}/${repo}/readme`, token);
      if (readme && readme.content) {
        readme.decodedContent = atob(readme.content);
      }
    } catch (error) {
      console.warn('README not found or not accessible');
    }
    
    // Define code file extensions to filter
    const codeExtensions = [
      'js', 'py', 'java', 'ts', 'jsx', 'tsx', 'html', 'css', 'go', 'rs',
      'c', 'cpp', 'h', 'hpp', 'rb', 'php', 'swift', 'kt', 'cs', 'sh', 'json',
      'yml', 'yaml', 'md', 'sql', 'vue', 'svelte'
    ];
    
    // Function to check if a file has a code extension
    const hasCodeExtension = (filename) => {
      const extension = filename.split('.').pop().toLowerCase();
      return codeExtensions.includes(extension);
    };
    
    // List of directories to exclude
    const excludeDirs = [
      '__pycache__', 'node_modules', '.git', '.github', '.vscode', '.idea',
      'dist', 'build', 'target', 'venv', 'env', '.env', 'bin', 'obj',
      'out', 'coverage', '.next', '.nuxt', '.cache', 'tmp', 'temp'
    ];
    
    // Recursive function to fetch files from directories
    async function fetchFilesRecursively(items, currentPath = '', depth = 0) {
      // Limit recursion depth to avoid excessive API calls
      if (depth > 2) return [];
      
      let results = [];
      
      // Process files first
      const files = items.filter(item => item.type === 'file' && hasCodeExtension(item.name));
      
      // Limit files per directory to avoid rate limiting
      const filesToFetch = files.slice(0, 5);
      
      // Fetch content of each file
      for (const file of filesToFetch) {
        try {
          const fileData = await fetchFromGitHub(file.url.replace('https://api.github.com/', ''), token);
          if (fileData && fileData.content) {
            results.push({
              name: file.name,
              path: currentPath ? `${currentPath}/${file.name}` : file.path,
              content: atob(fileData.content)
            });
          }
        } catch (error) {
          console.warn(`Could not fetch content for ${file.name}:`, error);
        }
      }
      
      // Process directories next (but limit to avoid too many API calls)
      const dirs = items.filter(item => 
        item.type === 'dir' && !excludeDirs.includes(item.name)
      );
      const dirsToProcess = dirs.slice(0, 3); // Limit to 3 directories per level
      
      for (const dir of dirsToProcess) {
        try {
          // Fetch directory contents
          const dirContents = await fetchFromGitHub(dir.url.replace('https://api.github.com/', ''), token);
          if (Array.isArray(dirContents)) {
            // Recursively fetch files from this directory
            const dirPath = currentPath ? `${currentPath}/${dir.name}` : dir.name;
            const nestedFiles = await fetchFilesRecursively(dirContents, dirPath, depth + 1);
            results = results.concat(nestedFiles);
          }
        } catch (error) {
          console.warn(`Could not fetch contents of directory ${dir.name}:`, error);
        }
      }
      
      return results;
    }
    
    // Start the recursive file fetching
    let fileContents = [];
    if (Array.isArray(content)) {
      fileContents = await fetchFilesRecursively(content);
    } 
    // If content is a single file, decode its content
    else if (content && content.content && hasCodeExtension(content.name)) {
      fileContents.push({
        name: content.name,
        path: content.path,
        content: atob(content.content)
      });
    }
    
    // Limit total files to 20 to avoid excessive data
    fileContents = fileContents.slice(0, 20);
    
    return {
      owner,
      repo,
      readme,
      files: fileContents
    };
  } catch (error) {
    console.error('Error fetching repository content:', error);
    throw new Error(`Failed to fetch repository content: ${error.message}`);
  }
}

// Helper function to make GitHub API requests
async function fetchFromGitHub(endpoint, token) {
  const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com/${endpoint}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
  }
  
  return await response.json();
}

// Function to call LLM without streaming for JSON responses
async function callLLMForJSON(systemPrompt, userMessage) {
  try {
    const body = {
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    };
    
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}:viva`
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    const content = result.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content in LLM response');
    }
    
    return content;
  } catch (error) {
    console.error("LLM API error:", error);
    throw error;
  }
}

// Function to generate questions based on repository content
async function generateQuestionsFromRepo(repoContent, owner, repo) {
  try {
    // Prepare repository summary for the LLM
    const repoSummary = prepareRepoSummary(repoContent, owner, repo);
    
    // Get the system prompt from the HTML textarea
    const systemPrompt = questionGenSystemPromptElement.value;
    
    // Call LLM to generate questions
    updateRepoStatus('Calling LLM to generate questions...', 'info');
    
    // Use the new callLLMForJSON function
    const responseContent = await callLLMForJSON(systemPrompt, repoSummary);
    
    // Parse the JSON response
    try {
      // First, check if the response is wrapped in markdown code blocks
      let jsonContent = responseContent;
      
      // Check for ```json ... ``` pattern
      const jsonCodeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
      const match = responseContent.match(jsonCodeBlockRegex);
      
      if (match && match[1]) {
        // Extract the content from within the code block
        jsonContent = match[1].trim();
        console.log('Extracted JSON from code block');
      }
      
      // Now parse the JSON
      const questionsJson = JSON.parse(jsonContent);
      return questionsJson;
    } catch (parseError) {
      console.error('Error parsing LLM response as JSON:', parseError);
      console.log('Raw LLM response:', responseContent);
      throw new Error('Failed to parse LLM response as JSON');
    }
  } catch (error) {
    console.error('Error generating questions:', error);
    throw new Error(`Failed to generate questions: ${error.message}`);
  }
}

// Function to prepare repository summary for the LLM
function prepareRepoSummary(repoContent, owner, repo) {
  // Create a summary of the repository content for the LLM
  let summary = `GitHub Repository: ${owner}/${repo}\n`;
  
  // Add README content if available
  if (repoContent.readme && repoContent.readme.decodedContent) {
    // Truncate README if it's too long
    const readmeContent = repoContent.readme.decodedContent;
    const truncatedReadme = readmeContent.length > 1500 ? 
      readmeContent.substring(0, 1500) + '... (truncated)' : 
      readmeContent;
    
    summary += `\n## README:\n${truncatedReadme}\n`;
  }
  
  // Add file contents
  summary += `\n## Files:\n`;
  
  if (repoContent.files && repoContent.files.length > 0) {
    repoContent.files.forEach(file => {
      // Truncate file content if it's too long
      const truncatedContent = file.content.length > 2000 ? 
        file.content.substring(0, 2000) + '... (truncated)' : 
        file.content;
      
      summary += `\n### ${file.path}\n\`\`\`\n${truncatedContent}\n\`\`\`\n`;
    });
  } else {
    summary += 'No files found or accessible.';
  }
  
  return summary;
}

// Note: We're using the existing callLLM function instead of a separate function for question generation

// Function to attach event listeners to mic buttons
function attachMicButtonListeners() {
  const micButtons = document.querySelectorAll('.mic-btn');
  micButtons.forEach(button => {
  button.addEventListener('click', async () => {
    const questionId = button.getAttribute('data-question-id');
    const transcriptElement = document.getElementById(`transcript-${questionId}`);
    const spinnerElement = document.getElementById(`spinner-${questionId}`);
    const audioPlayer = createAudioPlayer(questionId);
    const micIcon = button.querySelector('i');
    
    // If this button is already recording, stop it
    if (mediaRecorder && mediaRecorder.state === 'recording' && activeQuestionId === questionId) {
      // Stop recording
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      // Just remove the recording class to restore button color
      button.classList.remove('recording');
      activeQuestionId = null;
      return;
    }
    
    // If another button is recording, stop that first
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      const activeButton = document.querySelector(`.mic-btn[data-question-id="${activeQuestionId}"]`);
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      // Just remove the recording class to restore button color
      activeButton.classList.remove('recording');
    }
    
    try {
      // Start recording with selected microphone if available
      const audioConstraints = { audio: {} };
      
      // If a specific microphone is selected, use it
      const selectedMicId = microphoneSelect.value;
      if (selectedMicId) {
        audioConstraints.audio = {
          deviceId: { exact: selectedMicId }
        };
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(audioConstraints);
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      audioChunks = [];
      activeQuestionId = questionId;
      
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = async () => {
        // Process audio
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        audioURL = URL.createObjectURL(audioBlob);
        audioPlayer.src = audioURL;
        audioPlayer.style.display = 'block';
        
        try {
          // Convert to base64
          statusElement.textContent = 'Processing audio...';
          const base64Data = await blobToBase64(audioBlob);
          
          // Show spinner while transcribing
          statusElement.textContent = 'Transcribing audio...';
          spinnerElement.style.display = 'block';
          
          // Send to selected transcription service
          const transcriptText = await transcribeAudio(base64Data, audioBlob);
          transcriptElement.textContent = transcriptText;
          statusElement.textContent = 'Ready to record';
          
          // Hide spinner after transcription is complete
          spinnerElement.style.display = 'none';
        } catch (error) {
          console.error('Processing error:', error);
          transcriptElement.textContent = `Error: ${error.message}`;
          statusElement.textContent = 'Error occurred';
          spinnerElement.style.display = 'none';
        }
      };

      // Start recording
      mediaRecorder.start();
      // Keep the mic icon as is, just change the button color via CSS
      button.classList.add('recording');
      statusElement.textContent = `Recording for question ${questionId}...`;
    } catch (err) {
      console.error('Microphone error:', err);
      statusElement.textContent = 'Microphone access denied';
      transcriptElement.textContent = 'Error: Could not access microphone';
    }
  });
});
}

// Function to evaluate answers
async function evaluateAnswers() {
  try {
    // Show evaluation in progress
    evaluateBtn.disabled = true;
    evaluationStatus.textContent = 'Evaluating answers...';
    evaluationStatus.classList.add('text-primary');
    evaluationStatus.classList.remove('text-danger', 'text-success');
    
    // Clear previous results
    resultsContent.innerHTML = '';
    resultsContainer.style.display = 'block';
    
    // Initialize results table with streaming content placeholder
    resultsContent.innerHTML = `
      <div class="table-responsive">
        <table class="table table-bordered">
          <thead>
            <tr>
              <th>Name</th>
              <th>Score</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody id="results-tbody">
            <tr>
              <td colspan="3" class="p-3">
                <div class="d-flex justify-content-center align-items-center mb-3">
                  <div class="spinner-border text-primary me-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                  </div>
                  <span>Evaluating all answers...</span>
                </div>
                <div class="streaming-content"></div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    
    // Check if we have questions loaded
    if (!loadedQuestions || loadedQuestions.length === 0) {
      throw new Error('No questions loaded to evaluate');
    }
    
    // Collect all questions and answers
    const allQuestionsAndAnswers = [];
    
    for (let i = 0; i < loadedQuestions.length; i++) {
      const questionId = i + 1;
      const questionData = loadedQuestions[i];
      const transcriptElement = document.getElementById(`transcript-${questionId}`);
      
      // Get answer text
      const answer = transcriptElement.textContent.trim();
      const answerText = (!answer || answer === 'Your answer will appear here...') ? 
        'No answer provided' : answer;
      
      allQuestionsAndAnswers.push({
        questionId,
        question: questionData.question,
        answer: answerText,
        rubric: questionData.rubric
      });
    }
    
    // Get the evaluation system prompt from the HTML textarea
    const systemPrompt = evaluationSystemPromptElement.value;
    
    const userMessage = `Questions and Answers:\n\n${allQuestionsAndAnswers.map(qa => 
      `Question ${qa.questionId}: ${qa.question}\n` +
      `Answer: ${qa.answer}\n` +
      `Rubric: ${JSON.stringify(qa.rubric)}\n`
    ).join('\n')}\n\nPlease evaluate all answers according to their rubrics and format the results as HTML table rows.`;
    
    try {
      // Call LLM for evaluation with streaming
      const resultsTbody = document.getElementById('results-tbody');
      
      // The callLLM function will update the streaming-content div in real-time
      const htmlTableRows = await callLLM(systemPrompt, userMessage);
      
      // Replace the loading indicator with the generated HTML table rows
      resultsTbody.innerHTML = htmlTableRows;
      
    } catch (error) {
      console.error('Error during evaluation:', error);
      
      const resultsTbody = document.getElementById('results-tbody');
      resultsTbody.innerHTML = `
        <tr class="table-danger">
          <td colspan="3" class="text-danger">Error: ${error.message}</td>
        </tr>
      `;
    }
    
    // All evaluations complete
    evaluateBtn.disabled = false;
    evaluationStatus.textContent = 'Evaluation complete!';
    evaluationStatus.classList.remove('text-primary', 'text-danger');
    evaluationStatus.classList.add('text-success');
    
    // Scroll to results
    resultsContainer.scrollIntoView({ behavior: 'smooth' });
    
  } catch (error) {
    console.error('Evaluation error:', error);
    evaluateBtn.disabled = false;
    evaluationStatus.textContent = `Evaluation failed: ${error.message}`;
    evaluationStatus.classList.remove('text-primary', 'text-success');
    evaluationStatus.classList.add('text-danger');
  }
}



// Helper function to convert blob to base64
async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
  });
}

async function transcribeAudio(audioData, audioBlob) {
  // Get selected transcription service
  const service = transcriptionServiceSelect.value;
  
  if (service === 'gemini') {
    return await transcribeWithGemini(audioData);
  } else if (service === 'openai') {
    return await transcribeWithOpenAI(audioBlob);
  } else {
    throw new Error('Invalid transcription service selected');
  }
}

async function transcribeWithGemini(base64Data) {
  const response = await fetch(
    'https://llmfoundry.straive.com/gemini/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}:viva`
      },
      credentials: "include",
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: "Transcribe this audio clip accurately in English" },
            { inline_data: { mime_type: 'audio/webm', data: base64Data } }
          ]
        }]
      })
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini transcription failed: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  return result?.candidates?.[0]?.content?.parts?.[0]?.text || 'No transcript found';
}

async function transcribeWithOpenAI(audioBlob) {
  // Create form data for OpenAI API
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'gpt-4o-transcribe');
  
  const response = await fetch(
    `${baseUrl}/audio/transcriptions`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}:viva`
      },
      credentials: "include",
      body: formData
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI transcription failed: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  return result.text || 'No transcript found';
}

async function callLLM(systemPrompt, userMessage) {
  return new Promise(async (resolve, reject) => {
    try {
      const body = {
        model: "gpt-5-mini",
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      };
      
      let fullContent = "";
      
      // Get the streaming content container
      const resultsTbody = document.getElementById('results-tbody');
      const streamingContainer = resultsTbody.querySelector('.streaming-content');
      
      // Start with table structure
      if (streamingContainer) {
        streamingContainer.innerHTML = '<table class="table table-bordered mb-0"><tbody id="streaming-tbody"></tbody></table>';
      }
      
      for await (const { content, error } of asyncLLM(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}:viva`
        },
        body: JSON.stringify(body),
      })) {
        if (error) {
          reject(new Error(`LLM API error: ${error}`));
          return;
        }
        
        if (content) {
          fullContent = content;
          
          // Update the streaming tbody in real-time
          const streamingTbody = document.getElementById('streaming-tbody');
          if (streamingTbody) {
            streamingTbody.innerHTML = fullContent;
          }
        }
      }
      
      resolve(fullContent || "No response received");
    } catch (error) {
      console.error("LLM API error:", error);
      reject(new Error(`API call failed: ${error.message}`));
    }
  });
}