import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { 
  MessageSquare, Plus, Trash2, Database, Brain, HardDrive, 
  Settings, Send, StopCircle, RefreshCw, Paperclip, ChevronRight, Moon, Sun, Globe, Search, Image as ImageIcon, Sparkles, Download, X, Loader2, EyeOff, ShieldCheck, FileText, Cpu, Video, Check, Copy, ExternalLink, Info, Mic, MicOff, Volume2, VolumeX,
  Compass, LayoutDashboard, HelpCircle, User, Bell, MoreVertical, Flame, Lightbulb, MonitorCheck, Scale, Grid, Shuffle, ArrowRight,
  ArrowDown, Edit2, RotateCw, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen
} from 'lucide-react';
import AstraCompanion, { speakAstra, cleanForSpeech } from './AstraCompanion';

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('SparkLLM/Spark-X2.5-1.7B:latest');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'documents' | 'memories' | 'hardware' | 'image_gen'
  const [hardware, setHardware] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [memories, setMemories] = useState([]);
  const [newMemory, setNewMemory] = useState('');
  const [theme, setTheme] = useState('dark');
  const [showThinking, setShowThinking] = useState(true);
  const [isVisionAnalyzing, setIsVisionAnalyzing] = useState(false);
  const [isGeneratingInChatImage, setIsGeneratingInChatImage] = useState(false);
  const [isIncognito, setIsIncognito] = useState(false);
  const [isRagOnly, setIsRagOnly] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // null | { name, stage: 'Uploading' | 'Indexing' | 'Embedding' }
  const [researchState, setResearchState] = useState(null); // null | { type: 'url' | 'search', query: string }
  const [isAstraActive, setIsAstraActive] = useState(false);
  const [isAstraThinking, setIsAstraThinking] = useState(false);
  const [isAstraOnly, setIsAstraOnly] = useState(false);
  const [latestAssistantReply, setLatestAssistantReply] = useState('');

  // Staged File/Image Upload State in Chat
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);

  // Web Speech API Voice Dictation State
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState(null);
  const recognitionRef = useRef(null);

  // Auto Speech Back (TTS) State using Astra's Voice
  const [isSpeechBackEnabled, setIsSpeechBackEnabled] = useState(false);
  const [currentlySpeakingMsgId, setCurrentlySpeakingMsgId] = useState(null);

  // Collapsible Sidebars State
  const [isRailExpanded, setIsRailExpanded] = useState(true);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);

  // History search filter query
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  // Helper to group conversations by relative timeframe
  const getGroupedConversations = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    const filtered = conversations.filter(c => 
      !historySearchQuery.trim() || 
      (c.title && c.title.toLowerCase().includes(historySearchQuery.toLowerCase()))
    );

    const groups = {
      Today: [],
      'Previous 7 Days': [],
      'Previous 30 Days': [],
      Earlier: []
    };

    filtered.forEach(c => {
      const updatedTime = c.updated_at ? new Date(c.updated_at).getTime() : now.getTime();
      const diff = today - updatedTime;

      if (diff <= 0) {
        groups.Today.push(c);
      } else if (diff <= 7 * oneDay) {
        groups['Previous 7 Days'].push(c);
      } else if (diff <= 30 * oneDay) {
        groups['Previous 30 Days'].push(c);
      } else {
        groups.Earlier.push(c);
      }
    });

    return groups;
  };

  // SD Image Generation State
  const [imagePrompt, setImagePrompt] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedGallery, setGeneratedGallery] = useState([]);

  // Copied State Tracker for Message & Code Blocks
  const [copiedId, setCopiedId] = useState(null);
  // Source Drawer Preview State
  const [activeSourceDrawer, setActiveSourceDrawer] = useState(null);

  // Dynamic Mouse Background Flash / Aura
  const [mousePos, setMousePos] = useState({ x: -500, y: -500 });

  // Floating Scroll-To-Bottom & Unread Tracker
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const chatScrollRef = useRef(null);

  // Message Editing State
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editingText, setEditingText] = useState('');

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Track global mouse position for ambient background glow
  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Handle scroll events in chat messages container
  const handleChatScroll = () => {
    if (!chatScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    setShowScrollBottom(!isAtBottom);
    if (isAtBottom) {
      setHasUnread(false);
    }
  };

  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
      setHasUnread(false);
      setShowScrollBottom(false);
    }
  };

  // Re-generate assistant response starting from user message index
  const handleRegenerateFromUser = (msgContent, userMsgIdx) => {
    if (isStreaming) return;
    // Slice history up to user message
    const trimmed = messages.slice(0, userMsgIdx);
    setMessages(trimmed);
    handleSend(msgContent);
  };

  // Save edited user message and trigger response
  const handleSaveEditedMessage = (userMsgIdx) => {
    if (!editingText.trim() || isStreaming) return;
    const newContent = editingText.trim();
    setEditingMsgId(null);
    setEditingText('');
    handleRegenerateFromUser(newContent, userMsgIdx);
  };

  // Initialize Web Speech API SpeechRecognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };

      recognition.onresult = (event) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptChunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            setInput(prev => (prev ? prev + ' ' : '') + transcriptChunk.trim());
          } else {
            currentTranscript += transcriptChunk;
          }
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech Recognition notice:', event.error);
        if (event.error === 'not-allowed') {
          setSpeechError('Microphone access denied. Please allow microphone permission in your browser.');
        } else if (event.error !== 'no-speech') {
          setSpeechError(`Speech error: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
    };
  }, []);

  const toggleSpeechRecognition = () => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      alert('Speech Recognition is not supported by your current browser. Please use Google Chrome, Edge, or a Chromium-based browser.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setSpeechError(null);
      try {
        recognitionRef.current?.start();
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
        // If already started or in transition, restart
        try {
          recognitionRef.current?.stop();
          setTimeout(() => recognitionRef.current?.start(), 150);
        } catch (e) {}
      }
    }
  };

  // Play speech out loud using Astra's voice
  const handleSpeakText = (text, msgId = null) => {
    if (!window.speechSynthesis) return;

    // If currently speaking this message, toggle off
    if (currentlySpeakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setCurrentlySpeakingMsgId(null);
      return;
    }

    setCurrentlySpeakingMsgId(msgId);
    speakAstra(
      text,
      false, // not muted
      () => setCurrentlySpeakingMsgId(msgId),
      () => setCurrentlySpeakingMsgId(null)
    );
  };

  useEffect(() => {
    fetchConversations();
    fetchModels();
    fetchHardware();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (activeConvId) {
      fetchConversationMessages(activeConvId);
      fetchDocuments(activeConvId);
    } else {
      setDocuments([]);
    }
  }, [activeConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/conversations');
      const data = await res.json();
      setConversations(data);
      if (data.length > 0 && !activeConvId) {
        setActiveConvId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      const mList = (data.models || []).map(m => m.name);
      setModels(mList);
      if (mList.length > 0 && !mList.includes(selectedModel)) {
        setSelectedModel(mList[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHardware = async () => {
    try {
      const res = await fetch('/api/hardware');
      const data = await res.json();
      setHardware(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchConversationMessages = async (id) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = await res.json();
      setMessages(data.messages || []);
      if (data.model) setSelectedModel(data.model);
      if (data.documents) setDocuments(data.documents);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDocuments = async (convId) => {
    try {
      const url = convId ? `/api/documents?conversation_id=${convId}` : '/api/documents';
      const res = await fetch(url);
      const data = await res.json();
      setDocuments(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMemories = async () => {
    try {
      const res = await fetch('/api/memories');
      const data = await res.json();
      setMemories(data);
    } catch (e) {
      console.error(e);
    }
  };

  const startNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setDocuments([]);
    setActiveTab('chat');
  };

  const toggleIncognito = () => {
    setIsIncognito(prev => {
      const nextVal = !prev;
      if (nextVal) {
        // Entering incognito creates a blank temporary session
        setActiveConvId(null);
        setMessages([]);
        setDocuments([]);
      }
      return nextVal;
    });
  };

  const deleteConversation = async (e, id) => {
    e.stopPropagation();
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      const updated = conversations.filter(c => c.id !== id);
      setConversations(updated);
      if (activeConvId === id) {
        if (updated.length > 0) setActiveConvId(updated[0].id);
        else startNewChat();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedFile && !selectedImage) || isStreaming || isVisionAnalyzing) return;

    // Handle staged image vision directly
    if (selectedImage) {
      const imgFile = selectedImage;
      setSelectedImage(null);
      setImagePreviewUrl(null);
      await triggerImageAnalysisWithFile(imgFile, input.trim());
      return;
    }

    // Handle staged RAG document upload directly
    if (selectedFile) {
      const fileToUpload = selectedFile;
      setSelectedFile(null);
      await uploadDocumentAndChat(fileToUpload, input.trim());
      return;
    }

    const userText = input.trim();
    setInput('');

    // Easter egg trigger: /astra or \astro
    const normalizedCmd = userText.toLowerCase().replace(/\\/g, '/');
    if (normalizedCmd === '/astra' || normalizedCmd === '/astro') {
      setIsAstraActive(true);
      const userMsg = { id: Date.now().toString(), role: 'user', content: userText };
      const easterEggReply = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `✨ **Astra Easter Egg Activated!**\n\nYour companion **Astra** has arrived! Look at the bottom right corner of your screen:\n- 🖐️ **Click head**: Boop / poke Astra\n- 💆 **Rub head**: Scrub back & forth across head to give head rubs\n- 🧠 **Ask questions**: Astra will think and speak alongside the AI\n- 😴 **Idle 10 seconds**: Astra gets sleepy and naps! Click to wake up.\n- 🌟 **Type \`/astraonly\`**: Enter fullscreen Astra Companion chatting mode!`
      };
      setMessages(prev => [...prev, userMsg, easterEggReply]);
      return;
    }

    // Fullscreen Immersive Companion Mode trigger: /astraonly
    if (normalizedCmd === '/astraonly') {
      setIsAstraActive(true);
      setIsAstraOnly(true);
      return;
    }

    // Check if this prompt will trigger image generation
    const isImageGen = /\b(create|generate|make|render|draw|paint)\s+(an?\s+)?image\b|\bimage\s+of\b/i.test(userText);
    if (isImageGen) {
      setIsGeneratingInChatImage(true);
    }

    // Check if this prompt is a URL or explicit research request
    const isUrl = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/i.test(userText);
    const isResearch = /\b(research|\/research)\b/i.test(userText);
    if (isUrl) {
      const match = userText.match(/(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/i);
      const matchedUrl = match ? match[1] : 'URL';
      const isYt = /(?:youtube\.com|youtu\.be)/i.test(matchedUrl);
      setResearchState({ type: isYt ? 'youtube' : 'url', query: matchedUrl });
    } else if (isResearch) {
      const cleanQ = userText.replace(/^\/?research\s*[:\-\s]?\s*/i, '').trim();
      setResearchState({ type: 'search', query: cleanQ || 'Web' });
    } else {
      setResearchState(null);
    }

    const userMsg = { id: Date.now().toString(), role: 'user', content: userText };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    setIsAstraThinking(true); // Activate thinking animation immediately upon submit!

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', sources: null, thinking_content: null }]);

    // Setup AbortController for cancelable generation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: isIncognito ? null : activeConvId,
          content: userText,
          model: selectedModel,
          enable_rag: !isIncognito,
          enable_memory: !isIncognito && !isRagOnly,
          enable_tools: !isRagOnly,
          enable_search: !isRagOnly,
          incognito: isIncognito,
          rag_only: isRagOnly,
          history: isIncognito ? messages.map(m => ({ role: m.role, content: m.content })) : []
        })
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      let sources = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.delta) {
                assistantText += data.delta;
                // If model started streaming real content (beyond initial fetching notices), dismiss research loader
                if (assistantText.length > 40) {
                  setResearchState(null);
                }

                // Detect thinking tag vs regular streaming
                if (assistantText.includes('<think>') && !assistantText.includes('</think>')) {
                  setIsAstraThinking(true);
                } else {
                  setIsAstraThinking(false);
                }

                // If markdown image syntax is encountered, turn off the loading animation
                if (assistantText.includes('![') && (assistantText.includes('/storage/images') || assistantText.includes('](http') || assistantText.includes('](data:image'))) {
                  setIsGeneratingInChatImage(false);
                }
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantText } : m));

                // Mark unread if user has scrolled away from bottom
                if (chatScrollRef.current) {
                  const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.current;
                  if (scrollHeight - scrollTop - clientHeight > 100) {
                    setHasUnread(true);
                  }
                }
              }
              if (data.sources) {
                sources = data.sources;
                setResearchState(null);
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, sources } : m));
              }
            } catch (err) {}
          }
        }
      }

      const cleanAssistantReply = assistantText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      setLatestAssistantReply(cleanAssistantReply);
      fetchConversations();

      // If Speech Back is enabled, speak the answer out loud using Astra's voice
      if (isSpeechBackEnabled && cleanAssistantReply) {
        handleSpeakText(cleanAssistantReply, assistantId);
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Stream generation aborted by user.');
      } else {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `Error: ${err.message}` }]);
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
      setIsGeneratingInChatImage(false);
      setResearchState(null);
      setIsAstraThinking(false);
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setIsGeneratingInChatImage(false);
    setResearchState(null);
    setIsAstraThinking(false);
  };

  const handleExportChat = (format = 'markdown') => {
    if (!messages.length) {
      alert('No messages to export in this conversation.');
      return;
    }

    const currentConv = conversations.find(c => c.id === activeConvId);
    const title = currentConv?.title || 'Astra_Talk_Chat';
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${timestamp}`;

    if (format === 'json') {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(messages, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `${filename}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } else {
      let md = `# ${title}\n*Exported from Astra Talk on ${new Date().toLocaleString()}*\n*Model: ${selectedModel}*\n\n---\n\n`;
      messages.forEach((m) => {
        const roleName = m.role === 'user' ? '👤 User' : '🤖 Astra';
        md += `### ${roleName}\n\n${m.content}\n\n`;
        if (m.sources && m.sources.length) {
          md += `**Sources:**\n` + m.sources.map(s => `- [${s.filename}](${s.url || '#'})`).join('\n') + `\n\n`;
        }
        md += `---\n\n`;
      });

      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', url);
      downloadAnchor.setAttribute('download', `${filename}.md`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);
    }
  };

  const copyToClipboard = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(prev => (prev === id ? null : prev));
    }, 2000);
  };

  // Dedicated sender for AstraOnly full-screen conversation
  const sendAstraOnlyMessage = async (customText) => {
    if (!customText.trim() || isStreaming) return;
    const userText = customText.trim();
    setIsStreaming(true);
    setIsAstraThinking(true); // Show thinking animation right away as model computes!

    // Pick currently selected model, or fallback to available model
    const chatModel = selectedModel || (models[0] && models[0].name) || 'SparkLLM/Spark-X2.5-1.7B:latest';

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: isIncognito ? null : activeConvId,
          content: userText,
          system_prompt: (
            "You are Astra, a genuine, warm, and playful companion. You talk like an insightful, supportive close friend.\n" +
            "RULES:\n" +
            "1. Answer what the user asked with real substance and common sense. If they ask your name, your name is Astra. If they give a short phrase or compliment, acknowledge it genuinely.\n" +
            "2. Never parrot, repeat, or echo the user's words as your opening line.\n" +
            "3. Never recite instructions, persona labels, or robotic customer-support phrases (e.g. avoid 'How can I assist you today?').\n" +
            "4. Keep replies natural, charming, and concise (1 to 3 conversational sentences), ideal for voice readout."
          ),
          model: chatModel,
          enable_rag: false,
          enable_memory: true,
          enable_tools: false,
          enable_search: false,
          incognito: isIncognito,
          rag_only: false,
          history: messages.slice(-4).map(m => ({ role: m.role, content: m.content }))
        })
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.delta) {
                assistantText += data.delta;
                if (assistantText.includes('<think>') && !assistantText.includes('</think>')) {
                  setIsAstraThinking(true);
                } else {
                  setIsAstraThinking(false);
                }
              }
            } catch (err) {}
          }
        }
      }

      const cleanReply = assistantText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      setLatestAssistantReply(cleanReply);

      // Keep messages synced in conversation history
      setMessages(prev => [
        ...prev, 
        { id: Date.now().toString(), role: 'user', content: userText },
        { id: (Date.now() + 1).toString(), role: 'assistant', content: cleanReply }
      ]);

    } catch (err) {
      console.error("Astra-only chat error:", err);
    } finally {
      setIsStreaming(false);
      setIsAstraThinking(false);
    }
  };

  const uploadDocumentAndChat = async (file, promptText) => {
    let currentConvId = activeConvId;
    if (!currentConvId) {
      try {
        const cRes = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: `Doc: ${file.name.slice(0, 30)}`, model: selectedModel })
        });
        const cData = await cRes.json();
        currentConvId = cData.id;
        setActiveConvId(currentConvId);
        fetchConversations();
      } catch (err) {
        alert('Could not initialize conversation');
        return;
      }
    }

    const formData = new FormData();
    formData.append('conversation_id', currentConvId);
    formData.append('file', file);

    const userPrompt = promptText ? promptText : `I have uploaded ${file.name}. Please analyze and summarize its contents.`;
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      content: `📎 *Attached document:* **${file.name}**\n\n${userPrompt}`
    }]);

    setIsStreaming(true);
    setUploadProgress({ name: file.name, stage: 'Uploading & Extracting' });
    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '⏳ Processing document...' }]);

    try {
      setUploadProgress({ name: file.name, stage: 'Generating Vector Embeddings (FastEmbed BGE)' });
      await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      });
      fetchDocuments(currentConvId);

      setUploadProgress(null);
      // Reset assistant message so stream writes clean answer
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: '' } : m));

      // Query the conversation with document isolated to this conversation
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: currentConvId,
          content: userPrompt,
          model: selectedModel,
          enable_rag: true,
          rag_only: isRagOnly
        })
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.delta) {
                assistantText += data.delta;
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantText } : m));
              }
              if (data.sources) {
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, sources: data.sources } : m));
              }
            } catch (e) {}
          }
        }
      }
    } catch (err) {
      setUploadProgress(null);
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `Error processing file: ${err.message}` } : m));
    } finally {
      setUploadProgress(null);
      setIsStreaming(false);
      fetchConversations();
    }
  };

  const triggerImageAnalysisWithFile = async (file, promptText) => {
    let currentConvId = activeConvId;
    if (!currentConvId) {
      const cRes = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Vision: ${file.name.slice(0, 25)}`, model: selectedModel })
      });
      const cData = await cRes.json();
      currentConvId = cData.id;
      setActiveConvId(currentConvId);
      fetchConversations();
    }

    const finalPrompt = promptText || "Examine and describe this image thoroughly.";
    setInput('');
    setIsVisionAnalyzing(true);
    setUploadProgress({ name: file.name, stage: 'Uploading image to Ollama Vision pipeline' });

    const userMsg = { 
      id: Date.now().toString(), 
      role: 'user', 
      content: `🖼️ **Uploaded image for analysis:** *${file.name}*\n\n${finalPrompt}` 
    };
    setMessages(prev => [...prev, userMsg]);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('prompt', finalPrompt);
    formData.append('conversation_id', currentConvId);
    formData.append('model', selectedModel);

    try {
      const res = await fetch('/api/vision/analyze', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setUploadProgress(null);
      // Only append assistant message without duplicating the user prompt
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.analysis || "No analysis returned."
      }]);
    } catch (err) {
      setUploadProgress(null);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Vision error: ${err.message}`
      }]);
    } finally {
      setUploadProgress(null);
      setIsVisionAnalyzing(false);
      fetchConversations();
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await uploadDocumentAndChat(file, input.trim());
    e.target.value = '';
  };

  const handleImageAnalysis = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await triggerImageAnalysisWithFile(file, input.trim());
    e.target.value = '';
  };

  const handleGenerateSDXL = async () => {
    if (!imagePrompt.trim() || isGeneratingImage) return;

    setIsGeneratingImage(true);
    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imagePrompt.trim(),
          conversation_id: activeConvId
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setGeneratedGallery(prev => [data, ...prev]);
        if (activeConvId) {
          fetchConversationMessages(activeConvId);
        }
      } else {
        alert(`Generation error: ${data.message || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Generation failed: ${err.message}`);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleAddMemory = async () => {
    if (!newMemory.trim()) return;
    try {
      await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMemory.trim(), category: 'semantic' })
      });
      setNewMemory('');
      fetchMemories();
    } catch (err) {
      console.error(err);
    }
  };

  const groups = getGroupedConversations();

  return (
    <div className="app-container">
      {/* Dynamic Mouse Moving Ambient Flash / Glow */}
      <div 
        className="ambient-mouse-glow" 
        style={{ 
          left: `${mousePos.x}px`, 
          top: `${mousePos.y}px`,
          opacity: mousePos.x > 0 ? (theme === 'dark' ? 1 : 0.6) : 0
        }} 
      />

      {/* Left Rail Icon Bar */}
      <aside className={`rail-sidebar ${isRailExpanded ? '' : 'collapsed'}`}>
        <div className="rail-top">
          <div 
            className="rail-brand-logo" 
            onClick={startNewChat} 
            title="Astra Talk - Start New Chat"
          >
            <img src="/logo.png" alt="Astra Logo" />
          </div>

          <button 
            className="rail-btn"
            onClick={() => setIsRailExpanded(false)}
            title="Collapse Nav Rail"
            style={{ marginBottom: '8px' }}
          >
            <PanelLeftClose size={16} />
          </button>

          <div className="rail-nav-items">
            <button 
              className={`rail-btn ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
              title="AI Chat"
            >
              <MessageSquare size={18} />
            </button>

            <button 
              className={`rail-btn ${activeTab === 'image_gen' ? 'active' : ''}`}
              onClick={() => setActiveTab('image_gen')}
              title="SDXL Image Studio"
            >
              <Sparkles size={18} />
            </button>

            <button 
              className={`rail-btn ${activeTab === 'documents' ? 'active' : ''}`}
              onClick={() => { setActiveTab('documents'); fetchDocuments(activeConvId); }}
              title="Isolated Documents"
            >
              <Database size={18} />
            </button>

            <button 
              className={`rail-btn ${activeTab === 'memories' ? 'active' : ''}`}
              onClick={() => { setActiveTab('memories'); fetchMemories(); }}
              title="Long-Term Memory"
            >
              <Brain size={18} />
            </button>

            <button 
              className={`rail-btn ${activeTab === 'hardware' ? 'active' : ''}`}
              onClick={() => { setActiveTab('hardware'); fetchHardware(); }}
              title="System Diagnostics & SearXNG"
            >
              <HardDrive size={18} />
            </button>

            <button 
              className={`rail-btn ${isAstraActive ? 'active' : ''}`}
              onClick={() => {
                setIsAstraActive(prev => !prev);
                if (!isAstraActive) setIsAstraOnly(true);
              }}
              title="Astra Companion Easter Egg"
              style={{ color: '#22c55e' }}
            >
              <Flame size={18} />
            </button>
          </div>
        </div>

        <div className="rail-bottom">
          <button 
            className="rail-btn" 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button 
            className="rail-btn" 
            title="Settings & Hardware"
            onClick={() => { setActiveTab('hardware'); fetchHardware(); }}
          >
            <Settings size={17} />
          </button>
        </div>
      </aside>

      {/* Central Workspace Wrapper */}
      <div className="workspace-wrapper">
        {/* Top Floating Pill Navigation Dock */}
        <header className="top-nav-dock">
          {/* Left Controls (Restore Rail when collapsed) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!isRailExpanded && (
              <button 
                className="top-control-btn"
                onClick={() => setIsRailExpanded(true)}
                title="Expand Navigation Rail"
                style={{ color: '#22c55e' }}
              >
                <PanelLeftOpen size={16} />
              </button>
            )}
          </div>

          {/* Right Controls Dock */}
          <div className="top-controls-dock">
            <button 
              className="top-control-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={`Switch Theme (${theme})`}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            <button 
              className="top-control-btn"
              onClick={() => handleExportChat('markdown')}
              title="Export Chat to Markdown"
            >
              <Download size={15} />
            </button>

            <button 
              className="top-control-btn"
              onClick={() => {
                const next = !isSpeechBackEnabled;
                setIsSpeechBackEnabled(next);
                if (!next && window.speechSynthesis) {
                  window.speechSynthesis.cancel();
                  setCurrentlySpeakingMsgId(null);
                }
              }}
              style={{ color: isSpeechBackEnabled ? '#22c55e' : undefined }}
              title={isSpeechBackEnabled ? "Speech Back ON: Assistant will speak responses" : "Enable Speech Back (Astra Voice)"}
            >
              {isSpeechBackEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>

            <div 
              className="avatar-badge-btn" 
              onClick={() => {
                setIsAstraActive(true);
                setIsAstraOnly(true);
              }}
              title="Astra Companion Fullscreen"
            >
              <img src="/logo.png" alt="Astra" />
            </div>
          </div>
        </header>

        {/* Chat Workspace Stage */}
        {activeTab === 'chat' && (
          <div className="chat-workspace-stage">
            {/* Chat Window Card */}
            <div className="chat-window-card">
              {/* Chat Top Banner with Model Select & Modes */}
              <div className="chat-window-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="model-badge-pill" title="Local Model Engine">
                    <div className="active-pulse-dot" />
                    <select 
                      className="model-select-dropdown"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                    >
                      {models.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <button 
                    onClick={() => setIsRagOnly(prev => !prev)}
                    className={`pill-tool-btn ${isRagOnly ? 'active' : ''}`}
                    title={isRagOnly ? "Strict RAG Grounding Enabled" : "Enable RAG Only Mode"}
                  >
                    <FileText size={13} />
                    <span>{isRagOnly ? "RAG Grounded" : "RAG Off"}</span>
                  </button>

                  <button 
                    onClick={toggleIncognito}
                    className={`pill-tool-btn ${isIncognito ? 'active' : ''}`}
                    style={isIncognito ? { color: '#c084fc', borderColor: 'rgba(168, 85, 247, 0.4)', background: 'rgba(168, 85, 247, 0.15)' } : {}}
                    title={isIncognito ? "Incognito Active: Zero DB/Vector Writes" : "Enable Incognito Mode"}
                  >
                    <EyeOff size={13} />
                    <span>{isIncognito ? "Incognito ON" : "Incognito"}</span>
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    className="icon-tool-btn" 
                    onClick={() => setShowThinking(prev => !prev)}
                    title={showThinking ? "Hide Deep Thinking Process" : "Show Deep Thinking Process"}
                  >
                    <Lightbulb size={15} color={showThinking ? "#22c55e" : undefined} />
                  </button>
                  <button 
                    className="icon-tool-btn" 
                    onClick={startNewChat}
                    title="Clear & New Chat"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              {/* Chat Messages or Empty Hero Vortex */}
              <div className="chat-messages" ref={chatScrollRef} onScroll={handleChatScroll}>
                {messages.length === 0 ? (
                  <div className="empty-hero-stage">
                    <div className="hero-vortex-glow">
                      <div className="hero-vortex-ring-1" />
                      <div className="hero-vortex-ring-2" />
                      <div className="hero-vortex-core" />
                    </div>

                    <h2 className="hero-greeting-title">
                      {isIncognito ? "Private Incognito Studio" : "Good Day! How can Astra assist you?"}
                    </h2>
                    <p className="hero-greeting-sub">
                      {isIncognito 
                        ? "Zero database saves or vector trace. Everything stays strictly in temporary memory."
                        : "Type your query, upload files for isolated RAG, or let Astra perform live web research."}
                    </p>

                    <div className="hero-starters-grid">
                      <div 
                        className="starter-card-btn"
                        onClick={() => setInput("research current WWE champion")}
                      >
                        <div className="starter-card-title">
                          <Search size={14} color="#22c55e" />
                          <span>Live Web Research</span>
                        </div>
                        <div className="starter-card-desc">SearXNG multi-source search with real-time citations</div>
                      </div>

                      <div 
                        className="starter-card-btn"
                        onClick={() => setInput("create a image of futuristic neon cyberpunk city in rain")}
                      >
                        <div className="starter-card-title">
                          <Sparkles size={14} color="#22c55e" />
                          <span>Render Realistic Image</span>
                        </div>
                        <div className="starter-card-desc">SDXL / Realistic Vision v6 locally on RTX 3050</div>
                      </div>

                      <div 
                        className="starter-card-btn"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <div className="starter-card-title">
                          <Paperclip size={14} color="#22c55e" />
                          <span>Ground on Documents</span>
                        </div>
                        <div className="starter-card-desc">Upload PDF, DOCX or TXT with zero cross-chat leakage</div>
                      </div>

                      <div 
                        className="starter-card-btn"
                        onClick={() => {
                          setIsAstraActive(true);
                          setIsAstraOnly(true);
                        }}
                      >
                        <div className="starter-card-title">
                          <Flame size={14} color="#22c55e" />
                          <span>Launch Astra Companion</span>
                        </div>
                        <div className="starter-card-desc">Interactive living avatar with tactile pets and cute voice</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  messages.map((m, idx) => (
                    <div key={idx} className="message-row">
                      <div className={`avatar ${m.role === 'user' ? 'user' : 'ai'}`}>
                        {m.role === 'user' ? (
                          'U'
                        ) : (
                          <img 
                            src="/logo.png" 
                            alt="Astra Talk" 
                            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
                          />
                        )}
                      </div>
                      <div className="message-bubble">
                        {/* Inline User Message Editing */}
                        {m.role === 'user' && editingMsgId === (m.id || `msg_${idx}`) ? (
                          <div className="user-edit-box">
                            <textarea
                              className="user-edit-textarea"
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              rows={2}
                              autoFocus
                            />
                            <div className="user-edit-actions">
                              <button 
                                className="btn-edit-cancel"
                                onClick={() => { setEditingMsgId(null); setEditingText(''); }}
                              >
                                Cancel
                              </button>
                              <button 
                                className="btn-edit-save"
                                onClick={() => handleSaveEditedMessage(idx)}
                              >
                                Save & Submit
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {m.thinking_content && showThinking && (
                              <div className="thinking-box">
                                <strong>🧠 Thinking Process:</strong>
                                <p style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>{m.thinking_content}</p>
                              </div>
                            )}
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]} 
                              rehypePlugins={[rehypeHighlight]}
                              components={{
                                a({ href, children, ...props }) {
                                  const isBareLongUrl = typeof children === 'string' && (children.startsWith('http://') || children.startsWith('https://')) && children.length > 30;
                                  return (
                                    <a 
                                      href={href} 
                                      target="_blank" 
                                      rel="noreferrer" 
                                      className="chat-inline-link"
                                      {...props}
                                    >
                                      {isBareLongUrl ? '🌐 [Source Link]' : children}
                                    </a>
                                  );
                                },
                                pre({ children, ...props }) {
                                  return <pre className="code-pre-wrapper" {...props}>{children}</pre>;
                                },
                                code({ node, inline, className, children, ...props }) {
                                  const match = /language-(\w+)/.exec(className || '');
                                  const codeString = String(children).replace(/\n$/, '');
                                  if (!inline && (match || codeString.includes('\n'))) {
                                    const codeId = `code_${Math.random().toString(36).substring(2, 9)}`;
                                    return (
                                      <div className="code-block-container">
                                        <div className="code-block-header">
                                          <span className="code-lang-label">{match ? match[1] : 'code'}</span>
                                          <button 
                                            className="copy-code-btn"
                                            onClick={() => copyToClipboard(codeString, codeId)}
                                            title="Copy code"
                                          >
                                            {copiedId === codeId ? (
                                              <><Check size={12} color="#10a37f" /> <span>Copied!</span></>
                                            ) : (
                                              <><Copy size={12} /> <span>Copy code</span></>
                                            )}
                                          </button>
                                        </div>
                                        <code className={className} {...props}>
                                          {children}
                                        </code>
                                      </div>
                                    );
                                  }
                                  return <code className={className} {...props}>{children}</code>;
                                }
                              }}
                            >
                              {m.content}
                            </ReactMarkdown>
                          </>
                        )}

                        {/* Action Bar Beneath User Bubble (Edit & Resend) */}
                        {m.role === 'user' && editingMsgId !== (m.id || `msg_${idx}`) && (
                          <div className="user-msg-action-bar">
                            <button
                              className="msg-action-btn"
                              onClick={() => {
                                setEditingMsgId(m.id || `msg_${idx}`);
                                setEditingText(m.content);
                              }}
                              title="Edit message & regenerate response"
                            >
                              <Edit2 size={11} /> <span>Edit</span>
                            </button>
                            <button
                              className="msg-action-btn"
                              onClick={() => handleRegenerateFromUser(m.content, idx)}
                              title="Regenerate assistant response"
                            >
                              <RotateCw size={11} /> <span>Retry</span>
                            </button>
                          </div>
                        )}

                        {/* Action Bar Beneath Assistant Bubble */}
                        {m.role === 'assistant' && m.content && (
                          <div className="message-action-bar">
                            <button 
                              className="msg-action-btn"
                              onClick={() => copyToClipboard(m.content, `msg_${idx}`)}
                              title="Copy entire response"
                            >
                              {copiedId === `msg_${idx}` ? (
                                <><Check size={12} color="#10a37f" /> <span>Copied answer!</span></>
                              ) : (
                                <><Copy size={12} /> <span>Copy answer</span></>
                              )}
                            </button>

                            <button 
                              className="msg-action-btn"
                              onClick={() => handleSpeakText(m.content, m.id || `msg_${idx}`)}
                              title={currentlySpeakingMsgId === (m.id || `msg_${idx}`) ? "Stop speaking" : "Read aloud with Astra's voice"}
                            >
                              {currentlySpeakingMsgId === (m.id || `msg_${idx}`) ? (
                                <><VolumeX size={12} color="#ef4444" /> <span style={{ color: '#ef4444' }}>Stop</span></>
                              ) : (
                                <><Volume2 size={12} /> <span>Read aloud</span></>
                              )}
                            </button>

                            {/* Regenerate Assistant Response from previous user prompt */}
                            {idx > 0 && messages[idx - 1]?.role === 'user' && (
                              <button
                                className="msg-action-btn"
                                onClick={() => handleRegenerateFromUser(messages[idx - 1].content, idx - 1)}
                                title="Regenerate this response"
                              >
                                <RotateCw size={11} /> <span>Regenerate</span>
                              </button>
                            )}
                          </div>
                        )}

                        {/* Interactive Sources & Drawer Trigger */}
                        {m.sources && m.sources.length > 0 && (
                          <div className="sources-tags">
                            {m.sources.map((s, si) => (
                              <button 
                                key={si} 
                                className="source-tag clickable-source-tag"
                                onClick={() => setActiveSourceDrawer(s)}
                                title="Click to view reference passage"
                              >
                                {s.url ? (
                                  <>🌐 {s.filename} <Info size={11} style={{ marginLeft: 3 }} /></>
                                ) : (
                                  <>📄 {s.filename} ({Math.round(s.score * 100)}%) <Info size={11} style={{ marginLeft: 3 }} /></>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}

                {uploadProgress && (
                  <div className="message-row">
                    <div className="avatar ai">
                      <img 
                        src="/logo.png" 
                        alt="Astra Talk" 
                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
                      />
                    </div>
                    <div className="message-bubble" style={{ width: '100%' }}>
                      <div className="upload-progress-container">
                        <div className="upload-progress-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Loader2 size={16} className="upload-spinner" color="var(--accent)" />
                            <span>{uploadProgress.stage}...</span>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{uploadProgress.name}</span>
                        </div>
                        <div className="progress-bar-track">
                          <div className="progress-bar-fill" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {researchState && (
                  <div className="message-row">
                    <div className="avatar ai">
                      <img 
                        src="/logo.png" 
                        alt="Astra Talk" 
                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
                      />
                    </div>
                    <div className="message-bubble">
                      <div className="research-loading-box">
                        {researchState.type === 'youtube' ? (
                          <Video size={24} className="research-spinner" color="#ef4444" />
                        ) : researchState.type === 'url' ? (
                          <Globe size={24} className="research-spinner" />
                        ) : (
                          <Search size={24} className="research-spinner" />
                        )}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '2px' }}>
                            {researchState.type === 'youtube'
                              ? '📺 Extracting YouTube Transcript & Video...'
                              : researchState.type === 'url'
                              ? '🌐 Fetching & Reading Web Page...'
                              : '🔍 Researching Live Web & News...'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {researchState.type === 'youtube' ? (
                              <>Transcribing spoken audio & captions from <code style={{ color: '#ef4444' }}>{researchState.query.slice(0, 50)}</code></>
                            ) : researchState.type === 'url' ? (
                              <>Extracting clean text & markdown from <code style={{ color: 'var(--accent)' }}>{researchState.query.slice(0, 50)}</code></>
                            ) : (
                              <>Aggregating live sources via OpenSERP & SearXNG for <em>"{researchState.query}"</em></>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {isGeneratingInChatImage && (
                  <div className="message-row">
                    <div className="avatar ai">
                      <img 
                        src="/logo.png" 
                        alt="Astra Talk" 
                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
                      />
                    </div>
                    <div className="message-bubble">
                      <div className="image-gen-placeholder">
                        <div className="shimmer-box">
                          <Sparkles size={28} className="pulse-spinner" />
                          <span style={{ fontWeight: 500, fontSize: '14px' }}>Rendering Photorealistic Image...</span>
                          <span style={{ fontSize: '11px', opacity: 0.8 }}>Realistic Vision v6 (FP16) • Euler Ancestral (20 steps)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {isVisionAnalyzing && (
                  <div className="message-row">
                    <div className="avatar ai">
                      <img 
                        src="/logo.png" 
                        alt="Astra Talk" 
                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
                      />
                    </div>
                    <div className="message-bubble" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Loader2 size={16} className="pulse-spinner" />
                      <span>Analyzing image locally with {selectedModel}...</span>
                    </div>
                  </div>
                )}
                {/* Floating Scroll-to-Bottom Button */}
                {showScrollBottom && (
                  <button 
                    className="scroll-bottom-pill-btn"
                    onClick={() => scrollToBottom(true)}
                    title="Scroll to latest messages"
                  >
                    <ArrowDown size={14} />
                    <span>{hasUnread ? "New Response ↓" : "Scroll to Bottom"}</span>
                    {hasUnread && <span className="unread-badge-dot" />}
                  </button>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Bottom Input Glass Card */}
              <div className="input-dock-container">
                {/* Staged RAG / Vision Chips */}
                {selectedFile && (
                  <div className="pending-file-chip">
                    <Paperclip size={13} color="#22c55e" />
                    <span>RAG: <strong>{selectedFile.name}</strong></span>
                    <button 
                      onClick={() => setSelectedFile(null)} 
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {selectedImage && (
                  <div className="pending-file-chip" style={{ gap: '8px' }}>
                    {imagePreviewUrl && (
                      <img src={imagePreviewUrl} alt="Preview" style={{ width: '22px', height: '22px', borderRadius: '4px', objectFit: 'cover' }} />
                    )}
                    <span>Vision: <strong>{selectedImage.name}</strong></span>
                    <button 
                      onClick={() => { setSelectedImage(null); setImagePreviewUrl(null); }} 
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {/* Input Card Container */}
                <div className="input-glass-card">
                  {/* Hidden File Inputs */}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    accept=".pdf,.docx,.txt,.csv,.xlsx,.md" 
                    onChange={(e) => {
                      if (e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                        setSelectedImage(null);
                        setImagePreviewUrl(null);
                      }
                    }} 
                  />
                  <input 
                    type="file" 
                    ref={imageInputRef} 
                    style={{ display: 'none' }} 
                    accept="image/*" 
                    onChange={(e) => {
                      const f = e.target.files[0];
                      if (f) {
                        setSelectedImage(f);
                        setSelectedFile(null);
                        setImagePreviewUrl(URL.createObjectURL(f));
                      }
                    }} 
                  />

                  <textarea 
                    rows={1}
                    placeholder={
                      isIncognito
                        ? `Incognito mode active… No trace saved to disk.`
                        : isRagOnly
                          ? `Strict RAG Mode… Ask questions grounded in uploaded documents.`
                          : selectedFile 
                            ? `Ask questions about ${selectedFile.name}...` 
                            : selectedImage 
                              ? `Ask anything about this image (or press Send)...` 
                              : `Start your request, or ask Astra anything...`
                    }
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />

                  {/* Bottom Action Row with Pills and Emerald Send Button */}
                  <div className="input-bottom-actions-row">
                    <div className="input-left-buttons">
                      <button 
                        className="icon-tool-btn" 
                        title="Attach Document for Isolated RAG"
                        onClick={() => fileInputRef.current?.click()}
                        type="button"
                      >
                        <Paperclip size={15} />
                      </button>

                      <button 
                        className="icon-tool-btn" 
                        title="Attach Image for Vision Analysis"
                        onClick={() => imageInputRef.current?.click()}
                        type="button"
                      >
                        <ImageIcon size={15} />
                      </button>

                      <button 
                        className={`pill-tool-btn ${showThinking ? 'active' : ''}`}
                        onClick={() => setShowThinking(prev => !prev)}
                        type="button"
                        title="Toggle Reasoning Trace"
                      >
                        <Lightbulb size={13} />
                        <span>Reasoning</span>
                      </button>

                      <button 
                        className="pill-tool-btn"
                        onClick={() => {
                          if (!input.startsWith('research ')) {
                            setInput('research ' + input);
                          }
                        }}
                        type="button"
                        title="Prefix prompt with 'research' for Deep Live Meta-Search"
                      >
                        <Search size={13} />
                        <span>Deep Research</span>
                      </button>
                    </div>

                    <div className="input-right-buttons">
                      <button 
                        className={`voice-mic-btn ${isListening ? 'listening' : ''}`}
                        title={isListening ? "Listening... Click to stop" : "Voice Dictation (Web Speech API)"}
                        onClick={toggleSpeechRecognition}
                        type="button"
                      >
                        {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                      </button>

                      {isStreaming ? (
                        <button 
                          className="emerald-send-btn" 
                          onClick={handleStopGeneration}
                          style={{ background: '#ef4444', color: '#fff' }}
                          title="Stop Generating"
                        >
                          <StopCircle size={17} />
                        </button>
                      ) : (
                        <button 
                          className="emerald-send-btn" 
                          onClick={handleSend} 
                          disabled={(!input.trim() && !selectedFile && !selectedImage) || isVisionAnalyzing}
                          title="Send Message"
                        >
                          <Send size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {speechError && (
                  <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⚠️ {speechError}</span>
                    <button 
                      onClick={() => setSpeechError(null)} 
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                    >
                      ✕
                    </button>
                  </div>
                )}

                {isListening && (
                  <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'mic-pulse 1s infinite' }} />
                    <span>Listening... Speak into your microphone</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right History Chat Card */}
            <aside className={`history-sidebar-card ${isHistoryExpanded ? '' : 'collapsed'}`}>
              <div className="history-header-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    className="icon-tool-btn"
                    onClick={() => setIsHistoryExpanded(prev => !prev)}
                    title={isHistoryExpanded ? "Collapse History" : "Expand History"}
                    style={{ padding: '4px' }}
                  >
                    {isHistoryExpanded ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
                  </button>
                  {isHistoryExpanded && <h3 className="history-title">History Chat</h3>}
                </div>
                <button className="new-chat-pill-btn" onClick={startNewChat} title="Start New Chat">
                  <Plus size={13} />
                  {isHistoryExpanded && <span>New Chat</span>}
                </button>
              </div>

              <input
                type="text"
                className="history-search-input"
                placeholder="Search conversations..."
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
              />

              <div className="history-groups-list">
                {Object.entries(groups).map(([groupTitle, convs]) => (
                  convs.length > 0 && (
                    <div key={groupTitle}>
                      <div className="history-group-label">{groupTitle}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {convs.map(c => (
                          <div 
                            key={c.id} 
                            className={`history-item-pill ${c.id === activeConvId ? 'active' : ''}`}
                            onClick={() => { setActiveConvId(c.id); setActiveTab('chat'); }}
                          >
                            <MessageSquare size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
                            <span className="history-item-title" title={c.title}>
                              {c.title}
                            </span>
                            <button 
                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '2px' }}
                              onClick={(e) => deleteConversation(e, c.id)}
                              title="Delete Conversation"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ))}

                {conversations.length === 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                    No conversations yet.
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}

        {activeTab === 'image_gen' && (
          <div className="view-panel">
            <h2>Local SDXL Image Generator (/home/lone-warrior/sdxl)</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
              High-resolution photorealistic image generation powered by Stable Diffusion XL Base 1.0, optimized for 4GB RTX 3050 VRAM using sequential CPU offloading and DPM++ 2M SDE Karras scheduler.
            </p>

            <div style={{ marginTop: '20px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
              <label style={{ fontSize: '14px', fontWeight: 500, display: 'block', marginBottom: '8px' }}>
                Prompt:
              </label>
              <textarea 
                rows={3}
                placeholder="e.g. Portrait of an astronaut standing on Mars, golden hour lighting, cinematic..."
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--text-primary)', outline: 'none', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button 
                  onClick={handleGenerateSDXL}
                  disabled={!imagePrompt.trim() || isGeneratingImage}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    background: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    fontWeight: 500,
                    cursor: 'pointer',
                    opacity: isGeneratingImage ? 0.6 : 1
                  }}
                >
                  <Sparkles size={16} />
                  {isGeneratingImage ? 'Generating on RTX 3050...' : 'Generate Image (SDXL)'}
                </button>
              </div>
            </div>

            <h3 style={{ marginTop: '30px', fontSize: '16px' }}>Generated Images Gallery</h3>
            <div className="card-grid" style={{ marginTop: '14px' }}>
              {generatedGallery.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No images generated yet in this session. Enter a prompt above to create one.</p>
              ) : (
                generatedGallery.map((g, idx) => (
                  <div key={idx} className="panel-card" style={{ padding: '10px' }}>
                    <img 
                      src={g.image} 
                      alt={g.prompt} 
                      style={{ width: '100%', borderRadius: '8px', objectFit: 'cover', maxHeight: '340px' }} 
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                        {g.prompt}
                      </span>
                      <a 
                        href={g.image} 
                        download={g.filename || "sdxl_image.png"} 
                        style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}
                        title="Download image"
                      >
                        <Download size={15} />
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="view-panel">
            <h2>Attached Documents for this Conversation</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
              Files listed here are only accessible within the current conversation ID (<code>{activeConvId || 'None selected'}</code>) and cannot be leaked to other chats.
            </p>
            <div className="card-grid">
              {documents.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', marginTop: '20px' }}>No documents attached to this conversation yet. Use "Attach File" above.</p>
              ) : (
                documents.map(d => (
                  <div key={d.id} className="panel-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{d.filename}</strong>
                      <span style={{ fontSize: '11px', color: 'var(--accent)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>
                        {d.chunks || d.total_chunks} chunks
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Conversation ID: {d.conversation_id || activeConvId}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'memories' && (
          <div className="view-panel">
            <h2>Persistent Semantic Memory</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
              User preferences and profile facts stored in Qdrant and recalled across conversations.
            </p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <input 
                type="text"
                placeholder="Add a new permanent user memory..."
                value={newMemory}
                onChange={(e) => setNewMemory(e.target.value)}
                style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMemory()}
              />
              <button 
                onClick={handleAddMemory}
                style={{ padding: '10px 16px', borderRadius: '8px', background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 500 }}
              >
                Add Memory
              </button>
            </div>
            <div className="card-grid">
              {memories.map(m => (
                <div key={m.id} className="panel-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', color: 'var(--accent)', textTransform: 'uppercase' }}>{m.category}</span>
                    <button 
                      onClick={async () => {
                        await fetch(`/api/memories/${m.id}`, { method: 'DELETE' });
                        fetchMemories();
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <p style={{ fontSize: '14px', marginTop: '4px' }}>{m.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'hardware' && (
          <div className="view-panel">
            <h2>Local Hardware & Service Architecture</h2>
            <div className="card-grid" style={{ marginTop: '20px' }}>
              <div className="panel-card">
                <strong>GPU</strong>
                <p style={{ color: 'var(--accent)' }}>{hardware?.gpu || 'NVIDIA RTX 3050 Mobile (4GB VRAM)'}</p>
              </div>
              <div className="panel-card">
                <strong>Local Image Generation</strong>
                <p style={{ color: 'var(--accent)' }}>SDXL Base 1.0 (/home/lone-warrior/sdxl)</p>
              </div>
              <div className="panel-card">
                <strong>SearXNG Keyword</strong>
                <p style={{ color: 'var(--accent)' }}>Triggered solely by 'research &lt;query&gt;'</p>
              </div>
              <div className="panel-card">
                <strong>Document Isolation</strong>
                <p style={{ color: 'var(--accent)' }}>Strict Conversation-Level Filtering</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Source Reference Drawer Modal */}
      {activeSourceDrawer && (
        <div className="source-drawer-overlay" onClick={() => setActiveSourceDrawer(null)}>
          <div className="source-drawer-card" onClick={(e) => e.stopPropagation()}>
            <div className="source-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={18} color="var(--accent)" />
                <h3 style={{ margin: 0, fontSize: '15px' }}>Reference Source Details</h3>
              </div>
              <button 
                className="close-drawer-btn" 
                onClick={() => setActiveSourceDrawer(null)}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="source-drawer-body">
              <div style={{ marginBottom: '14px' }}>
                <strong style={{ fontSize: '12px', color: 'var(--text-muted)' }}>SOURCE IDENTIFIER</strong>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {activeSourceDrawer.filename}
                </div>
              </div>

              {activeSourceDrawer.score !== undefined && (
                <div style={{ marginBottom: '14px' }}>
                  <strong style={{ fontSize: '12px', color: 'var(--text-muted)' }}>RELEVANCE CONFIDENCE</strong>
                  <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 500, marginTop: '2px' }}>
                    {Math.round(activeSourceDrawer.score * 100)}% Match
                  </div>
                </div>
              )}

              {activeSourceDrawer.url && (
                <div style={{ marginBottom: '16px' }}>
                  <strong style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ORIGIN URL</strong>
                  <div style={{ marginTop: '4px' }}>
                    <a 
                      href={activeSourceDrawer.url} 
                      target="_blank" 
                      rel="noreferrer" 
                      style={{ color: '#38bdf8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', wordBreak: 'break-all' }}
                    >
                      {activeSourceDrawer.url} <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
              )}

              <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                💡 <em>This source passage was retrieved from this conversation's vector index or live URL parser and reranked using the local BAAI cross-encoder to ground the assistant's answer.</em>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Astra Interactive Easter Egg Companion */}
      <AstraCompanion 
        isVisible={isAstraActive}
        onClose={() => {
          setIsAstraActive(false);
          setIsAstraOnly(false);
        }}
        isStreaming={isStreaming}
        isThinking={isAstraThinking}
        inputText={input}
        isAstraOnly={isAstraOnly}
        onExitAstraOnly={() => setIsAstraOnly(false)}
        latestReply={latestAssistantReply}
        onSendMessage={sendAstraOnlyMessage}
      />
    </div>
  );
}
