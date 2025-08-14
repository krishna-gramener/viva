const statusElement = document.getElementById('status');
const micButtons = document.querySelectorAll('.mic-btn');
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
  } catch (error) {
    console.error('Token initialization Nerror:', error);
  }
}

init();

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
      // Start recording
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
          
          // Send to Gemini API
          const transcriptText = await transcribeAudio(base64Data);
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

async function transcribeAudio(base64Data) {
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
    throw new Error(`Transcription failed: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  return result?.candidates?.[0]?.content?.parts?.[0]?.text || 'No transcript found';
}

