'use client';

import { useState } from 'react';
import Link from 'next/link';

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
    anchorCitation: string;
    textExcerpt: string;
    similarity: number;
}

interface AskResponse {
    answer: string;
    citations: Citation[];
    chunksUsed: ChunkUsed[];
    metadata: {
        question: string;
        topK: number;
        mode: string;
        chunksRetrieved: number;
        processingTimeMs: number;
    };
}

interface Filters {
    jenis?: string;
    nomor?: string;
    tahun?: number;
}

const jenisOptions = ['', 'UU', 'PP', 'PMK', 'PER', 'SE', 'KEP'];

export default function RAGPage() {
    const [question, setQuestion] = useState('');
    const [filters, setFilters] = useState<Filters>({});
    const [mode, setMode] = useState<'strict' | 'balanced'>('strict');
    const [topK, setTopK] = useState(12);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [response, setResponse] = useState<AskResponse | null>(null);
    const [showChunks, setShowChunks] = useState(false);
    const [showFilters, setShowFilters] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!question.trim()) return;

        setLoading(true);
        setError(null);
        setResponse(null);

        try {
            const body: Record<string, unknown> = {
                question: question.trim(),
                topK,
                mode,
            };

            // Only add filters if any are set
            const activeFilters: Filters = {};
            if (filters.jenis) activeFilters.jenis = filters.jenis;
            if (filters.nomor) activeFilters.nomor = filters.nomor;
            if (filters.tahun) activeFilters.tahun = filters.tahun;
            
            if (Object.keys(activeFilters).length > 0) {
                body.filters = activeFilters;
            }

            const res = await fetch('/api/rag/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || data.details || 'Request failed');
            }

            setResponse(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const formatAnswer = (answer: string) => {
        // Convert markdown-like formatting to HTML
        return answer
            .split('\n')
            .map((line, i) => {
                // Headers
                if (line.startsWith('**') && line.endsWith('**')) {
                    return <h3 key={i} className="font-bold text-lg mt-4 mb-2">{line.replace(/\*\*/g, '')}</h3>;
                }
                // Bullet points
                if (line.startsWith('- ') || line.startsWith('• ')) {
                    return <li key={i} className="ml-4">{line.substring(2)}</li>;
                }
                // Numbered lists
                if (/^\d+\.\s/.test(line)) {
                    return <p key={i} className="font-semibold mt-3">{line}</p>;
                }
                // Regular lines
                if (line.trim()) {
                    return <p key={i} className="mb-2">{line}</p>;
                }
                return null;
            });
    };

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Navigation */}
            <nav className="border-b border-neutral-800">
                <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
                    <span className="font-semibold tracking-tight">Tax KB</span>
                    <div className="flex gap-6 text-sm">
                        <Link href="/documents" className="text-neutral-400 hover:text-white transition-colors">
                            Documents
                        </Link>
                        <Link href="/upload" className="text-neutral-400 hover:text-white transition-colors">
                            Upload
                        </Link>
                        <Link href="/rag" className="text-white">
                            Ask
                        </Link>
                    </div>
                </div>
            </nav>

            <main className="max-w-4xl mx-auto px-6 py-8">
                <h1 className="text-2xl font-bold mb-2">Tanya Regulasi Perpajakan</h1>
                <p className="text-neutral-400 mb-6">
                    Ajukan pertanyaan tentang regulasi perpajakan. Sistem akan mencari pasal yang relevan dan memberikan jawaban dengan sitasi.
                </p>

                {/* Question Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <textarea
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="Contoh: Apa syarat untuk menjadi Pengusaha Kena Pajak (PKP)?"
                            className="w-full h-32 bg-black border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-500 resize-none"
                        />
                    </div>

                    {/* Filters Toggle */}
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => setShowFilters(!showFilters)}
                            className="text-sm text-neutral-400 hover:text-white"
                        >
                            {showFilters ? '▼' : '▶'} Filter & Opsi
                        </button>
                    </div>

                    {/* Filters Panel */}
                    {showFilters && (
                        <div className="border border-neutral-800 rounded-lg p-4 space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-neutral-500 text-sm mb-1">Jenis</label>
                                    <select
                                        value={filters.jenis || ''}
                                        onChange={(e) => setFilters({ ...filters, jenis: e.target.value || undefined })}
                                        className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-sm"
                                    >
                                        {jenisOptions.map((opt) => (
                                            <option key={opt} value={opt}>{opt || 'Semua'}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-neutral-500 text-sm mb-1">Nomor</label>
                                    <input
                                        type="text"
                                        value={filters.nomor || ''}
                                        onChange={(e) => setFilters({ ...filters, nomor: e.target.value || undefined })}
                                        placeholder="e.g., 36"
                                        className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-neutral-500 text-sm mb-1">Tahun</label>
                                    <input
                                        type="number"
                                        value={filters.tahun || ''}
                                        onChange={(e) => setFilters({ ...filters, tahun: e.target.value ? parseInt(e.target.value) : undefined })}
                                        placeholder="e.g., 2008"
                                        className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-sm"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-neutral-500 text-sm mb-1">Mode</label>
                                    <select
                                        value={mode}
                                        onChange={(e) => setMode(e.target.value as 'strict' | 'balanced')}
                                        className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-sm"
                                    >
                                        <option value="strict">Strict (hanya dari dokumen)</option>
                                        <option value="balanced">Balanced (dengan penjelasan)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-neutral-500 text-sm mb-1">Top K Chunks</label>
                                    <input
                                        type="number"
                                        value={topK}
                                        onChange={(e) => setTopK(Math.min(50, Math.max(1, parseInt(e.target.value) || 12)))}
                                        min={1}
                                        max={50}
                                        className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading || !question.trim()}
                        className="px-6 py-3 bg-white text-black rounded-lg font-medium hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Memproses...' : 'Tanyakan'}
                    </button>
                </form>

                {/* Error */}
                {error && (
                    <div className="mt-6 p-4 border border-red-500/30 rounded-lg text-red-400">
                        {error}
                    </div>
                )}

                {/* Response */}
                {response && (
                    <div className="mt-8 space-y-6">
                        {/* Answer */}
                        <div className="border border-neutral-800 rounded-lg p-6">
                            <h2 className="font-bold text-lg mb-4">Jawaban</h2>
                            <div className="prose prose-invert max-w-none text-neutral-300">
                                {formatAnswer(response.answer)}
                            </div>
                        </div>

                        {/* Citations */}
                        {response.citations.length > 0 && (
                            <div className="border border-neutral-800 rounded-lg p-6">
                                <h2 className="font-bold text-lg mb-4">Sitasi yang Digunakan</h2>
                                <div className="space-y-2">
                                    {response.citations.map((citation) => (
                                        <div key={citation.label} className="flex items-start gap-3 text-sm">
                                            <span className="px-2 py-0.5 bg-neutral-800 rounded text-neutral-300 font-mono">
                                                [{citation.label}]
                                            </span>
                                            <div>
                                                <Link 
                                                    href={`/documents/${citation.documentId}`}
                                                    className="text-blue-400 hover:underline"
                                                >
                                                    {citation.anchorCitation}
                                                </Link>
                                                <span className="text-neutral-500 ml-2">
                                                    ({citation.jenis} {citation.nomor} {citation.tahun ? `Tahun ${citation.tahun}` : ''})
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Metadata */}
                        <div className="text-sm text-neutral-500 flex items-center gap-4">
                            <span>Mode: {response.metadata.mode}</span>
                            <span>•</span>
                            <span>{response.metadata.chunksRetrieved} chunks retrieved</span>
                            <span>•</span>
                            <span>{response.metadata.processingTimeMs}ms</span>
                            <button
                                onClick={() => setShowChunks(!showChunks)}
                                className="text-neutral-400 hover:text-white ml-auto"
                            >
                                {showChunks ? 'Hide' : 'Show'} retrieved chunks
                            </button>
                        </div>

                        {/* Retrieved Chunks */}
                        {showChunks && (
                            <div className="border border-neutral-800 rounded-lg p-6">
                                <h2 className="font-bold text-lg mb-4">Retrieved Chunks</h2>
                                <div className="space-y-4">
                                    {response.chunksUsed.map((chunk, i) => (
                                        <div key={chunk.id} className="border-l-2 border-neutral-700 pl-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="px-2 py-0.5 bg-neutral-800 rounded text-xs font-mono">
                                                    C{i + 1}
                                                </span>
                                                <span className="text-sm text-neutral-400">
                                                    {chunk.anchorCitation}
                                                </span>
                                                <span className="text-xs text-neutral-600">
                                                    (similarity: {(chunk.similarity * 100).toFixed(1)}%)
                                                </span>
                                            </div>
                                            <p className="text-sm text-neutral-500">{chunk.textExcerpt}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
