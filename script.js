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

// Add event listener for run JSON button
const runJsonBtn = document.getElementById('runJsonBtn');
runJsonBtn.addEventListener('click', function() {
  try {
    const jsonEditor = document.getElementById('jsonEditor');
    const jsonContent = jsonEditor.value.trim();
    
    if (!jsonContent) {
      throw new Error('JSON content is empty');
    }
    
    // Parse the JSON content
    const questionsData = JSON.parse(jsonContent);
    
    // Update the loaded questions
    loadedQuestions = questionsData;
    
    // Populate the questions UI
    populateQuestions(questionsData);
    
    // Show the questions card if it's hidden
    document.querySelector('#questions-card').style.display = 'block';
    
    // Show success message
    statusElement.textContent = 'Questions updated successfully';
    setTimeout(() => {
      statusElement.textContent = 'Ready to record';
    }, 2000);
    
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
    
    // Prepare the prompt for LLM with all questions
    const systemPrompt = `You are an expert evaluator for interview answers. 
    You will be given multiple questions, the user's answers, and rubrics with scoring criteria.
    Evaluate each answer according to its rubric items and provide a score and reason.
    
    Return your evaluation as HTML table rows with the following columns:
    1. Name (include the question number and criteria name, e.g., "Q1_js_rendering")
    2. Score (a number from 0-2)
    3. Reason (brief explanation for the score)
    
    Format your response as valid HTML table rows (<tr>, <td>) with color-coded cells using Bootstrap classes:
    - For score 2: Add class="table-success" to the score <td> cell
    - For score 1: Add class="table-warning" to the score <td> cell
    - For score 0: Add class="table-danger" to the score <td> cell
    
    At the end, include a summary row with the total score, maximum possible score, and percentage.
    Make the summary row bold by using <strong> tags or class="fw-bold".
    Color the summary score cell based on the percentage:
    - If percentage >= 70%: class="table-success"
    - If percentage between 40-70%: class="table-warning"
    - If percentage < 40%: class="table-danger"
    
    ONLY return <tr> and <td> elements. DO NOT include the <table>, <thead>, or <tbody> tags.`;
    
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
            { text: "Transcribe this audio clip accurately" },
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