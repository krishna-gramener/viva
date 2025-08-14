const recordBtn = document.getElementById('recordBtn');
const statusElement = document.getElementById('status');
const transcript = document.getElementById('transcript');
const audioPlayer = document.getElementById('audioPlayer') || createAudioPlayer();
let mediaRecorder;
let audioChunks = [];
let audioURL = null;
let token = '';

// Create audio player if it doesn't exist
function createAudioPlayer() {
  const playerContainer = document.createElement('div');
  playerContainer.className = 'mt-3';
  playerContainer.innerHTML = `
    <h5>Recorded Audio</h5>
    <audio id="audioPlayer" controls class="w-100" style="display: none;"></audio>
  `;
  
  // Insert after transcript element
  transcript.parentNode.insertBefore(playerContainer, transcript.nextSibling);
  return document.getElementById('audioPlayer');
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

// Add event listener to record button
recordBtn.addEventListener('click', async () => {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    try {
      // Start recording
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      audioChunks = [];
      
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
          statusElement.textContent = 'Transcribing audio...';
          
          // Send to Gemini API
          const transcriptText = await transcribeAudio(base64Data);
          transcript.textContent = transcriptText;
          statusElement.textContent = 'Ready to record';
        } catch (error) {
          console.error('Processing error:', error);
          transcript.textContent = `Error: ${error.message}`;
          statusElement.textContent = 'Error occurred';
        }
      };

      // Start recording
      mediaRecorder.start();
      recordBtn.textContent = '⏹ Stop';
      recordBtn.classList.add('recording');
      statusElement.textContent = 'Recording...';
    } catch (err) {
      console.error('Microphone error:', err);
      statusElement.textContent = 'Microphone access denied';
      transcript.textContent = 'Error: Could not access microphone';
    }
  } else {
    // Stop recording
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    recordBtn.textContent = '🎤 Record';
    recordBtn.classList.remove('recording');
  }
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

