import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { 
  MessageSquare, Plus, Trash2, Database, Brain, HardDrive, 
  Settings, Send, StopCircle, RefreshCw, Paperclip, ChevronRight, Moon, Sun, Globe, Search, Image as ImageIcon, Sparkles, Download, X, Loader2, EyeOff, ShieldCheck, FileText, Menu, Cpu, CheckCircle2
} from 'lucide-react';
import AstraCompanion from './AstraCompanion';
import { SNAPDRAGON_MODELS } from './mobileModelsConfig';
import { apiUrl } from './apiConfig';

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('Llama-3.2-3B-Instruct-Q4_K_M.gguf');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'mobile_models' | 'documents' | 'memories' | 'hardware' | 'image_gen'
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
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isAstraActive, setIsAstraActive] = useState(false);
  const [isAstraThinking, setIsAstraThinking] = useState(false);
  const [isAstraOnly, setIsAstraOnly] = useState(false);
  const [latestAssistantReply, setLatestAssistantReply] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Snapdragon 8 Gen 2 Model Manager State
  const [downloadingModelId, setDownloadingModelId] = useState(null);
  const [modelProgress, setModelProgress] = useState({});
  const [offlineStatus, setOfflineStatus] = useState({});

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
    checkOfflineModels();
  }, []);

  const checkOfflineModels = async () => {
    try {
      if (window.Capacitor && window.Capacitor.isPluginAvailable('OfflineEngine')) {
        const { OfflineEngine } = window.Capacitor.Plugins;
        const res = await OfflineEngine.getModelStatus();
        setOfflineStatus(res);
      }
    } catch (e) {
      console.warn("OfflineEngine check:", e);
    }
  };

  const downloadOfflineModel = async (model) => {
    if (!model) return;

    if (!window.Capacitor || !window.Capacitor.isPluginAvailable('OfflineEngine')) {
      const a = document.createElement('a');
      a.href = model.downloadUrl;
      a.download = model.filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    try {
      setDownloadingModelId(model.filename);
      const { OfflineEngine } = window.Capacitor.Plugins;
      await OfflineEngine.startDownload({
        url: model.downloadUrl,
        filename: model.filename
      });

      const interval = setInterval(async () => {
        try {
          const prog = await OfflineEngine.getDownloadProgress({ filename: model.filename });
          const downloadedMb = (prog.bytesDownloaded / (1024 * 1024)).toFixed(1);
          const totalMb = prog.bytesTotal > 0 ? (prog.bytesTotal / (1024 * 1024)).toFixed(1) : null;
          const percent = prog.bytesTotal > 0 ? Math.round((prog.bytesDownloaded / prog.bytesTotal) * 100) : 0;

          setModelProgress(prev => ({ 
            ...prev, 
            [model.filename]: {
              ...prog,
              downloadedMb,
              totalMb,
              percent
            } 
          }));

          if (prog.status === 'completed' || prog.status === 'failed') {
            clearInterval(interval);
            setDownloadingModelId(null);
            checkOfflineModels();
            fetchModels();
          }
        } catch (err) {
          clearInterval(interval);
          setDownloadingModelId(null);
        }
      }, 1000);
    } catch (err) {
      alert(`Download trigger failed: ${err.message}`);
      setDownloadingModelId(null);
    }
  };

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
      const res = await fetch(apiUrl('/api/conversations'));
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
    // Mobile models configured for Snapdragon 8 Gen 2
    const mobileList = SNAPDRAGON_MODELS.map(m => m.filename);
    try {
      const res = await fetch(apiUrl('/api/models'));
      const data = await res.json();
      const serverModels = (data.models || []).map(m => m.name);
      // Combine mobile models with server models if reachable
      const combined = Array.from(new Set([...mobileList, ...serverModels]));
      setModels(combined);
      if (combined.length > 0 && !combined.includes(selectedModel)) {
        setSelectedModel(combined[0]);
      }
    } catch (e) {
      setModels(mobileList);
      if (!selectedModel || !mobileList.includes(selectedModel)) {
        setSelectedModel(mobileList[0]);
      }
    }
  };

  const fetchHardware = async () => {
    try {
      const res = await fetch(apiUrl('/api/hardware'));
      const data = await res.json();
      setHardware(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchConversationMessages = async (id) => {
    try {
      const res = await fetch(apiUrl(`/api/conversations/${id}`));
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
      const url = convId ? apiUrl(`/api/documents?conversation_id=${convId}`) : apiUrl('/api/documents');
      const res = await fetch(url);
      const data = await res.json();
      setDocuments(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMemories = async () => {
    try {
      const res = await fetch(apiUrl('/api/memories'));
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
      await fetch(apiUrl(`/api/conversations/${id}`), { method: 'DELETE' });
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

    if (selectedImage) {
      const imgFile = selectedImage;
      setSelectedImage(null);
      setImagePreviewUrl(null);
      await triggerImageAnalysisWithFile(imgFile, input.trim());
      return;
    }

    if (selectedFile) {
      const fileToUpload = selectedFile;
      setSelectedFile(null);
      await uploadDocumentAndChat(fileToUpload, input.trim());
      return;
    }

    const userText = input.trim();
    setInput('');

    const normalizedCmd = userText.toLowerCase().replace(/\\/g, '/');
    if (normalizedCmd === '/astra' || normalizedCmd === '/astro') {
      setIsAstraActive(true);
      const userMsg = { id: Date.now().toString(), role: 'user', content: userText };
      const easterEggReply = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `✨ **Astra Activated on Snapdragon 8 Gen 2!**\n- 🖐️ **Tap head**: Boop Astra\n- 💆 **Rub head**: Give gentle head rubs\n- 🌟 **Type \`/astraonly\`**: Fullscreen mascot companion mode!`
      };
      setMessages(prev => [...prev, userMsg, easterEggReply]);
      return;
    }

    if (normalizedCmd === '/astraonly') {
      setIsAstraActive(true);
      setIsAstraOnly(true);
      return;
    }

    const isImageGen = /\b(create|generate|make|render|draw|paint)\s+(an?\s+)?image\b|\bimage\s+of\b/i.test(userText);
    if (isImageGen) {
      setIsGeneratingInChatImage(true);
    }

    const userMsg = { id: Date.now().toString(), role: 'user', content: userText };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    setIsAstraThinking(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', sources: null, thinking_content: null }]);

    try {
      const res = await fetch(apiUrl('/api/chat/stream'), {
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

                if (assistantText.includes('![') && (assistantText.includes('/storage/images') || assistantText.includes('](http') || assistantText.includes('](data:image'))) {
                  setIsGeneratingInChatImage(false);
                }
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantText } : m));
              }
              if (data.sources) {
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, sources: data.sources } : m));
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

  const sendAstraOnlyMessage = async (customText) => {
    if (!customText.trim() || isStreaming) return;
    const userText = customText.trim();
    setIsStreaming(true);
    setIsAstraThinking(true);

    try {
      const astraOnlyPrompt = (
        `[ASTRA COMPANION PERSONA]\n` +
        `You are Astra, a charming, warm, playful, and genuinely caring AI buddy.\n` +
        `- Tone: Casual, upbeat, candid, concise (1-3 sentences maximum).\n` +
        `Respond directly to your friend: "${userText}"`
      );

      const res = await fetch(apiUrl('/api/chat/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: isIncognito ? null : activeConvId,
          content: astraOnlyPrompt,
          model: selectedModel,
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
        for (const line of chunk.split('\n')) {
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
      setMessages(prev => [
        ...prev, 
        { id: Date.now().toString(), role: 'user', content: userText },
        { id: (Date.now() + 1).toString(), role: 'assistant', content: assistantText }
      ]);
    } catch (err) {
      setLatestAssistantReply(`Error: ${err.message}`);
    } finally {
      setIsStreaming(false);
      setIsAstraThinking(false);
    }
  };

  const uploadDocumentAndChat = async (file, promptText) => {
    // standard upload logic
  };

  const triggerImageAnalysisWithFile = async (file, promptText) => {
    // vision logic
  };

  const handleGenerateSDXL = async () => {
    if (!imagePrompt.trim() || isGeneratingImage) return;
    setIsGeneratingImage(true);
    try {
      const res = await fetch(apiUrl('/api/images/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt.trim(), conversation_id: activeConvId })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setGeneratedGallery(prev => [data, ...prev]);
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
      await fetch(apiUrl('/api/memories'), {
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
      {isMobileSidebarOpen && (
        <div className="mobile-backdrop" onClick={() => setIsMobileSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/logo.png" alt="Astra Talk Logo" style={{ width: '38px', height: '38px', borderRadius: '10px', objectFit: 'cover' }} />
            <div>
              <h1 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Astra Talk</h1>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Snapdragon 8 Gen 2</span>
            </div>
          </div>
          <button className="mobile-close-btn" onClick={() => setIsMobileSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <button className="new-chat-btn" onClick={() => { startNewChat(); setIsMobileSidebarOpen(false); }}>
          <Plus size={16} /> New Chat
        </button>

        <nav className="nav-links">
          <div className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => { setActiveTab('chat'); setIsMobileSidebarOpen(false); }}>
            <MessageSquare size={16} /> Chat
          </div>
          <div className={`nav-item ${activeTab === 'mobile_models' ? 'active' : ''}`} onClick={() => { setActiveTab('mobile_models'); checkOfflineModels(); setIsMobileSidebarOpen(false); }}>
            <Cpu size={16} /> Snapdragon Models
          </div>
          <div className={`nav-item ${activeTab === 'image_gen' ? 'active' : ''}`} onClick={() => { setActiveTab('image_gen'); setIsMobileSidebarOpen(false); }}>
            <Sparkles size={16} /> Image Generator
          </div>
          <div className={`nav-item ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => { setActiveTab('documents'); fetchDocuments(activeConvId); setIsMobileSidebarOpen(false); }}>
            <Database size={16} /> Files ({documents.length})
          </div>
        </nav>

        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '10px' }}>
          Conversations
        </div>

        <div className="conv-list">
          {conversations.map(c => (
            <div key={c.id} className={`conv-item ${c.id === activeConvId ? 'active' : ''}`} onClick={() => { setActiveConvId(c.id); setActiveTab('chat'); setIsMobileSidebarOpen(false); }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.title}</span>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={(e) => deleteConversation(e, c.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Snapdragon 8 Gen 2</span>
          <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="main-area">
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="mobile-menu-btn" onClick={() => setIsMobileSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <select className="model-select" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
              {models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <button 
              onClick={() => { setActiveTab('mobile_models'); checkOfflineModels(); }}
              style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid #38bdf8', color: '#38bdf8', padding: '5px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '11.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Download size={13} />
              <span>Models</span>
            </button>
          </div>
        </header>

        {activeTab === 'chat' && (
          <>
            <div className="chat-messages">
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: '15vh', color: 'var(--text-muted)' }}>
                  <img src="/logo.png" alt="Astra Talk" style={{ width: '84px', height: '84px', borderRadius: '22px', marginBottom: '16px' }} />
                  <h2 style={{ fontSize: '24px', fontWeight: 700 }}>Astra Talk Mobile</h2>
                  <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>
                    Running locally with Snapdragon 8 Gen 2 optimization.
                  </p>
                </div>
              ) : (
                messages.map(m => (
                  <div key={m.id} className={`message-row ${m.role}`}>
                    <div className={`avatar ${m.role}`}>{m.role === 'user' ? 'U' : 'A'}</div>
                    <div className="message-bubble">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="input-dock">
              <div className="input-box">
                <textarea 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask Astra anything..."
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <button className="send-btn" onClick={handleSend} disabled={isStreaming}>
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'mobile_models' && (
          <div className="view-panel" style={{ padding: '20px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Cpu size={26} color="#38bdf8" />
              <div>
                <h2>Snapdragon 8 Gen 2 AI Models</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                  Offline on-device inference models configured for selectable execution.
                </p>
              </div>
            </div>

            <div className="card-grid" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {SNAPDRAGON_MODELS.map(m => {
                const prog = modelProgress[m.filename];
                const isReady = offlineStatus[m.filename.includes('Llama') ? 'llamaReady' : m.filename.includes('qwen') ? 'qwenReady' : 'imageReady'];
                const isDownloading = downloadingModelId === m.filename;

                return (
                  <div key={m.id} className="panel-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '15px' }}>{m.name}</strong>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', fontWeight: 600 }}>{m.size}</span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>{m.description}</p>
                    
                    {isDownloading && prog && (
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          <span>Downloading: {prog.downloadedMb} MB {prog.totalMb ? `/ ${prog.totalMb} MB` : ''}</span>
                          <strong style={{ color: '#38bdf8' }}>{prog.percent}%</strong>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${prog.percent}%`, height: '100%', background: 'linear-gradient(90deg, #0284c7, #38bdf8)', transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: 'auto', paddingTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', color: isReady ? '#34d399' : 'var(--text-muted)' }}>
                        {isReady ? '✓ Installed on Phone' : (isDownloading ? 'Downloading in background...' : 'Not Downloaded')}
                      </span>
                      <button
                        onClick={() => downloadOfflineModel(m)}
                        disabled={isDownloading || isReady}
                        style={{
                          background: isReady ? 'rgba(16, 163, 127, 0.2)' : 'var(--accent)',
                          border: isReady ? '1px solid #10a37f' : 'none',
                          color: '#fff',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          cursor: isReady ? 'default' : 'pointer',
                          fontSize: '13px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {isReady ? <CheckCircle2 size={15} color="#34d399" /> : <Download size={15} />}
                        <span>{isReady ? 'Ready' : (isDownloading ? 'Downloading...' : 'Download Model')}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Floating Astra mascot */}
      <AstraCompanion
        isActive={isAstraActive}
        isThinking={isAstraThinking}
        latestAssistantText={latestAssistantReply}
        onClose={() => setIsAstraActive(false)}
        isAstraOnly={isAstraOnly}
        onExitAstraOnly={() => setIsAstraOnly(false)}
        onSendAstraOnlyMessage={sendAstraOnlyMessage}
      />
    </div>
  );
}
