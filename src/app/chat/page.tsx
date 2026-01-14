'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- Types ---
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  thinkingExpanded?: boolean;
  citations?: Citation[];
  citationsExpanded?: boolean; // New state for toggling citations
  chunksUsed?: ChunkUsed[];
  isStreaming?: boolean;
  streamingStage?: 'thinking' | 'answering';
}

interface Citation {
  label: string;
  chunkId: string;
  anchorCitation: string;
  documentId: string;
  jenis: string;
  nomor: string | null;
  tahun: number | null;
  judul: string | null;
}

interface ChunkUsed {
  id: string;
  label?: string;
  anchorCitation: string;
  textExcerpt: string;
  similarity: number;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

type OwlieModel = 'owlie-loc' | 'owlie-chat' | 'owlie-thinking' | 'owlie-max';

interface ModelOption {
  id: OwlieModel;
  name: string;
  shortName: string;
  description: string;
  color: string;
}

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'owlie-loc',
    name: 'Owlie Lite',
    shortName: 'Lite',
    description: 'Model lokal (relatif lambat, offline)',
    color: 'text-orange-500'
  },
  {
    id: 'owlie-chat',
    name: 'Owlie Chat v1.5',
    shortName: 'Chat v1.5',
    description: 'Owlie merespon dengan cepat.',
    color: 'text-blue-500'
  },
  {
    id: 'owlie-thinking',
    name: 'Owlie Thinking v1.5',
    shortName: 'Thinking v1.5',
    description: 'Owlie berpikir untuk menjawab.',
    color: 'text-purple-500'
  },
  {
    id: 'owlie-max',
    name: 'Owlie Max v1.5',
    shortName: 'Max v1.5',
    description: 'Owlie berpikir dan menganalisis lebih dalam untuk menjawab.',
    color: 'text-rose-500'
  },
];

