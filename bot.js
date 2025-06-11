import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';

// Lucide React Icons (replace with actual imports if using a bundler like Next.js)
// For this self-contained example, we'll define simple SVG icons inline or use a dummy for brevity.
// In a real project, you would install lucide-react and import them:
// import { MessageCircle, Zap, TrendingUp, ShieldCheck, Home } from 'lucide-react';

// Inline SVG icons for demonstration purposes
const MessageCircleIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-circle">
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </svg>
);

const ZapIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-zap">
    <path d="M4 14a1 1 0 0 1-.49-1.96l5-10A1 1 0 0 1 10 3v5h6l-3.26 3.26a1 1 0 0 0-.02 1.41l3.52 3.52A1 1 0 0 1 15 21a1 1 0 0 1-.49-1.96l-5-10A1 1 0 0 1 9 13v-5H3l3.26-3.26a1 1 0 0 0 .02-1.41l-3.52-3.52A1 1 0 0 1 4 3z" />
  </svg>
);

const TrendingUpIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trending-up">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
);

const ShieldCheckIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-shield-check">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const HomeIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-home">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);


// Firebase Context for easier access to db, auth, userId
const FirebaseContext = createContext(null);

const FirebaseProvider = ({ children }) => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    try {
      const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestoreDb);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            try {
              await signInWithCustomToken(firebaseAuth, __initial_auth_token);
            } catch (error) {
              console.error("Error signing in with custom token:", error);
              await signInAnonymously(firebaseAuth);
            }
          } else {
            await signInAnonymously(firebaseAuth);
          }
          setUserId(firebaseAuth.currentUser?.uid || crypto.randomUUID()); // Ensure userId is set even for anonymous
        }
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    } catch (e) {
      console.error("Failed to initialize Firebase:", e);
      // Even if Firebase initialization fails, set auth ready to allow the app to render (though chat won't work)
      setIsAuthReady(true);
    }
  }, []);

  return (
    <FirebaseContext.Provider value={{ db, auth, userId, isAuthReady }}>
      {children}
    </FirebaseContext.Provider>
  );
};


