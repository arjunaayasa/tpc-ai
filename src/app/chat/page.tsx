'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  thinkingExpanded?: boolean;
  citations?: Citation[];
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

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [enableThinking, setEnableThinking] = useState(true);  // Toggle for thinking mode
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConversation?.messages || [];

  // Load conversations from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('tpc-ai-conversations');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConversations(parsed.map((c: Conversation) => ({
          ...c,
          createdAt: new Date(c.createdAt),
        })));
        if (parsed.length > 0) {
          setActiveConversationId(parsed[0].id);
        }
      } catch (e) {
        console.error('Failed to load conversations:', e);
      }
    }
  }, []);

  // Save conversations to localStorage
  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem('tpc-ai-conversations', JSON.stringify(conversations));
    }
  }, [conversations]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const createNewConversation = () => {
    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: 'Percakapan Baru',
      messages: [],
      createdAt: new Date(),
    };
    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversationId(newConversation.id);
    setInput('');
  };

  const deleteConversation = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      const remaining = conversations.filter((c) => c.id !== id);
      setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const updateConversationTitle = (id: string, firstMessage: string) => {
    const title = firstMessage.slice(0, 40) + (firstMessage.length > 40 ? '...' : '');
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    let conversationId = activeConversationId;

    // Create new conversation if none active
    if (!conversationId) {
      const newConversation: Conversation = {
        id: Date.now().toString(),
        title: input.slice(0, 40) + (input.length > 40 ? '...' : ''),
        messages: [],
        createdAt: new Date(),
      };
      setConversations((prev) => [newConversation, ...prev]);
      conversationId = newConversation.id;
      setActiveConversationId(conversationId);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    // Update title if first message
    const currentConv = conversations.find((c) => c.id === conversationId);
    if (currentConv && currentConv.messages.length === 0) {
      updateConversationTitle(conversationId, input.trim());
    }

    const assistantId = (Date.now() + 1).toString();

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: [
                ...c.messages,
                userMessage,
                { id: assistantId, role: 'assistant', content: '', isStreaming: true },
              ],
            }
          : c
      )
    );

    setInput('');
    setIsLoading(true);

    try {
      // Use streaming API
      const response = await fetch('/api/rag/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage.content,
          topK: 10,
          mode: 'strict',
          enableThinking,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

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

          const eventMatch = line.match(/^event: (\w+)\ndata: ([\s\S]+)$/);
          if (!eventMatch) continue;

          const [, eventType, dataStr] = eventMatch;
          try {
            const data = JSON.parse(dataStr);

            switch (eventType) {
              case 'status':
                // Update status
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === conversationId
                      ? {
                          ...c,
                          messages: c.messages.map((msg) =>
                            msg.id === assistantId
                              ? { 
                                  ...msg, 
                                  streamingStage: data.stage === 'thinking' ? 'thinking' : 'answering',
                                }
                              : msg
                          ),
                        }
                      : c
                  )
                );
                break;

              case 'thinking':
                currentThinking = data.content || '';
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === conversationId
                      ? {
                          ...c,
                          messages: c.messages.map((msg) =>
                            msg.id === assistantId
                              ? { ...msg, thinking: currentThinking, streamingStage: 'thinking' }
                              : msg
                          ),
                        }
                      : c
                  )
                );
                break;

              case 'thinking_done':
                currentThinking = data.content || '';
                break;

              case 'answer':
                currentAnswer = data.content || '';
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === conversationId
                      ? {
                          ...c,
                          messages: c.messages.map((msg) =>
                            msg.id === assistantId
                              ? { 
                                  ...msg, 
                                  content: currentAnswer, 
                                  thinking: currentThinking,
                                  streamingStage: 'answering',
                                }
                              : msg
                          ),
                        }
                      : c
                  )
                );
                break;

              case 'citations':
                currentCitations = data.citations || [];
                break;

              case 'chunks':
                currentChunks = data.chunks || [];
                break;

              case 'done':
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === conversationId
                      ? {
                          ...c,
                          messages: c.messages.map((msg) =>
                            msg.id === assistantId
                              ? { 
                                  ...msg, 
                                  content: currentAnswer,
                                  thinking: currentThinking,
                                  citations: currentCitations,
                                  chunksUsed: currentChunks,
                                  isStreaming: false,
                                  thinkingExpanded: false,
                                }
                              : msg
                          ),
                        }
                      : c
                  )
                );
                break;

              case 'error':
                throw new Error(data.message);
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: c.messages.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, content: 'Maaf, terjadi kesalahan. Silakan coba lagi.', isStreaming: false }
                    : msg
                ),
              }
            : c
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const clearAllConversations = () => {
    if (confirm('Hapus semua percakapan?')) {
      setConversations([]);
      setActiveConversationId(null);
      localStorage.removeItem('tpc-ai-conversations');
    }
  };

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } flex-shrink-0 bg-gray-950 border-r border-gray-800 transition-all duration-300 overflow-hidden`}
      >
        <div className="flex flex-col h-full w-64">
          {/* Sidebar Header with Logo */}
          <div className="p-3 border-b border-gray-800">
            <div className="flex items-center gap-3 mb-3 px-1">
              <img 
                src="/logotpc.jpg" 
                alt="TPC AI" 
                className="w-8 h-8 rounded-full object-cover"
              />
              <span className="font-semibold text-white">TPC AI</span>
            </div>
            <button
              onClick={createNewConversation}
              className="w-full px-4 py-2.5 text-sm text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors font-medium"
            >
              + Percakapan Baru
            </button>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto py-2">
            {conversations.length === 0 ? (
              <p className="px-4 py-8 text-sm text-gray-500 text-center">
                Belum ada percakapan
              </p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex items-center gap-2 mx-2 mb-1 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    activeConversationId === conv.id
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                  }`}
                  onClick={() => setActiveConversationId(conv.id)}
                >
                  <span className="flex-1 text-sm truncate">{conv.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-gray-800 space-y-2">
            <a
              href="/documents"
              className="block w-full px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors text-center"
            >
              Kelola Dokumen
            </a>
            {conversations.length > 0 && (
              <button
                onClick={clearAllConversations}
                className="w-full px-4 py-2 text-sm text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
              >
                Hapus Semua
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-white">TPC AI</h1>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">Tax Assistant</span>
        </header>

        {/* Messages Area */}
        <main className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-4">
              {/* Logo centered like ChatGPT */}
              <div className="mb-6">
                <img 
                  src="/logotpc.jpg" 
                  alt="TPC AI" 
                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-700"
                />
              </div>
              <h2 className="text-2xl font-medium text-white mb-8">Ada yang bisa dibantu hari ini?</h2>
              
              {/* Input centered like ChatGPT */}
              <div className="w-full max-w-2xl mb-8">
                <form onSubmit={handleSubmit}>
                  <div className="relative flex items-center bg-gray-800 rounded-full border border-gray-700 focus-within:border-gray-600 transition-colors px-4">
                    <span className="text-gray-500 mr-2">+</span>
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Tanyakan apa saja..."
                      className="flex-1 bg-transparent text-white placeholder-gray-500 py-4 focus:outline-none"
                      disabled={isLoading}
                    />
                    <button
                      type="submit"
                      disabled={!input.trim() || isLoading}
                      className="ml-2 p-2 rounded-full bg-white text-gray-900 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-white transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </form>
              </div>

              {/* Suggestion chips */}
              <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
                {[
                  'Tarif PPh orang pribadi',
                  'Penghasilan Tidak Kena Pajak',
                  'Objek pajak penghasilan',
                  'Cara hitung PKP',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="px-4 py-2 text-sm text-gray-300 bg-gray-800/50 hover:bg-gray-800 rounded-full border border-gray-700 hover:border-gray-600 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              
              {/* Disclaimer */}
              <p className="mt-8 text-xs text-gray-500 text-center">
                TPC AI dapat membuat kesalahan. Periksa informasi penting dengan sumber resmi.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto py-6 px-4">
              {messages.map((message) => (
                <div key={message.id} className="mb-6">
                  <div className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
                    {message.role === 'assistant' && (
                      <img 
                        src="/logotpc.jpg" 
                        alt="TPC AI" 
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      />
                    )}
                    <div
                      className={`flex-1 ${
                        message.role === 'user'
                          ? 'bg-emerald-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%]'
                          : 'max-w-[85%]'
                      }`}
                    >
                      {message.role === 'assistant' ? (
                        <div>
                          {message.isStreaming && message.streamingStage === 'thinking' && (
                            <div className="mb-3">
                              <div className="flex items-center gap-2 text-amber-400 mb-2">
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="text-sm font-medium">Sedang menganalisis...</span>
                              </div>
                              {message.thinking && (
                                <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-3 text-sm text-amber-200/80 font-mono whitespace-pre-wrap">
                                  {message.thinking}
                                  <span className="inline-block w-1 h-4 bg-amber-400 animate-pulse ml-0.5" />
                                </div>
                              )}
                            </div>
                          )}
                          
                          {message.isStreaming && message.streamingStage === 'answering' && (
                            <>
                              {message.thinking && (
                                <div className="mb-3">
                                  <button
                                    onClick={() => {
                                      setConversations(prev => prev.map(c => ({
                                        ...c,
                                        messages: c.messages.map(m => 
                                          m.id === message.id 
                                            ? { ...m, thinkingExpanded: !m.thinkingExpanded }
                                            : m
                                        )
                                      })));
                                    }}
                                    className="flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-400"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                    </svg>
                                    Proses Analisis
                                  </button>
                                </div>
                              )}
                              <div className="text-gray-200 text-sm leading-relaxed [&_p]:my-2 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:my-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:my-2 [&_h3]:font-medium [&_h3]:my-2 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-2 [&_li]:my-1 [&_strong]:text-emerald-400 [&_strong]:font-semibold [&_code]:bg-gray-800 [&_code]:px-1 [&_code]:rounded [&_code]:text-emerald-300 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-600 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-400">
                                <ReactMarkdown>{message.content}</ReactMarkdown>
                                <span className="inline-block w-1 h-4 bg-emerald-400 animate-pulse ml-0.5" />
                              </div>
                            </>
                          )}

                          {message.isStreaming && !message.streamingStage && (
                            <div className="flex items-center gap-2 text-gray-400">
                              <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                              <span>Mempersiapkan...</span>
                            </div>
                          )}
                          
                          {!message.isStreaming && (
                            <>
                              {/* Thinking section (collapsible) */}
                              {message.thinking && (
                                <div className="mb-3">
                                  <button
                                    onClick={() => {
                                      setConversations(prev => prev.map(c => ({
                                        ...c,
                                        messages: c.messages.map(m => 
                                          m.id === message.id 
                                            ? { ...m, thinkingExpanded: !m.thinkingExpanded }
                                            : m
                                        )
                                      })));
                                    }}
                                    className="flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-400 transition-colors"
                                  >
                                    <svg 
                                      className={`w-3 h-3 transition-transform ${message.thinkingExpanded ? 'rotate-90' : ''}`} 
                                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                    </svg>
                                    Proses Analisis
                                  </button>
                                  {message.thinkingExpanded && (
                                    <div className="mt-2 bg-amber-950/30 border border-amber-900/50 rounded-lg p-3 text-xs text-amber-200/70 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                                      {message.thinking}
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              {/* Main answer */}
                              <div className="text-gray-200 text-sm leading-relaxed [&_p]:my-2 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:my-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:my-2 [&_h3]:font-medium [&_h3]:my-2 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-2 [&_li]:my-1 [&_strong]:text-emerald-400 [&_strong]:font-semibold [&_code]:bg-gray-800 [&_code]:px-1 [&_code]:rounded [&_code]:text-emerald-300 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-600 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-400">
                                <ReactMarkdown>{message.content}</ReactMarkdown>
                              </div>
                              
                              {/* Citations */}
                              {message.citations && message.citations.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-gray-700">
                                  <p className="text-xs text-gray-500 mb-2">Referensi:</p>
                                  <div className="flex flex-wrap gap-2">
                                    {message.citations.map((citation, idx) => (
                                      <a
                                        key={idx}
                                        href={`/documents/${citation.documentId}`}
                                        className="inline-flex items-center px-2 py-1 text-xs bg-gray-800 text-emerald-400 rounded border border-gray-700 hover:bg-gray-700 hover:border-emerald-600 hover:text-emerald-300 transition-colors"
                                      >
                                        [{citation.label}] {citation.anchorCitation}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ) : (
                        <span>{message.content}</span>
                      )}
                    </div>
                    {message.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
                        U
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Input Area - only show when there are messages */}
        {messages.length > 0 && (
        <footer className="border-t border-gray-800 bg-gray-900 p-4">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            <div className="relative flex items-end bg-gray-800 rounded-xl border border-gray-700 focus-within:border-emerald-500 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tanyakan tentang perpajakan..."
                rows={1}
                className="flex-1 bg-transparent text-white placeholder-gray-500 px-4 py-3 resize-none focus:outline-none max-h-[200px]"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="m-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isLoading ? 'Mengirim...' : 'Kirim'}
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 px-1">
              <button
                type="button"
                onClick={() => setEnableThinking(!enableThinking)}
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  enableThinking 
                    ? 'text-amber-400 hover:text-amber-300' 
                    : 'text-gray-500 hover:text-gray-400'
                }`}
              >
                <div className={`relative w-8 h-4 rounded-full transition-colors ${
                  enableThinking ? 'bg-amber-600' : 'bg-gray-700'
                }`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                    enableThinking ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </div>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span>Thinking Mode</span>
              </button>
              <p className="text-xs text-gray-600">
                TPC AI dapat membuat kesalahan. Periksa informasi penting.
              </p>
            </div>
          </form>
        </footer>
        )}
      </div>
    </div>
  );
}

