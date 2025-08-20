// Firebase configuration and authentication logic
const firebaseConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    measurementId: ""
  };

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get Firebase services
const auth = firebase.auth();
const db = firebase.firestore();

// Current user information
let currentUser = null;

// Login function
async function loginUser(email, password) {
  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    currentUser = userCredential.user;
    console.log("User logged in:", currentUser);
    return currentUser;
  } catch (error) {
    console.error("Login error:", error);
    document.getElementById('login-error').textContent = error.message;
    document.getElementById('login-error').style.display = 'block';
    return null;
  }
}

// Signup function
async function createUser(email, password) {
  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    currentUser = userCredential.user;
    console.log("User created:", currentUser);
    return currentUser;
  } catch (error) {
    console.error("Signup error:", error);
    document.getElementById('login-error').textContent = error.message;
    document.getElementById('login-error').style.display = 'block';
    return null;
  }
}

// Logout function
async function logoutUser() {
  try {
    await auth.signOut();
    currentUser = null;
    console.log("User logged out");
    showLogin();
  } catch (error) {
    console.error("Logout error:", error);
  }
}

// Show app UI
function showApp() {
  document.getElementById('login-container').style.display = 'none';
  document.getElementById('app-container').style.display = 'block';
}

// Show login UI
function showLogin() {
  document.getElementById('login-container').style.display = 'block';
  document.getElementById('app-container').style.display = 'none';
}

// Function to save quiz results to Firestore
async function saveQuizResults(quizType, questions, answers, evaluationResults) {
  if (!currentUser) {
    console.error("No user logged in");
    return;
  }
  
  try {
    // Calculate overall score
    let totalScore = 0;
    let maxPossibleScore = 0;
    
    evaluationResults.forEach(result => {
      totalScore += result.score || 0;
      // Assuming each question has a max score of 2 per rubric item
      const rubricCount = questions.find(q => q.question === result.question)?.rubric.length || 0;
      maxPossibleScore += rubricCount * 2;
    });
    
    const percentageScore = Math.round((totalScore / maxPossibleScore) * 100);
    
    // Create a document with the quiz results
    const quizData = {
      userId: currentUser.uid,
      userEmail: currentUser.email,
      quizType: quizType,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      questions: questions.map(q => q.question),
      answers: answers,
      evaluationResults: evaluationResults,
      totalScore: totalScore,
      maxPossibleScore: maxPossibleScore,
      percentageScore: percentageScore
    };
    
    // Add to Firestore
    const docRef = await db.collection('quizResults').add(quizData);
    console.log("Results saved with ID:", docRef.id);
    
    // Show success message
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-success mt-3';
    alertDiv.innerHTML = `<i class="bi bi-check-circle-fill"></i> Results saved successfully!`;
    document.getElementById('save-results-btn').insertAdjacentElement('afterend', alertDiv);
    
    // Remove the alert after 3 seconds
    setTimeout(() => {
      alertDiv.remove();
    }, 3000);
    
    return docRef.id;
  } catch (error) {
    console.error("Error saving results:", error);
    
    // Show error message
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger mt-3';
    alertDiv.innerHTML = `<i class="bi bi-exclamation-triangle-fill"></i> Error saving results: ${error.message}`;
    document.getElementById('save-results-btn').insertAdjacentElement('afterend', alertDiv);
    
    return null;
  }
}

// Function to get user's quiz history
async function getUserQuizHistory() {
  if (!currentUser) return [];
  
  try {
    const snapshot = await db.collection('quizResults')
      .where('userId', '==', currentUser.uid)
      .orderBy('timestamp', 'desc')
      .get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error("Error getting quiz history:", error);
    return [];
  }
}

// Initialize auth listeners
function initializeAuth() {
  // Check auth state on page load
  auth.onAuthStateChanged((user) => {
    if (user) {
      // User is signed in
      currentUser = user;
      console.log("User is signed in:", user);
      showApp();
      // Call the initialization function from script.js
      if (typeof initializeApp === 'function') {
        initializeApp();
      }
    } else {
      // User is signed out
      currentUser = null;
      console.log("User is signed out");
      showLogin();
    }
  });

  // Login form submission
  document.getElementById('login-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    loginUser(email, password);
  });
  
  // Signup button click
  document.getElementById('signup-button')?.addEventListener('click', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (email && password) {
      createUser(email, password);
    } else {
      document.getElementById('login-error').textContent = "Please enter email and password";
      document.getElementById('login-error').style.display = 'block';
    }
  });
  
  // Logout button click
  document.getElementById('logout-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    logoutUser();
  });
}

// Export functions and variables for use in other files
window.authModule = {
  currentUser: () => currentUser,
  loginUser,
  createUser,
  logoutUser,
  saveQuizResults,
  getUserQuizHistory,
  initializeAuth
};
