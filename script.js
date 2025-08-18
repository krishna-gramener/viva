import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";

const statusElement = document.getElementById('status');
const micButtons = document.querySelectorAll('.mic-btn');
const transcriptionServiceSelect = document.getElementById('transcriptionService');
const microphoneSelect = document.getElementById('microphoneSelect');
const refreshMicsButton = document.getElementById('refreshMics');

const { baseUrl, apiKey } = await openaiConfig({
  baseUrls: [
    { url: "https://api.openai.com/v1", name: "OpenAI" },
    { url: "https://openrouter.com/api/v1", name: "OpenRouter" },
    { url: "https://llmfoundry.straive.com/openai/v1", name: "LLMFoundry" },
  ],
  // baseUrls overrides defaultBaseUrls
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
    const response = await fetch("https://llmfoundry.straive.com/token", { credentials: "include" });
    const data = await response.json();
    token = data.token;
    
    // Initialize microphone list
    await populateMicrophoneList();
  } catch (error) {
    console.error('Token initialization error:', error);
  }
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

// Add event listeners to all mic buttons
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

