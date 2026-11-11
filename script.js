// ============================================================
// ChatGPT Clone – script.js  (Ollama + OpenAI)
// ============================================================

(() => {
  "use strict";

  // ── DOM refs ──────────────────────────────────────────────
  const sidebar          = document.getElementById("sidebar");
  const sidebarToggle    = document.getElementById("sidebarToggle");
  const newChatBtn       = document.getElementById("newChatBtn");
  const conversationList = document.getElementById("conversationList");
  const searchInput      = document.getElementById("searchInput");
  const welcome          = document.getElementById("welcome");
  const messagesEl       = document.getElementById("messages");
  const messageInput     = document.getElementById("messageInput");
  const sendBtn          = document.getElementById("sendBtn");
  const scrollBottomBtn  = document.getElementById("scrollBottomBtn");
  const settingsBtn      = document.getElementById("settingsBtn");
  const settingsModal    = document.getElementById("settingsModal");
  const closeSettings    = document.getElementById("closeSettings");
  const providerSelect   = document.getElementById("providerSelect");
  const ollamaUrlGroup   = document.getElementById("ollamaUrlGroup");
  const ollamaUrlInput   = document.getElementById("ollamaUrlInput");
  const apiKeyGroup      = document.getElementById("apiKeyGroup");
  const apiKeyInput      = document.getElementById("apiKeyInput");
  const modelSelect      = document.getElementById("modelSelect");
  const refreshModelsBtn = document.getElementById("refreshModelsBtn");
  const systemPromptInput= document.getElementById("systemPromptInput");
  const tempRange        = document.getElementById("tempRange");
  const tempValue        = document.getElementById("tempValue");
  const saveSettingsBtn  = document.getElementById("saveSettings");
  const clearAllBtn      = document.getElementById("clearAllBtn");
  const exportBtn        = document.getElementById("exportBtn");
  const themeToggleBtn   = document.getElementById("themeToggleBtn");
  const themeLabel       = document.getElementById("themeLabel");
  const modelQuickSelect = document.getElementById("modelQuickSelect");
  const topBarTitle      = document.getElementById("topBarTitle");
  const tokenBadge       = document.getElementById("tokenBadge");
  const importBtn        = document.getElementById("importBtn");
  const importFileInput  = document.getElementById("importFileInput");
  const shortcutsBtn     = document.getElementById("shortcutsBtn");
  const shortcutsModal   = document.getElementById("shortcutsModal");
  const closeShortcuts   = document.getElementById("closeShortcuts");

  // ── State ─────────────────────────────────────────────────
  let conversations  = JSON.parse(localStorage.getItem("chatgpt_conversations") || "[]");
  let activeConvId   = null;
  let isStreaming     = false;
  let abortController = null;

  // ── Settings ──────────────────────────────────────────────
  let settings = JSON.parse(localStorage.getItem("chatgpt_settings") || "null") || {
    provider: "ollama",
    ollamaUrl: "http://localhost:11434",
    apiKey: "",
    model: "gemma3:latest",
    systemPrompt: "You are a helpful assistant. You respond clearly and concisely. When providing code, use markdown code blocks with the appropriate language tag.",
    temperature: 0.7,
    theme: "dark",
  };

  // ── Theme ─────────────────────────────────────────────────
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeLabel.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
    settings.theme = theme;
  }
  applyTheme(settings.theme || "dark");

  themeToggleBtn.addEventListener("click", () => {
    const next = settings.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("chatgpt_settings", JSON.stringify(settings));
  });

  // ── Markdown setup ────────────────────────────────────────
  marked.setOptions({
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true,
  });

  // ── Init ──────────────────────────────────────────────────
  loadSettingsUI();
  renderSidebar();
  populateQuickModelSelect();
  if (conversations.length > 0) loadConversation(conversations[0].id);

  // Auto-refresh Ollama models on load
  if (settings.provider === "ollama") {
    refreshOllamaModels().then(populateQuickModelSelect);
  }

  // ── Provider toggle in settings ───────────────────────────
  providerSelect.addEventListener("change", () => {
    const isOllama = providerSelect.value === "ollama";
    ollamaUrlGroup.style.display = isOllama ? "" : "none";
    apiKeyGroup.style.display    = isOllama ? "none" : "";
    if (isOllama) refreshOllamaModels();
    else populateOpenAIModels();
  });

  refreshModelsBtn.addEventListener("click", () => {
    if (providerSelect.value === "ollama") refreshOllamaModels();
  });

  async function refreshOllamaModels() {
    const url = (ollamaUrlInput.value.trim() || settings.ollamaUrl || "http://localhost:11434");
    try {
      const res = await fetch(`${url}/api/tags`);
      const data = await res.json();
      const models = data.models || [];
      modelSelect.innerHTML = "";
      models.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.name;
        opt.textContent = m.name;
        modelSelect.appendChild(opt);
      });
      if (settings.model && modelSelect.querySelector(`option[value="${CSS.escape(settings.model)}"]`)) {
        modelSelect.value = settings.model;
      }
      return models;
    } catch (e) {
      console.warn("Could not fetch Ollama models:", e);
      return [];
    }
  }

  function populateOpenAIModels() {
    modelSelect.innerHTML = "";
    ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"].forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      modelSelect.appendChild(opt);
    });
    if (settings.model) modelSelect.value = settings.model;
  }

  async function populateQuickModelSelect() {
    const url = settings.ollamaUrl || "http://localhost:11434";
    try {
      const res = await fetch(`${url}/api/tags`);
      const data = await res.json();
      const models = data.models || [];
      modelQuickSelect.innerHTML = "";
      models.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.name;
        opt.textContent = m.name;
        modelQuickSelect.appendChild(opt);
      });
    } catch {
      // Fallback to current model
      modelQuickSelect.innerHTML = `<option value="${settings.model}">${settings.model}</option>`;
    }
    modelQuickSelect.value = settings.model;
  }

  modelQuickSelect.addEventListener("change", () => {
    settings.model = modelQuickSelect.value;
    modelSelect.value = settings.model;
    localStorage.setItem("chatgpt_settings", JSON.stringify(settings));
  });

  // ── Event listeners ───────────────────────────────────────
  sidebarToggle.addEventListener("click", () => sidebar.classList.toggle("open"));

  newChatBtn.addEventListener("click", () => {
    startNewChat();
    sidebar.classList.remove("open");
  });

  messageInput.addEventListener("input", () => {
    autoResize(messageInput);
    sendBtn.disabled = !messageInput.value.trim() || isStreaming;
  });

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) handleSend();
    }
  });

  sendBtn.addEventListener("click", handleSend);

  // Welcome cards
  document.querySelectorAll(".welcome-card").forEach((card) => {
    card.addEventListener("click", () => {
      messageInput.value = card.dataset.prompt;
      autoResize(messageInput);
      sendBtn.disabled = false;
      handleSend();
    });
  });

  // Search
  searchInput.addEventListener("input", () => renderSidebar(searchInput.value.trim().toLowerCase()));

  // Scroll to bottom
  messagesEl.addEventListener("scroll", () => {
    const fromBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
    scrollBottomBtn.style.display = fromBottom > 200 ? "flex" : "none";
  });
  scrollBottomBtn.addEventListener("click", scrollToBottom);

  // Settings modal
  settingsBtn.addEventListener("click", () => {
    loadSettingsUI();
    settingsModal.classList.add("open");
    if (settings.provider === "ollama") refreshOllamaModels();
  });
  closeSettings.addEventListener("click", () => settingsModal.classList.remove("open"));
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) settingsModal.classList.remove("open");
  });
  tempRange.addEventListener("input", () => {
    tempValue.textContent = tempRange.value;
  });
  saveSettingsBtn.addEventListener("click", () => {
    settings.provider    = providerSelect.value;
    settings.ollamaUrl   = ollamaUrlInput.value.trim() || "http://localhost:11434";
    settings.apiKey      = apiKeyInput.value.trim();
    settings.model       = modelSelect.value;
    settings.systemPrompt = systemPromptInput.value.trim();
    settings.temperature = parseFloat(tempRange.value);
    localStorage.setItem("chatgpt_settings", JSON.stringify(settings));
    settingsModal.classList.remove("open");
    // Sync quick select
    modelQuickSelect.value = settings.model;
    populateQuickModelSelect();
  });

  clearAllBtn.addEventListener("click", () => {
    if (!confirm("Delete all conversations?")) return;
    conversations = [];
    activeConvId  = null;
    save();
    renderSidebar();
    showWelcome();
  });

  // Export
  exportBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(conversations, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `chatgpt-clone-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // Import
  importBtn.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported)) throw new Error("Invalid format");
        const count = imported.length;
        conversations = [...imported, ...conversations];
        save();
        renderSidebar();
        if (imported.length > 0) loadConversation(imported[0].id);
        alert(`Imported ${count} conversation(s)!`);
      } catch (err) {
        alert("Failed to import: " + err.message);
      }
    };
    reader.readAsText(file);
    importFileInput.value = "";
  });

  // Shortcuts modal
  shortcutsBtn.addEventListener("click", () => shortcutsModal.classList.add("open"));
  closeShortcuts.addEventListener("click", () => shortcutsModal.classList.remove("open"));
  shortcutsModal.addEventListener("click", (e) => {
    if (e.target === shortcutsModal) shortcutsModal.classList.remove("open");
  });

  // ── Keyboard shortcuts ────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    // Ctrl+N → New chat
    if (e.ctrlKey && e.key === "n") {
      e.preventDefault();
      startNewChat();
    }
    // Ctrl+Shift+S → Settings
    if (e.ctrlKey && e.shiftKey && e.key === "S") {
      e.preventDefault();
      loadSettingsUI();
      settingsModal.classList.add("open");
    }
    // Ctrl+Shift+ArrowLeft → Toggle sidebar
    if (e.ctrlKey && e.shiftKey && e.key === "ArrowLeft") {
      e.preventDefault();
      sidebar.classList.toggle("open");
    }
    // Ctrl+/ → Shortcuts
    if (e.ctrlKey && e.key === "/") {
      e.preventDefault();
      shortcutsModal.classList.toggle("open");
    }
    // Escape → Close modals or stop generation
    if (e.key === "Escape") {
      if (settingsModal.classList.contains("open")) {
        settingsModal.classList.remove("open");
      } else if (shortcutsModal.classList.contains("open")) {
        shortcutsModal.classList.remove("open");
      } else if (isStreaming && abortController) {
        abortController.abort();
      }
    }
  });

  // ── Helpers ───────────────────────────────────────────────
  function uuid() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function save() {
    localStorage.setItem("chatgpt_conversations", JSON.stringify(conversations));
  }

  function autoResize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }

  function scrollToBottom() {
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
  }

  function showWelcome() {
    welcome.classList.remove("hidden");
    messagesEl.classList.add("hidden");
    messagesEl.innerHTML = "";
    topBarTitle.textContent = "New Chat";
    updateTokenBadge(0);
  }

  function hideWelcome() {
    welcome.classList.add("hidden");
    messagesEl.classList.remove("hidden");
  }

  function updateTokenBadge(msgCount) {
    tokenBadge.textContent = `${msgCount} msg${msgCount !== 1 ? "s" : ""}`;
  }

  function updateTopBar(conv) {
    topBarTitle.textContent = conv ? conv.title : "New Chat";
    updateTokenBadge(conv ? conv.messages.length : 0);
  }

  function loadSettingsUI() {
    providerSelect.value   = settings.provider || "ollama";
    ollamaUrlInput.value   = settings.ollamaUrl || "http://localhost:11434";
    apiKeyInput.value      = settings.apiKey || "";
    systemPromptInput.value = settings.systemPrompt || "";
    tempRange.value        = settings.temperature ?? 0.7;
    tempValue.textContent  = settings.temperature ?? 0.7;

    const isOllama = settings.provider === "ollama";
    ollamaUrlGroup.style.display = isOllama ? "" : "none";
    apiKeyGroup.style.display    = isOllama ? "none" : "";

    if (!isOllama) populateOpenAIModels();
    if (settings.model) modelSelect.value = settings.model;
  }

  // ── Sidebar rendering ────────────────────────────────────
  function renderSidebar(filter) {
    conversationList.innerHTML = "";
    const list = filter
      ? conversations.filter((c) => c.title.toLowerCase().includes(filter) ||
          c.messages.some((m) => m.content.toLowerCase().includes(filter)))
      : conversations;

    list.forEach((conv) => {
      const el = document.createElement("div");
      el.className = "conversation-item" + (conv.id === activeConvId ? " active" : "");
      el.innerHTML = `
        <span class="conv-title">${escapeHtml(conv.title)}</span>
        <button class="conv-delete" title="Delete">&times;</button>
      `;
      el.querySelector(".conv-title").addEventListener("click", () => {
        loadConversation(conv.id);
        sidebar.classList.remove("open");
      });
      el.querySelector(".conv-delete").addEventListener("click", (e) => {
        e.stopPropagation();
        deleteConversation(conv.id);
      });
      conversationList.appendChild(el);
    });
  }

  function startNewChat() {
    activeConvId = null;
    showWelcome();
    renderSidebar();
    messageInput.focus();
  }

  function loadConversation(id) {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    activeConvId = id;
    hideWelcome();
    renderMessages(conv.messages);
    renderSidebar();
    updateTopBar(conv);
    setTimeout(scrollToBottom, 50);
  }

  function deleteConversation(id) {
    conversations = conversations.filter((c) => c.id !== id);
    save();
    if (id === activeConvId) {
      if (conversations.length > 0) loadConversation(conversations[0].id);
      else { activeConvId = null; showWelcome(); }
    }
    renderSidebar();
  }

  function getOrCreateConversation(firstMessage) {
    if (activeConvId) return conversations.find((c) => c.id === activeConvId);
    const conv = {
      id: uuid(),
      title: firstMessage.slice(0, 50) || "New Chat",
      messages: [],
      createdAt: Date.now(),
    };
    conversations.unshift(conv);
    activeConvId = conv.id;
    save();
    renderSidebar();
    return conv;
  }

  // ── DeepSeek R1 Thinking Block Parser ─────────────────────
  function processThinkingBlocks(text) {
    // Match <think>...</think> blocks from DeepSeek R1
    const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
    let hasThinking = false;
    let thinkingContent = "";
    let cleanText = text;

    const matches = [...text.matchAll(thinkRegex)];
    if (matches.length > 0) {
      hasThinking = true;
      thinkingContent = matches.map((m) => m[1].trim()).join("\n\n");
      cleanText = text.replace(thinkRegex, "").trim();
    }

    return { hasThinking, thinkingContent, cleanText };
  }

  function createThinkingBlockHtml(thinkingContent) {
    const id = "think-" + Date.now();
    return `
      <div class="thinking-block">
        <div class="thinking-header" onclick="toggleThinking('${id}', this)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          🧠 Thinking process
          <span style="margin-left:auto;font-weight:400;font-size:12px;color:var(--text-muted)">(click to expand)</span>
        </div>
        <div class="thinking-content" id="${id}">${marked.parse(thinkingContent)}</div>
      </div>
    `;
  }

  window.toggleThinking = function (id, header) {
    const el = document.getElementById(id);
    el.classList.toggle("open");
    header.classList.toggle("open");
    const hint = header.querySelector("span");
    if (hint) hint.textContent = el.classList.contains("open") ? "(click to collapse)" : "(click to expand)";
  };

  // ── Message rendering ────────────────────────────────────
  function renderMessages(msgs) {
    messagesEl.innerHTML = "";
    msgs.forEach((m, i) => appendMessageBubble(m.role, m.content, i));
  }

  function appendMessageBubble(role, content, msgIndex) {
    const wrapper = document.createElement("div");
    wrapper.className = "message";
    const isUser = role === "user";

    // Process thinking blocks for assistant messages
    let displayHtml;
    if (isUser) {
      displayHtml = escapeHtml(content).replace(/\n/g, "<br>");
    } else {
      const { hasThinking, thinkingContent, cleanText } = processThinkingBlocks(content);
      displayHtml = "";
      if (hasThinking) {
        displayHtml += createThinkingBlockHtml(thinkingContent);
      }
      displayHtml += renderMarkdown(cleanText);
    }

    wrapper.innerHTML = `
      <div class="message-avatar ${isUser ? "user" : "assistant"}">
        ${isUser ? "U" : "AI"}
      </div>
      <div class="message-content">
        ${displayHtml}
        <div class="message-actions">
          <button class="action-btn copy-msg-btn" title="Copy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
          ${!isUser ? `<button class="action-btn regen-btn" title="Regenerate">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Regenerate
          </button>` : `<button class="action-btn edit-msg-btn" title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>`}
        </div>
      </div>
    `;
    messagesEl.appendChild(wrapper);

    // Copy button
    const copyBtn = wrapper.querySelector(".copy-msg-btn");
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(content).then(() => {
        copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
        }, 2000);
      });
    });

    // Regenerate
    const regenBtn = wrapper.querySelector(".regen-btn");
    if (regenBtn) regenBtn.addEventListener("click", () => handleRegenerate(msgIndex));

    // Edit
    const editBtn = wrapper.querySelector(".edit-msg-btn");
    if (editBtn) editBtn.addEventListener("click", () => handleEdit(wrapper, content, msgIndex));

    return wrapper;
  }

  function handleEdit(wrapper, originalContent, msgIndex) {
    const contentEl = wrapper.querySelector(".message-content");
    contentEl.innerHTML = `
      <textarea class="edit-textarea">${escapeHtml(originalContent)}</textarea>
      <div class="edit-actions">
        <button class="modal-save-btn edit-save">Save & Submit</button>
        <button class="action-btn edit-cancel">Cancel</button>
      </div>
    `;
    const textarea = contentEl.querySelector(".edit-textarea");
    textarea.focus();
    textarea.style.height = textarea.scrollHeight + "px";

    contentEl.querySelector(".edit-cancel").addEventListener("click", () => {
      const conv = conversations.find((c) => c.id === activeConvId);
      if (conv) { renderMessages(conv.messages); updateTopBar(conv); }
    });

    contentEl.querySelector(".edit-save").addEventListener("click", async () => {
      const newText = textarea.value.trim();
      if (!newText) return;
      const conv = conversations.find((c) => c.id === activeConvId);
      if (!conv) return;
      conv.messages = conv.messages.slice(0, msgIndex);
      conv.messages.push({ role: "user", content: newText });
      save();
      renderMessages(conv.messages);
      scrollToBottom();
      await streamResponse(conv);
    });
  }

  async function handleRegenerate(msgIndex) {
    if (isStreaming) return;
    const conv = conversations.find((c) => c.id === activeConvId);
    if (!conv) return;
    conv.messages = conv.messages.slice(0, msgIndex);
    save();
    renderMessages(conv.messages);
    scrollToBottom();
    await streamResponse(conv);
  }

  function renderMarkdown(text) {
    if (!text) return "";
    let html = marked.parse(text);
    html = html.replace(
      /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
      (_, lang, code) => `
        <pre>
          <div class="code-header">
            <span class="code-lang">${lang}</span>
            <button class="copy-code-btn" onclick="copyCode(this)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy code
            </button>
          </div>
          <code class="language-${lang}">${code}</code>
        </pre>
      `
    );
    html = html.replace(
      /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
      (_, code) => `
        <pre>
          <div class="code-header">
            <span class="code-lang">code</span>
            <button class="copy-code-btn" onclick="copyCode(this)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy code
            </button>
          </div>
          <code>${code}</code>
        </pre>
      `
    );
    return html;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  window.copyCode = function (btn) {
    const code = btn.closest("pre").querySelector("code").textContent;
    navigator.clipboard.writeText(code).then(() => {
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
      setTimeout(() => {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy code`;
      }, 2000);
    });
  };

  // ── Send message ──────────────────────────────────────────
  async function handleSend() {
    const text = messageInput.value.trim();
    if (!text || isStreaming) return;

    messageInput.value = "";
    messageInput.style.height = "auto";
    sendBtn.disabled = true;
    hideWelcome();

    const conv = getOrCreateConversation(text);
    conv.messages.push({ role: "user", content: text });
    save();

    appendMessageBubble("user", text, conv.messages.length - 1);
    updateTopBar(conv);
    scrollToBottom();

    await streamResponse(conv);
  }

  // ── Unified streaming response ────────────────────────────
  async function streamResponse(conv) {
    const typingEl = document.createElement("div");
    typingEl.className = "message";
    typingEl.innerHTML = `
      <div class="message-avatar assistant">AI</div>
      <div class="message-content">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    messagesEl.appendChild(typingEl);
    scrollToBottom();

    const stopBtn = document.createElement("button");
    stopBtn.className = "stop-btn";
    stopBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
      Stop generating
    `;
    const inputArea = document.querySelector(".input-area");
    inputArea.insertBefore(stopBtn, inputArea.firstChild);

    isStreaming = true;
    abortController = new AbortController();
    stopBtn.addEventListener("click", () => abortController.abort());

    try {
      let assistantText = "";

      const apiMessages = [];
      if (settings.systemPrompt) {
        apiMessages.push({ role: "system", content: settings.systemPrompt });
      }
      conv.messages.forEach((m) => apiMessages.push({ role: m.role, content: m.content }));

      let endpoint, headers;
      if (settings.provider === "ollama") {
        const base = settings.ollamaUrl || "http://localhost:11434";
        endpoint = `${base}/v1/chat/completions`;
        headers = { "Content-Type": "application/json" };
      } else {
        endpoint = "https://api.openai.com/v1/chat/completions";
        headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        };
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: settings.model,
          messages: apiMessages,
          temperature: settings.temperature,
          stream: true,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error: ${response.status}`);
      }

      typingEl.remove();
      const assistantBubble = appendMessageBubble("assistant", "", conv.messages.length);
      const contentEl = assistantBubble.querySelector(".message-content");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastRenderTime = 0;
      const RENDER_INTERVAL = 50; // ms between re-renders for performance

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        let needsRender = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantText += delta;
              needsRender = true;
            }
          } catch {}
        }

        // Throttle rendering for better performance
        const now = Date.now();
        if (needsRender && (now - lastRenderTime > RENDER_INTERVAL)) {
          lastRenderTime = now;
          const { hasThinking, thinkingContent, cleanText } = processThinkingBlocks(assistantText);
          const actionsHtml = contentEl.querySelector(".message-actions")?.outerHTML || "";
          let html = "";
          if (hasThinking) html += createThinkingBlockHtml(thinkingContent);
          html += renderMarkdown(cleanText);
          contentEl.innerHTML = html + actionsHtml;
          scrollToBottom();
        }
      }

      // Final render
      const { hasThinking, thinkingContent, cleanText } = processThinkingBlocks(assistantText);
      const actionsHtml = contentEl.querySelector(".message-actions")?.outerHTML || "";
      let finalHtml = "";
      if (hasThinking) finalHtml += createThinkingBlockHtml(thinkingContent);
      finalHtml += renderMarkdown(cleanText);
      contentEl.innerHTML = finalHtml + actionsHtml;

      conv.messages.push({ role: "assistant", content: assistantText });

      if (conv.messages.filter((m) => m.role === "user").length === 1) {
        conv.title = generateTitle(conv.messages[0].content);
      }
      save();
      renderSidebar();
      updateTopBar(conv);

    } catch (err) {
      typingEl.remove();
      if (err.name !== "AbortError") {
        const errorMsg = settings.provider === "ollama"
          ? `⚠️ **Error:** ${err.message}\n\nMake sure Ollama is running (\`ollama serve\`) and the model is pulled.`
          : `⚠️ **Error:** ${err.message}\n\nMake sure your API key is set correctly in Settings.`;
        appendMessageBubble("assistant", errorMsg, -1);
      }
    } finally {
      isStreaming = false;
      abortController = null;
      stopBtn.remove();
      sendBtn.disabled = !messageInput.value.trim();
    }
  }

  function generateTitle(text) {
    const words = text.split(/\s+/).slice(0, 6).join(" ");
    return words.length > 40 ? words.slice(0, 40) + "…" : words;
  }
})();
