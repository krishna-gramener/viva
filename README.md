# Audio Recorder & Gemini Transcription Web App

This minimalist web application allows users to record audio from their microphone and transcribe it using Google's Gemini API.

## Features

- Audio recording from the user's microphone
- Audio playback of recorded content
- Direct integration with Gemini API for audio transcription
- Base64 inline data approach for efficient audio processing
- Simple, clean user interface with Bootstrap styling

## Project Structure

- `index.html` - HTML structure with Bootstrap styling
- `script.js` - JavaScript code for audio recording and API integration

## How It Works

### Audio Recording

The application uses the MediaRecorder API to record audio in WebM format with Opus codec. When recording stops, the audio is automatically processed for transcription and made available for playback.

### Gemini API Integration

The application uses a streamlined process to transcribe audio:
1. Converts the audio blob to base64 data using the `blobToBase64()` helper function
2. Sends the base64 data directly to Gemini's generateContent endpoint as inline data
3. Processes and displays the transcription result

### Code Structure

The code is organized into modular functions:
- Main event listener for the record button
- `createAudioPlayer()` - Creates the audio player element
- `blobToBase64()` - Converts audio blob to base64 string
- `transcribeAudio()` - Handles API communication with Gemini
- `init()` - Initializes the application

## Setup Instructions

1. Clone this repository
2. Open `index.html` in a web browser
3. Grant microphone permissions when prompted
4. Click the "Record" button to start recording
5. Click the "Stop" button to stop recording and process the audio
6. Listen to your recording and view the transcription

## API Reference

The application uses the Gemini API with the latest Gemini 2.5 Flash model for high-quality transcription:

```
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
```

## Implementation Details

- Uses inline base64 data approach instead of file uploads for better reliability
- Implements proper error handling and status updates
- Provides audio playback functionality for user convenience
- Uses proper CORS handling for API communication
- Modular code structure with helper functions for maintainability

## Security Considerations

- Authentication is handled via API keys
- For production use, API keys should be secured on a backend server

## Browser Compatibility

This application works in modern browsers that support:
- MediaRecorder API
- Fetch API
- FileReader API
- Promise API
- Audio playback
