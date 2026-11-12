import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { 
  MessageSquare, Plus, Trash2, Database, Brain, HardDrive, 
  Settings, Send, StopCircle, RefreshCw, Paperclip, ChevronRight, Moon, Sun, Globe, Search, Image as ImageIcon, Sparkles, Download, X, Loader2, EyeOff, ShieldCheck, FileText, Menu
} from 'lucide-react';
import AstraCompanion from './AstraCompanion';

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('gemma3:latest');
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
  const [isAstraActive, setIsAstraActive] = useState(false);
  const [isAstraThinking, setIsAstraThinking] = useState(false);
  const [isAstraOnly, setIsAstraOnly] = useState(false);
  const [latestAssistantReply, setLatestAssistantReply] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Staged File/Image Upload State in Chat
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);

  // SD Image Generation State
  const [imagePrompt, setImagePrompt] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedGallery, setGeneratedGallery] = useState([]);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

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

    const userMsg = { id: Date.now().toString(), role: 'user', content: userText };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    setIsAstraThinking(true); // Activate thinking animation immediately upon submit!

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', sources: null, thinking_content: null }]);

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
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
              }
              if (data.sources) {
                sources = data.sources;
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, sources } : m));
              }
            } catch (err) {}
          }
        }
      }

      setLatestAssistantReply(assistantText.replace(/<think>[\s\S]*?<\/think>/g, '').trim());
      fetchConversations();

    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsStreaming(false);
      setIsGeneratingInChatImage(false);
      setIsAstraThinking(false);
    }
  };

  // Dedicated sender for AstraOnly full-screen conversation
  const sendAstraOnlyMessage = async (customText) => {
    if (!customText.trim() || isStreaming) return;
    const userText = customText.trim();
    setIsStreaming(true);
    setIsAstraThinking(true); // Show thinking animation right away as model computes!

    // Pick friendly chatting model if available (gemma3:latest or hello:latest)
    const chatModel = models.some(m => m.name === 'gemma3:latest') 
      ? 'gemma3:latest' 
      : models.some(m => m.name === 'hello:latest') 
        ? 'hello:latest' 
        : selectedModel;

    try {
      const astraOnlyPrompt = (
        `[ASTRA COMPANION PERSONA]\n` +
        `You are Astra, a charming, warm, playful, and genuinely caring AI buddy with a spark of wit and real personality.\n` +
        `- Personality: Speak like a real close friend hanging out—expressive, engaging, humorous, and affectionate. Never sound like a generic corporate AI assistant (no "How may I assist you today?", "As an AI...", or canned customer-service phrasing).\n` +
        `- Tone: Casual, upbeat, candid, and concise (1 to 3 vibrant sentences maximum). Perfect for being spoken out loud!\n` +
        `- Conversational flair: React to what the user actually said with genuine curiosity or humor. If they greet you, give an authentic, cheerful greeting.\n` +
        `- Never recite calendar timestamps or robotic disclosures.\n` +
        `Respond directly to your friend: "${userText}"`
      );

      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: isIncognito ? null : activeConvId,
          content: astraOnlyPrompt,
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

  return (
    <div className="app-container">
      {/* Mobile Backdrop */}
      {isMobileSidebarOpen && (
        <div 
          className="mobile-backdrop" 
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
        {/* App Branding */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img 
              src="/logo.png" 
              alt="Astra Talk Logo" 
              style={{ width: '38px', height: '38px', borderRadius: '10px', objectFit: 'cover', border: '1.5px solid var(--accent)', boxShadow: '0 0 10px rgba(16, 163, 127, 0.3)' }} 
            />
            <div>
              <h1 style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '0.3px', background: 'linear-gradient(90deg, #10a37f 0%, #38bdf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
                Astra Talk
              </h1>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Local AI Intelligence</span>
            </div>
          </div>
          <button 
            className="mobile-close-btn"
            onClick={() => setIsMobileSidebarOpen(false)}
            aria-label="Close Sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <button className="new-chat-btn" onClick={() => { startNewChat(); setIsMobileSidebarOpen(false); }}>
          <Plus size={16} /> New Chat
        </button>

        <nav className="nav-links">
          <div 
            className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => { setActiveTab('chat'); setIsMobileSidebarOpen(false); }}
          >
            <MessageSquare size={16} /> Chat
          </div>
          <div 
            className={`nav-item ${activeTab === 'image_gen' ? 'active' : ''}`}
            onClick={() => { setActiveTab('image_gen'); setIsMobileSidebarOpen(false); }}
          >
            <Sparkles size={16} /> SDXL Image Generator
          </div>
          <div 
            className={`nav-item ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => { setActiveTab('documents'); fetchDocuments(activeConvId); setIsMobileSidebarOpen(false); }}
          >
            <Database size={16} /> Conversation Files ({documents.length})
          </div>
          <div 
            className={`nav-item ${activeTab === 'memories' ? 'active' : ''}`}
            onClick={() => { setActiveTab('memories'); fetchMemories(); setIsMobileSidebarOpen(false); }}
          >
            <Brain size={16} /> Persistent Memory
          </div>
          <div 
            className={`nav-item ${activeTab === 'hardware' ? 'active' : ''}`}
            onClick={() => { setActiveTab('hardware'); fetchHardware(); setIsMobileSidebarOpen(false); }}
          >
            <HardDrive size={16} /> System & SearXNG
          </div>
        </nav>

        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '10px' }}>
          Conversations
        </div>

        <div className="conv-list">
          {conversations.map(c => (
            <div 
              key={c.id} 
              className={`conv-item ${c.id === activeConvId ? 'active' : ''}`}
              onClick={() => { setActiveConvId(c.id); setActiveTab('chat'); setIsMobileSidebarOpen(false); }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {c.title}
              </span>
              <button 
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={(e) => deleteConversation(e, c.id)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>RTX 3050 (4GB VRAM)</span>
          <button 
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="main-area">
        {/* Top Header */}
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              className="mobile-menu-btn"
              onClick={() => setIsMobileSidebarOpen(true)}
              aria-label="Open Sidebar"
            >
              <Menu size={20} />
            </button>
            <select 
              className="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <span className="local-status-badge" style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 500 }}>
              ● Local Ollama Active
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              onClick={() => setIsRagOnly(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: isRagOnly ? '1px solid #10a37f' : '1px solid var(--border)',
                background: isRagOnly ? 'rgba(16, 163, 127, 0.2)' : 'var(--bg-tertiary)',
                color: isRagOnly ? '#34d399' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
              title={isRagOnly ? "RAG-Only Mode Active: Answers strictly grounded in uploaded documents only" : "Enable RAG-Only Mode (Zero Hallucination)"}
            >
              <FileText size={14} />
              <span>{isRagOnly ? "RAG Only ON" : "RAG Only"}</span>
            </button>

            <button 
              onClick={toggleIncognito}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: isIncognito ? '1px solid #a855f7' : '1px solid var(--border)',
                background: isIncognito ? 'rgba(168, 85, 247, 0.15)' : 'var(--bg-tertiary)',
                color: isIncognito ? '#c084fc' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.2s'
              }}
              title={isIncognito ? "Incognito active: Zero history saved to DB" : "Enable Incognito Mode"}
            >
              <EyeOff size={14} />
              <span>{isIncognito ? "Incognito ON" : "Incognito"}</span>
            </button>

            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                padding: '5px 10px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)'
              }}
              title="Memory Commands: 'remember <fact>', 'list remember', or 'forget <fact>'"
            >
              <Brain size={13} color="#3b82f6" />
              <span><code>remember</code> / <code>list remember</code> / <code>forget</code></span>
            </div>

            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                padding: '5px 10px',
                borderRadius: '6px',
                background: 'rgba(16, 163, 127, 0.1)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)'
              }}
              title="Type 'research <query>' or 'research images of <query>' to execute SearXNG search"
            >
              <Search size={13} color="var(--accent)" />
              <span>Keyword <code>research</code> triggers SearXNG</span>
            </div>

            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', background: 'var(--bg-tertiary)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }} title="Analyze image using local Gemma 3 or Qwen2.5-VL">
              <ImageIcon size={14} /> Analyze Image
              <input type="file" onChange={handleImageAnalysis} style={{ display: 'none' }} accept="image/*" />
            </label>

            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', background: 'var(--bg-tertiary)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }} title="Attach document isolated to this conversation">
              <Paperclip size={14} /> Attach File
              <input type="file" onChange={handleFileUpload} style={{ display: 'none' }} accept=".pdf,.docx,.txt,.csv,.xlsx,.md" />
            </label>
          </div>
        </header>

        {/* View Switching */}
        {activeTab === 'chat' && (
          <>
            <div className="chat-messages">
              {isRagOnly && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: 'rgba(16, 163, 127, 0.12)',
                  border: '1px solid rgba(16, 163, 127, 0.35)',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  margin: '0 auto 16px',
                  maxWidth: '720px',
                  color: '#a7f3d0',
                  fontSize: '13px'
                }}>
                  <FileText size={18} color="#34d399" />
                  <div>
                    <strong>Strict RAG-Only Mode Active:</strong> Answers will be 100% grounded in your uploaded documents for this conversation. If the answer cannot be found in the files, the model will not speculate or hallucinate.
                  </div>
                </div>
              )}
              {isIncognito && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: 'rgba(168, 85, 247, 0.1)',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  margin: '0 auto 16px',
                  maxWidth: '720px',
                  color: '#e9d5ff',
                  fontSize: '13px'
                }}>
                  <EyeOff size={18} color="#c084fc" />
                  <div>
                    <strong>Incognito Mode Active:</strong> Messages and generated images in this session are held in memory only and will never be saved to PostgreSQL, Qdrant memories, or conversation history.
                  </div>
                </div>
              )}
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: '15vh', color: 'var(--text-muted)' }}>
                  {isIncognito ? (
                    <>
                      <EyeOff size={48} style={{ color: '#c084fc', marginBottom: '16px' }} />
                      <h2 style={{ color: '#e9d5ff' }}>Private Incognito Session</h2>
                      <p style={{ marginTop: '8px', maxWidth: '480px', margin: '8px auto 0' }}>
                        Chat completely off-the-record. Nothing is saved to database or vector memory.
                      </p>
                    </>
                  ) : (
                    <>
                      <img 
                        src="/logo.png" 
                        alt="Astra Talk" 
                        style={{ width: '84px', height: '84px', borderRadius: '22px', marginBottom: '16px', border: '2px solid var(--accent)', boxShadow: '0 0 24px rgba(16, 163, 127, 0.35)' }} 
                      />
                      <h2 style={{ fontSize: '24px', fontWeight: 700, background: 'linear-gradient(90deg, #10a37f 0%, #38bdf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Astra Talk
                      </h2>
                      <p style={{ marginTop: '8px', maxWidth: '480px', margin: '8px auto 0', color: 'var(--text-secondary)' }}>
                        Your private, local AI companion. Type normally for local LLM answers, <code>research &lt;topic&gt;</code> for live web search, or <code>create a image...</code> for instant visuals.
                      </p>
                    </>
                  )}
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
                      {m.thinking_content && showThinking && (
                        <div className="thinking-box">
                          <strong>🧠 Thinking Process:</strong>
                          <p style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>{m.thinking_content}</p>
                        </div>
                      )}
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                        {m.content}
                      </ReactMarkdown>

                      {m.sources && m.sources.length > 0 && (
                        <div className="sources-tags">
                          {m.sources.map((s, si) => (
                            <span key={si} className="source-tag">
                              {s.url ? (
                                <a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                                  🌐 {s.filename}
                                </a>
                              ) : (
                                <>📄 {s.filename} (relevance: {Math.round(s.score * 100)}%)</>
                              )}
                            </span>
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
              <div ref={messagesEndRef} />
            </div>

            {/* Input Dock */}
            <div className="input-dock">
              {/* Staged RAG Document Pill */}
              {selectedFile && (
                <div className="pending-file-chip">
                  <Paperclip size={14} color="var(--accent)" />
                  <span>RAG: <strong>{selectedFile.name}</strong></span>
                  <button 
                    onClick={() => setSelectedFile(null)} 
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', marginLeft: '4px' }}
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              {/* Staged Vision Image Pill with Thumbnail */}
              {selectedImage && (
                <div className="pending-file-chip" style={{ gap: '8px' }}>
                  {imagePreviewUrl && (
                    <img src={imagePreviewUrl} alt="Preview" style={{ width: '22px', height: '22px', borderRadius: '4px', objectFit: 'cover' }} />
                  )}
                  <span>Vision: <strong>{selectedImage.name}</strong></span>
                  <button 
                    onClick={() => { setSelectedImage(null); setImagePreviewUrl(null); }} 
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', marginLeft: '4px' }}
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              <div className="input-box">
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

                {/* Direct in-chat Action Buttons */}
                <button 
                  className="dock-action-btn" 
                  title="Upload Document for Conversation RAG"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <Paperclip size={18} />
                </button>

                <button 
                  className="dock-action-btn" 
                  title="Upload Image for Local Vision Analysis"
                  onClick={() => imageInputRef.current?.click()}
                  type="button"
                >
                  <ImageIcon size={18} />
                </button>

                <textarea 
                  rows={1}
                  placeholder={
                    isIncognito
                      ? `Incognito mode… No conversation or memory will be saved.`
                      : isRagOnly
                        ? `RAG Only Mode… Questions will be answered strictly from uploaded documents.`
                        : selectedFile 
                          ? `Ask questions about ${selectedFile.name}...` 
                          : selectedImage 
                            ? `Ask anything about this image (or press Send for analysis)...` 
                            : `Message ${selectedModel}… ("remember <fact>", "research <topic>", or "create a image...")`
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
                <button 
                  className="send-btn" 
                  onClick={handleSend} 
                  disabled={(!input.trim() && !selectedFile && !selectedImage) || isStreaming || isVisionAnalyzing}
                >
                  <Send size={15} />
                </button>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Upload files for RAG or images for vision right here. Images generated safely via Realistic Vision v6 (~6s).
              </span>
            </div>
          </>
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
      </main>

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
