# VoiceViva

VoiceViva is an AI-powered technical interview application that records audio responses, transcribes them, and evaluates them against rubrics using LLM technology.

## Key Features

- **Multiple Interview Types**: Choose from predefined interview types or generate custom questions
- **Audio Recording & Transcription**: Record responses with automatic transcription via Gemini or OpenAI APIs
- **LLM Evaluation**: Evaluate responses against rubrics with detailed feedback
- **GitHub Integration**: Generate interview questions based on repository code
- **Customizable System Prompts**: Edit the prompts used for question generation and evaluation
- **JSON Editor**: Create or modify interview questions and rubrics

## Quick Start

1. Open `index.html` in a modern web browser
2. Select an interview type or generate questions from a GitHub repository
3. Grant microphone permissions when prompted
4. Record your answers to each question
5. Submit for evaluation

## Technical Overview

### Components

- `index.html` - UI with Bootstrap styling
- `script.js` - Core application logic
- `ques.json` - Predefined interview questions and rubrics

### Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript, Bootstrap 5
- **APIs**: Gemini API (transcription), OpenAI API (transcription and evaluation)
- **Browser APIs**: MediaRecorder, Fetch, FileReader, Promise

### System Prompts

The application uses customizable system prompts for:
1. **Question Generation**: Creates technical questions based on GitHub repository content
2. **Answer Evaluation**: Evaluates responses against question-specific rubrics

### Security Notes

- API keys should be secured on a backend server for production use
- GitHub personal access tokens are used only for the current session and not stored