// Chatbot Component - Reusing and refining the previous chatbot logic
const ChatbotComponent = () => {
  const { db, userId, isAuthReady } = useContext(FirebaseContext);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Listen for chat history changes from Firestore
  useEffect(() => {
    if (db && userId && isAuthReady) {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const chatCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chatHistory`);
      // Important: orderBy() can cause issues if no index is present.
      // For simplicity, we fetch and sort in client-side.
      const q = query(chatCollectionRef);

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedMessages = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })).sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0)); // Sort by timestamp
        setMessages(fetchedMessages);
        scrollToBottom();
      }, (error) => {
        console.error("Error fetching chat history:", error);
      });

      return () => unsubscribe();
    }
  }, [db, userId, isAuthReady]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async () => {
    if (!input.trim() || !db || !userId || !isAuthReady) return;

    setLoading(true);
    const userMessage = {
      role: 'user',
      text: input,
      timestamp: serverTimestamp()
    };

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const chatCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chatHistory`);

    try {
      await addDoc(chatCollectionRef, userMessage);
    } catch (error) {
      console.error("Error saving user message to Firestore:", error);
      setLoading(false);
      return;
    }

    setInput('');

    try {
      // Create chat history for the API call, ensuring it's in the correct format
      const historyForApi = messages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }));
      historyForApi.push({ role: "user", parts: [{ text: userMessage.text }] });

      const payload = { contents: historyForApi };
      const apiKey = ""; // Canvas will provide this at runtime
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
        const aiText = result.candidates[0].content.parts[0].text;
        const aiMessage = {
          role: 'model',
          text: aiText,
          timestamp: serverTimestamp()
        };
        await addDoc(chatCollectionRef, aiMessage);
      } else {
        console.error("Unexpected API response structure:", result);
        const errorMessage = {
          role: 'model',
          text: "Sorry, I couldn't get a response from the AI. Please try again.",
          timestamp: serverTimestamp()
        };
        await addDoc(chatCollectionRef, errorMessage);
      }
    } catch (error) {
      console.error("Error communicating with Gemini API:", error);
      const errorMessage = {
        role: 'model',
        text: "An error occurred while connecting to the AI. Please check your internet connection.",
        timestamp: serverTimestamp()
      };
      if (db && userId) {
         await addDoc(chatCollectionRef, errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !loading) {
      sendMessage();
    }
  };

  if (!isAuthReady) {
    return (
      <div className="flex justify-center items-center h-full text-lg text-gray-600">
        Initializing chatbot...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 font-inter text-gray-800 rounded-lg shadow-xl overflow-hidden border border-gray-200">
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4 text-white shadow-md rounded-t-lg flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <MessageCircleIcon className="w-6 h-6" />
          AI Chatbot
        </h2>
        {userId && (
          <div className="text-xs bg-blue-800 px-3 py-1 rounded-full opacity-80 shadow-inner">
            User ID: {userId}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white scrollbar-thin scrollbar-thumb-blue-400 scrollbar-track-blue-100">
        {messages.length === 0 && !loading && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-lg">Start a conversation with our AI!</p>
          </div>
        )}
        {messages.map((msg, index) => (
          <div
            key={msg.id || index}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] p-3 rounded-lg shadow-md break-words whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white rounded-br-none'
                  : 'bg-gray-100 text-gray-800 rounded-bl-none border border-gray-200'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[75%] p-3 rounded-lg shadow-md bg-gray-100 text-gray-800 rounded-bl-none border border-gray-200">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-300"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-gray-200 shadow-lg rounded-b-lg flex items-center gap-3">
        <input
          type="text"
          className="flex-1 p-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
          placeholder="Type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={loading || !isAuthReady}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !isAuthReady || !input.trim()}
          className={`px-6 py-3 rounded-full font-semibold text-white transition-all duration-300 flex items-center justify-center gap-2
            ${
              loading || !isAuthReady || !input.trim()
                ? 'bg-blue-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-md hover:shadow-lg'
            }`}
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <>
              Send
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
};


// Home Page Component
const HomePage = ({ navigate }) => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 font-inter text-gray-800 p-6">
    {/* Hero Section */}
    <section className="text-center py-20 px-4 max-w-4xl">
      <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 leading-tight mb-6 animate-fade-in-down">
        Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-700">Finnopage</span>
      </h1>
      <p className="text-xl md:text-2xl text-gray-600 mb-10 animate-fade-in-up delay-200">
        Your innovative solution for staying informed and connected with cutting-edge AI.
      </p>
      <button
        onClick={() => navigate('chatbot')}
        className="inline-flex items-center justify-center px-8 py-4 border border-transparent text-lg font-semibold rounded-full shadow-lg text-white bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-95 animate-bounce-in delay-400"
      >
        <MessageCircleIcon className="w-6 h-6 mr-3" />
        Try Our AI Chatbot Now!
      </button>
    </section>

    {/* Features Section */}
    <section className="w-full max-w-6xl py-16 px-4 bg-white rounded-xl shadow-2xl mt-16 animate-fade-in delay-600">
      <h2 className="text-4xl font-bold text-center text-gray-900 mb-12">Why Choose Finnopage?</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
        <div className="flex flex-col items-center text-center p-6 bg-blue-50 rounded-xl shadow-md transform hover:scale-105 transition-transform duration-300 group">
          <div className="p-4 bg-blue-500 rounded-full text-white mb-4 shadow-lg group-hover:bg-blue-600 transition-colors">
            <ZapIcon className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Instant Insights</h3>
          <p className="text-gray-600">Get immediate, accurate answers to your questions powered by advanced AI models.</p>
        </div>
        <div className="flex flex-col items-center text-center p-6 bg-green-50 rounded-xl shadow-md transform hover:scale-105 transition-transform duration-300 group">
          <div className="p-4 bg-green-500 rounded-full text-white mb-4 shadow-lg group-hover:bg-green-600 transition-colors">
            <TrendingUpIcon className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Always Up-to-Date</h3>
          <p className="text-gray-600">Our chatbot continuously learns to provide you with the latest information.</p>
        </div>
        <div className="flex flex-col items-center text-center p-6 bg-purple-50 rounded-xl shadow-md transform hover:scale-105 transition-transform duration-300 group">
          <div className="p-4 bg-purple-500 rounded-full text-white mb-4 shadow-lg group-hover:bg-purple-600 transition-colors">
            <ShieldCheckIcon className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Secure & Reliable</h3>
          <p className="text-gray-600">Your conversations are private and handled with the utmost security.</p>
        </div>
      </div>
    </section>

    {/* About Section */}
    <section className="w-full max-w-4xl py-16 px-4 text-center mt-16">
      <h2 className="text-4xl font-bold text-gray-900 mb-8">About Finnopage</h2>
      <p className="text-lg text-gray-700 leading-relaxed">
        Finnopage is dedicated to bridging the gap between complex information and everyday usability.
        Our mission is to empower individuals and businesses with intelligent tools that make information
        access seamless and intuitive. We believe in harnessing the power of AI responsibly to create a
        more informed and connected world.
      </p>
    </section>
  </div>
);


// Main App Component
function App() {
  const [currentPage, setCurrentPage] = useState('home'); // 'home' or 'chatbot'

  const navigate = (page) => {
    setCurrentPage(page);
  };

  return (
    <FirebaseProvider>
      <div className="min-h-screen flex flex-col">
        {/* Global Styles (Inter font, scrollbar) */}
        <style>
          {`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
          body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            overflow-x: hidden; /* Prevent horizontal scroll */
          }
          .scrollbar-thin::-webkit-scrollbar {
            width: 8px;
          }
          .scrollbar-thin::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 10px;
          }
          .scrollbar-thin::-webkit-scrollbar-thumb {
            background: #a7a7a7;
            border-radius: 10px;
          }
          .scrollbar-thin::-webkit-scrollbar-thumb:hover {
            background: #888;
          }

          /* Keyframe Animations */
          @keyframes fadeInDown {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes bounceIn {
            0%, 20%, 40%, 60%, 80%, 100% {
              animation-timing-function: cubic-bezier(0.215, 0.610, 0.355, 1.000);
            }
            0% { opacity: 0; transform: scale3d(.3, .3, .3); }
            20% { transform: scale3d(1.1, 1.1, 1.1); }
            40% { transform: scale3d(.9, .9, .9); }
            60% { opacity: 1; transform: scale3d(1.03, 1.03, 1.03); }
            80% { transform: scale3d(.97, .97, .97); }
            100% { opacity: 1; transform: scale3d(1, 1, 1); }
          }

          .animate-fade-in-down { animation: fadeInDown 0.6s ease-out forwards; }
          .animate-fade-in-up { animation: fadeInUp 0.6s ease-out forwards; }
          .animate-fade-in { animation: fadeIn 0.8s ease-out forwards; }
          .animate-bounce-in { animation: bounceIn 0.8s ease-out forwards; }

          .delay-100 { animation-delay: 0.1s; }
          .delay-200 { animation-delay: 0.2s; }
          .delay-300 { animation-delay: 0.3s; }
          .delay-400 { animation-delay: 0.4s; }
          .delay-600 { animation-delay: 0.6s; }

          `}
        </style>

        {/* Navbar */}
        <nav className="bg-white shadow-lg py-4 px-6 md:px-10 flex justify-between items-center z-10 sticky top-0 border-b border-gray-200">
          <div className="flex items-center">
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-700">
              Finnopage
            </h1>
          </div>
          <div className="flex space-x-6">
            <button
              onClick={() => navigate('home')}
              className={`flex items-center px-4 py-2 rounded-full font-medium transition-all duration-300 ease-in-out
                ${currentPage === 'home' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'}`}
            >
              <HomeIcon className="w-5 h-5 mr-2" /> Home
            </button>
            <button
              onClick={() => navigate('chatbot')}
              className={`flex items-center px-4 py-2 rounded-full font-medium transition-all duration-300 ease-in-out
                ${currentPage === 'chatbot' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'}`}
            >
              <MessageCircleIcon className="w-5 h-5 mr-2" /> Chatbot
            </button>
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto bg-gray-50">
          {currentPage === 'home' && <HomePage navigate={navigate} />}
          {currentPage === 'chatbot' && (
            <div className="p-6 h-[calc(100vh-80px)] md:p-10 flex justify-center items-center"> {/* Adjust height based on navbar height */}
              <div className="w-full max-w-4xl h-full flex-shrink-0">
                <ChatbotComponent />
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="bg-gray-800 text-white py-8 px-6 md:px-10 text-center rounded-t-xl shadow-inner">
          <p className="text-sm md:text-base">
            &copy; {new Date().getFullYear()} Finnopage. All rights reserved.
          </p>
          <p className="text-xs md:text-sm mt-2 text-gray-400">
            Powered by cutting-edge AI and secure cloud infrastructure.
          </p>
        </footer>
      </div>
    </FirebaseProvider>
  );
}

export default App;