export default function ChatPage() {
  // --- State ---
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [enableThinking, setEnableThinking] = useState(true);
  const [selectedModel, setSelectedModel] = useState<OwlieModel>('owlie-loc');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true); // Default dark
  const [thinkingDropdownOpen, setThinkingDropdownOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConversation?.messages || [];

  // --- Effects ---
  useEffect(() => {
    const savedTheme = localStorage.getItem('tpc-ai-theme');
    if (savedTheme) setIsDarkMode(savedTheme === 'dark');

    const savedModel = localStorage.getItem('tpc-ai-model');
    if (savedModel && MODEL_OPTIONS.find(m => m.id === savedModel)) {
      setSelectedModel(savedModel as OwlieModel);
    }

    const savedConvs = localStorage.getItem('tpc-ai-conversations');
    if (savedConvs) {
      try {
        const parsed = JSON.parse(savedConvs);
        setConversations(parsed.map((c: Conversation) => ({ ...c, createdAt: new Date(c.createdAt) })));
        if (parsed.length > 0) setActiveConversationId(parsed[0].id);
      } catch (e) {
        console.error('Failed to load conversations:', e);
      }
    }

    // Close sidebar on mobile by default
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  useEffect(() => localStorage.setItem('tpc-ai-theme', isDarkMode ? 'dark' : 'light'), [isDarkMode]);
  useEffect(() => { if (conversations.length > 0) localStorage.setItem('tpc-ai-conversations', JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => localStorage.setItem('tpc-ai-model', selectedModel), [selectedModel]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'user' || (lastMessage?.role === 'assistant' && !lastMessage?.isStreaming)) {
      scrollToBottom();
    }
  }, [messages.length, messages[messages.length - 1]?.isStreaming]);

  // --- Handlers ---
  const createNewConversation = () => {
    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: 'New chat',
      messages: [],
      createdAt: new Date(),
    };
    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversationId(newConversation.id);
    setInput('');
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const deleteConversation = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm('Hapus percakapan ini?')) return;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      const remaining = conversations.filter((c) => c.id !== id);
      setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const updateConversationTitle = (id: string, firstMessage: string) => {
    const title = firstMessage.slice(0, 30);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    let conversationId = activeConversationId;
    if (!conversationId) {
      const newConversation: Conversation = {
        id: Date.now().toString(),
        title: input.slice(0, 30),
        messages: [],
        createdAt: new Date(),
      };
      setConversations((prev) => [newConversation, ...prev]);
      conversationId = newConversation.id;
      setActiveConversationId(conversationId);
    }

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    const currentConv = conversations.find((c) => c.id === conversationId);
    if (currentConv && currentConv.messages.length === 0) updateConversationTitle(conversationId!, input.trim());
    else if (currentConv && currentConv.title === 'New chat') updateConversationTitle(conversationId!, input.trim());

    const assistantId = (Date.now() + 1).toString();
    setConversations((prev) => prev.map((c) => c.id === conversationId ? {
      ...c, messages: [...c.messages, userMessage, { id: assistantId, role: 'assistant', content: '', isStreaming: true }]
    } : c));

    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/rag/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage.content,
          history: currentConv ? currentConv.messages.map(m => ({ role: m.role, content: m.content })) : [],
          topK: 50,
          mode: 'strict',
          enableThinking,
          model: selectedModel,
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let buffer = '';
      let currentThinking = '';
      let currentAnswer = '';
      let currentCitations: Citation[] = [];
      let currentChunks: ChunkUsed[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('event:')) continue;
          const match = line.match(/^event: (\w+)\ndata: ([\s\S]+)$/);
          console.log('[SSE Debug] Line:', line.slice(0, 100), '| Match:', !!match);
          if (!match) continue;
          const [, eventType, dataStr] = match;

          try {
            const data = JSON.parse(dataStr);
            console.log('[SSE Debug] Event:', eventType, '| Data:', JSON.stringify(data).slice(0, 100));
            setConversations((prev) => prev.map((c) => {
              if (c.id !== conversationId) return c;
              const updateMessage = (updater: (msg: Message) => Message) => ({ ...c, messages: c.messages.map(msg => msg.id === assistantId ? updater(msg) : msg) });

              switch (eventType) {
                case 'status': return updateMessage(msg => ({ ...msg, streamingStage: data.stage === 'thinking' ? 'thinking' : 'answering' }));
                case 'thinking': currentThinking = data.content || ''; return updateMessage(msg => ({ ...msg, thinking: currentThinking, streamingStage: 'thinking' }));
                case 'thinking_done': currentThinking = data.content || ''; return updateMessage(msg => ({ ...msg }));
                case 'answer': currentAnswer = data.content || ''; return updateMessage(msg => ({ ...msg, content: currentAnswer, thinking: currentThinking, streamingStage: 'answering' }));
                case 'citations': currentCitations = data.citations || []; return c;
                case 'chunks': currentChunks = data.chunks || []; return c;
                case 'done': return updateMessage(msg => ({ ...msg, content: currentAnswer, thinking: currentThinking, citations: currentCitations, chunksUsed: currentChunks, isStreaming: false, thinkingExpanded: false }));
                case 'error': throw new Error(data.message);
                default: return c;
              }
            }));
          } catch (e) { console.error('Parse error:', e); }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setConversations((prev) => prev.map((c) => c.id === conversationId ? {
        ...c, messages: c.messages.map((msg) => msg.id === assistantId ? { ...msg, content: 'Maaf, terjadi kesalahan.', isStreaming: false } : msg),
      } : c));
    } finally {
      setIsLoading(false);
      // Ensure streaming state is cleared even if connection closed abruptly
      setConversations((prev) => prev.map((c) => c.id === conversationId ? {
        ...c, messages: c.messages.map((msg) => msg.id === assistantId ? { ...msg, isStreaming: false } : msg),
      } : c));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const ThemeToggle = () => (
    <button
      onClick={() => setIsDarkMode(!isDarkMode)}
      className={`p-2 rounded-lg transition-all text-xs font-medium flex items-center gap-2 ${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-black hover:bg-black/5'}`}
      title={isDarkMode ? 'Light Mode' : 'Dark Mode'}
    >
      {isDarkMode ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
      )}
    </button>
  );

  const currentModel = MODEL_OPTIONS.find(m => m.id === selectedModel);

  return (
    <div className={`relative flex h-screen w-full overflow-hidden transition-colors duration-500 ${isDarkMode ? 'bg-[#0f1115] text-[#ededed]' : 'bg-[#f8f9fa] text-[#1a1c20]'}`}>

      {/* --- Aurora Backgrounds --- */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-[-20%] left-[-10%] w-[50vw] h-[50vh] rounded-full blur-[120px] opacity-20 transition-colors duration-1000 ${isDarkMode ? 'bg-blue-900' : 'bg-blue-200'}`}></div>
        <div className={`absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vh] rounded-full blur-[120px] opacity-20 transition-colors duration-1000 ${isDarkMode ? 'bg-emerald-900' : 'bg-emerald-200'}`}></div>
      </div>

      {/* --- Mobile Overlay (tap to close sidebar) --- */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* --- Sidebar (ChatGPT Style) --- */}
      <aside
        className={`${sidebarOpen ? 'w-[260px] translate-x-0' : 'w-0 -translate-x-full'} fixed md:relative z-30 h-full transition-all duration-300 ease-in-out flex-shrink-0 overflow-hidden`}
      >
        <div className={`h-full w-[260px] flex flex-col backdrop-blur-xl border-r transition-colors duration-500 ${isDarkMode ? 'bg-[#171717]/95 border-white/5' : 'bg-white/95 border-black/5'}`}>
          {/* Header: New Chat */}
          <div className="p-3">
            <div className="flex items-center gap-3 px-2 mb-3">
              <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 shadow-sm border border-white/10">
                <img src="/logotpc.jpg" alt="TPC" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                <div className="hidden w-full h-full bg-gradient-to-tr from-blue-600 to-emerald-600 flex items-center justify-center text-white font-bold text-xs">T</div>
              </div>
              <span className={`font-bold tracking-tight text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>TPC AI</span>
            </div>
            <button
              onClick={createNewConversation}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-sm group ${isDarkMode
                ? 'bg-transparent border-white/10 hover:bg-white/5 text-white'
                : 'bg-white border-black/10 hover:bg-black/5 text-gray-800 shadow-sm'
                }`}
            >
              <span className={`p-0.5 rounded-sm ${isDarkMode ? 'bg-white text-black' : 'bg-black text-white'}`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </span>
              <span className="font-medium">New chat</span>

              <svg className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-2 py-2 container-snap custom-scrollbar">
            <div className={`px-2 mb-2 text-xs font-semibold ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Recent</div>
            {conversations.length === 0 ? (
              <div className={`text-center py-4 text-xs italic ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>No history</div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => { setActiveConversationId(conv.id); if (window.innerWidth < 768) setSidebarOpen(false); }}
                  className={`group relative px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm ${activeConversationId === conv.id
                    ? isDarkMode ? 'bg-[#2b2d31] text-white' : 'bg-gray-200 text-gray-900'
                    : isDarkMode ? 'text-gray-300 hover:bg-[#202123]' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                  <div className="line-clamp-1 pr-6">{conv.title || 'New chat'}</div>

                  {/* Delete Action (Hover) */}
                  <div className={`absolute right-1 top-1/2 -translate-y-1/2 flex opacity-0 group-hover:opacity-100 pl-4 ${activeConversationId === conv.id ? (isDarkMode ? 'bg-gradient-to-l from-[#2b2d31] to-transparent' : 'bg-gradient-to-l from-gray-200 to-transparent') : (isDarkMode ? 'bg-gradient-to-l from-[#202123] to-transparent' : 'bg-gradient-to-l from-gray-100 to-transparent')}`}>
                    <button onClick={(e) => deleteConversation(conv.id, e)} className="p-1 hover:text-red-400 text-gray-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer (Profile like) */}
          <div className={`p-2 border-t ${isDarkMode ? 'border-white/10' : 'border-black/5'}`}>
            <button
              onClick={() => window.location.href = '/documents'}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors text-left group ${isDarkMode ? 'hover:bg-[#202123] text-white' : 'hover:bg-gray-100 text-gray-900'}`}
            >
              <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xs">A</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">Admin User</div>
                <div className={`text-[10px] truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Manage Documents</div>
              </div>
            </button>
          </div>
        </div>
      </aside>

      {/* --- Main Area --- */}
      <main className="relative flex-1 flex flex-col min-w-0 z-10 h-full">
        {/* Navbar */}
        <header className={`flex items-center justify-between px-4 py-3 sticky top-0 z-20 backdrop-blur-md transition-colors ${isDarkMode ? 'bg-[#0f1115]/80' : 'bg-[#f8f9fa]/80'}`}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`p-2 rounded-md transition-colors ${isDarkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-black/5 text-gray-500'}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>

            {/* Model Selector */}
            <div className="relative">
              <button
                onClick={() => setModelMenuOpen(!modelMenuOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-sm font-medium ${isDarkMode
                  ? 'bg-transparent hover:bg-white/10 text-gray-300 border-transparent hover:border-white/10'
                  : 'bg-transparent hover:bg-black/5 text-gray-700 border-transparent hover:border-black/5'
                  }`}
              >
                <span className="opacity-60">TPC AI</span>
                <span className={currentModel?.color}>{currentModel?.shortName}</span>
                <svg className={`w-3 h-3 ml-1 opacity-50 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>

              {modelMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setModelMenuOpen(false)}></div>
                  <div className={`absolute top-full left-0 mt-2 w-72 p-1.5 rounded-xl border shadow-xl backdrop-blur-xl z-40 animate-in fade-in zoom-in-95 duration-200 ${isDarkMode ? 'bg-[#1e2025]/95 border-white/10' : 'bg-white/95 border-gray-100'}`}>
                    {MODEL_OPTIONS.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => { setSelectedModel(model.id); setModelMenuOpen(false); }}
                        className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors ${selectedModel === model.id
                          ? isDarkMode ? 'bg-white/10' : 'bg-gray-100'
                          : isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                          }`}
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium flex items-center gap-2">
                            <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>TPC AI</span>
                            <span className={model.color}>{model.name}</span>
                          </div>
                          <div className={`text-xs mt-0.5 leading-relaxed ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            {model.description}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Theme Toggle (Right Side) */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-8 scroll-smooth">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-700">
              {/* TPC Logo */}
              <div className="mb-6 rounded-2xl overflow-hidden shadow-2xl shadow-blue-500/20">
                <img src="/logotpc.jpg" alt="TPC Logo" className="w-24 h-24 object-cover" onError={(e) => {
                  // Fallback if image fails
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }} />
                <div className="hidden w-24 h-24 bg-gradient-to-tr from-blue-600 to-emerald-600 flex items-center justify-center text-white text-3xl font-bold">T</div>
              </div>

              <h1 className={`text-3xl font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>TPC Artificial Intelligence</h1>
              <p className={`max-w-md text-base mb-10 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Asisten perpajakan pintar dengan kemampuan analisis mendalam. Siap membantu perhitungan dan peraturan pajak.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
                {['Bagaimana cara menghitung PPh 21?', 'Jelaskan PP 58 Tahun 2023', 'Apa objek pajak PPN?', 'Simulasi pajak karyawan'].map((text, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(text)}
                    className={`p-4 rounded-xl text-left text-sm transition-all border ${isDarkMode
                      ? 'bg-white/5 border-white/5 hover:bg-white/10 text-gray-300'
                      : 'bg-white border-gray-200 hover:border-blue-400 text-gray-600 shadow-sm'
                      }`}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-8">
              {messages.map((message) => (
                <div key={message.id} className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : ''} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 shadow-md">
                      <img src="/logotpc.jpg" alt="TPC" className="w-full h-full object-cover" onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }} />
                      <div className="hidden w-full h-full bg-gradient-to-tr from-blue-600 to-emerald-600 flex items-center justify-center text-white font-bold text-xs">T</div>
                    </div>
                  )}

                  <div className={`relative max-w-[85%] rounded-2xl px-6 py-4 shadow-sm ${message.role === 'user'
                    ? isDarkMode
                      ? 'bg-[#2b2d31] text-white rounded-tr-sm'
                      : 'bg-blue-600 text-white rounded-tr-sm shadow-blue-200/50'
                    : isDarkMode
                      ? 'bg-transparent text-gray-100'
                      : 'bg-white text-gray-800 border border-gray-100 shadow-sm'
                    }`}>
                    {/* Thinking Process */}
                    {message.thinking && (
                      <div className="mb-4">
                        <button
                          onClick={() => setConversations(prev => prev.map(c => ({ ...c, messages: c.messages.map(m => m.id === message.id ? { ...m, thinkingExpanded: !m.thinkingExpanded } : m) })))}
                          className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider mb-2 transition-colors ${isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                          {message.isStreaming && message.streamingStage === 'thinking' ? (
                            <span className="flex items-center gap-1.5 text-blue-500">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                              Sedang Berpikir
                            </span>
                          ) : (
                            <span>Proses Berpikir</span>
                          )}
                          <svg className={`w-3 h-3 transition-transform ${message.thinkingExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>

                        {(message.thinkingExpanded || (message.isStreaming && message.streamingStage === 'thinking')) && (
                          <div className={`text-xs font-mono p-4 rounded-lg border border-l-4 overflow-x-auto ${isDarkMode
                            ? 'bg-[#0d1117] border-[#30363d] border-l-blue-500 text-gray-300 font-mono shadow-inner'
                            : 'bg-[#1e1e1e] border-gray-800 border-l-blue-500 text-green-400 font-mono shadow-inner'
                            }`}>
                            <div className="flex items-center gap-2 mb-2 border-b border-white/10 pb-2 text-[10px] opacity-70">
                              <span>$ thinking_process.sh</span>
                            </div>
                            <div className={`whitespace-pre-wrap ${message.isStreaming && message.streamingStage === 'thinking' ? 'animate-pulse' : ''}`} style={{
                              background: message.isStreaming && message.streamingStage === 'thinking'
                                ? 'linear-gradient(90deg, currentColor 0%, rgba(100,150,255,0.7) 50%, currentColor 100%)'
                                : 'none',
                              backgroundSize: '200% 100%',
                              WebkitBackgroundClip: message.isStreaming && message.streamingStage === 'thinking' ? 'text' : 'unset',
                              WebkitTextFillColor: message.isStreaming && message.streamingStage === 'thinking' ? 'transparent' : 'unset',
                              animation: message.isStreaming && message.streamingStage === 'thinking' ? 'shimmer 2s linear infinite' : 'none',
                            }}>
                              {message.thinking}
                            </div>
                            {message.isStreaming && message.streamingStage === 'thinking' && <span className="inline-block w-1.5 h-3 bg-blue-500 ml-1 animate-pulse"></span>}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Message Content with better spacing */}
                    <div className={`prose prose-sm max-w-none leading-7 ${isDarkMode ? 'prose-invert prose-p:text-gray-200 prose-headings:text-gray-100 prose-strong:text-white' : 'prose-slate prose-p:text-gray-700'} ${isDarkMode ? '[&_p]:mb-4 [&_p:last-child]:mb-0' : '[&_p]:mb-4 [&_p:last-child]:mb-0'}`}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ node, ...props }) => <p className="mb-4 last:mb-0 leading-7" {...props} />,
                          li: ({ node, ...props }) => <li className="mb-1 leading-relaxed" {...props} />,
                          code: ({ node, inline, className, children, ...props }: any) => {
                            const match = /\[C(\d+)\]/.exec(String(children));
                            if (inline && match) {
                              return (
                                <span className={`inline-flex items-center justify-center h-5 px-1.5 rounded text-[10px] font-bold mx-0.5 cursor-help select-none transition-colors ${isDarkMode
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30'
                                  : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'
                                  }`}>
                                  {String(children).replace('[', '').replace(']', '')}
                                </span>
                              );
                            }
                            return <code className={`${className} px-1.5 py-0.5 rounded text-sm font-mono ${isDarkMode ? 'bg-white/10 text-gray-300' : 'bg-gray-100 text-gray-800'}`} {...props}>{children}</code>;
                          },
                          table: ({ node, ...props }) => <div className={`overflow-x-auto my-4 rounded-lg border ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}><table className={`min-w-full divide-y ${isDarkMode ? 'divide-white/10' : 'divide-gray-200'}`} {...props} /></div>,
                          thead: ({ node, ...props }) => <thead className={isDarkMode ? 'bg-white/5' : 'bg-gray-50'} {...props} />,
                          th: ({ node, ...props }) => <th className={`px-3 py-2 text-left text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`} {...props} />,
                          tbody: ({ node, ...props }) => <tbody className={`divide-y ${isDarkMode ? 'divide-white/10' : 'divide-gray-200'}`} {...props} />,
                          tr: ({ node, ...props }) => <tr className={`transition-colors ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50/50'}`} {...props} />,
                          td: ({ node, ...props }) => <td className={`px-3 py-2 text-sm whitespace-pre-wrap ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`} {...props} />,
                        }}
                      >
                        {message.content.replace(/\[C(\d+)\]/g, ' `[C$1]` ')}
                      </ReactMarkdown>

                      {/* Typing Indicator */}
                      {message.role === 'assistant' && message.isStreaming && !message.content && (
                        <div className="flex gap-2 items-center py-3 px-2">
                          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                      )}
                    </div>

                    {/* Citations Button */}
                    {message.citations && message.citations.length > 0 && (
                      <div className={`mt-4 pt-3 border-t ${isDarkMode ? 'border-white/10' : 'border-gray-100'}`}>
                        <button
                          onClick={() => setConversations(prev => prev.map(c => ({ ...c, messages: c.messages.map(m => m.id === message.id ? { ...m, citationsExpanded: !m.citationsExpanded } : m) })))}
                          className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg transition-colors ${isDarkMode ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                          {message.citations.length} Referensi
                          <svg className={`w-3 h-3 ml-auto transition-transform ${message.citationsExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>

                        {message.citationsExpanded && (
                          <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                            {message.citations.map((cit, idx) => (
                              <div key={idx} className={`p-3 rounded-lg text-xs border ${isDarkMode ? 'bg-black/20 border-white/5 text-gray-400' : 'bg-white border-gray-200 text-gray-600'}`}>
                                <div className={`font-semibold mb-1 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                                  {cit.jenis === 'BUKU' && cit.judul
                                    ? `${cit.judul}${cit.tahun ? ` (${cit.tahun})` : ''}`
                                    : `${cit.jenis}${cit.nomor ? ` ${cit.nomor}` : ''}${cit.tahun ? ` Tahun ${cit.tahun}` : ''}`
                                  }
                                </div>
                                <div className="line-clamp-2 opacity-80">{cit.anchorCitation}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>

        {/* --- Input Area --- */}
        <div className="p-4 relative z-20">
          <div className="max-w-3xl mx-auto">
            <form
              onSubmit={handleSubmit}
              className={`relative flex items-end gap-2 p-1.5 rounded-[2rem] border shadow-lg backdrop-blur-xl transition-all ${isDarkMode
                ? 'bg-[#16181d]/90 border-white/10 focus-within:border-blue-500/50'
                : 'bg-white border-gray-200 focus-within:border-blue-400 focus-within:shadow-md'
                }`}
            >
              <div className="pl-3 pb-2">
                {/* Thinking Toggle Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setThinkingDropdownOpen(!thinkingDropdownOpen)}
                    className={`p-2 rounded-full transition-colors ${enableThinking ? 'text-blue-500 bg-blue-500/10' : 'text-gray-400 hover:text-gray-600'}`}
                    title="Mode Berpikir"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  </button>

                  {thinkingDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setThinkingDropdownOpen(false)}></div>
                      <div className={`absolute bottom-full left-0 mb-2 w-48 p-1 rounded-xl border shadow-xl backdrop-blur-xl z-40 ${isDarkMode ? 'bg-[#1e2025] border-white/10' : 'bg-white border-gray-200'}`}>
                        <button
                          type="button"
                          onClick={() => { setEnableThinking(true); setThinkingDropdownOpen(false); }}
                          className={`w-full flex items-center gap-2 p-2 rounded-lg text-sm ${enableThinking ? (isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600') : (isDarkMode ? 'text-gray-400 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50')}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Thinking Mode
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEnableThinking(false); setThinkingDropdownOpen(false); }}
                          className={`w-full flex items-center gap-2 p-2 rounded-lg text-sm ${!enableThinking ? (isDarkMode ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-900') : (isDarkMode ? 'text-gray-400 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50')}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span> Standard Mode
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex-1 min-h-[44px] flex items-center mb-1">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ketik pertanyaan pajak Anda..."
                  className={`w-full bg-transparent border-none focus:ring-0 outline-none resize-none max-h-[200px] py-2 text-sm ${isDarkMode ? 'text-white placeholder-gray-500' : 'text-gray-800 placeholder-gray-400'}`}
                  disabled={isLoading}
                />
              </div>

              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className={`p-2.5 m-1 rounded-full transition-all duration-300 ${input.trim() && !isLoading
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : isDarkMode ? 'bg-white/5 text-gray-600 cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
              >
                {isLoading ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                  <svg className="w-5 h-5 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                )}
              </button>
            </form>
            <div className={`text-center mt-3 text-[10px] ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
              Owlie dapat membuat kesalahan. Cek kembali informasi penting.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}