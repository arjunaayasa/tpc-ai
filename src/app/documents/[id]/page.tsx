'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Document {
    id: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    sha256: string;
    status: string;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
    metadata: Metadata | null;
}

interface Metadata {
    id: string;
    jenis: string;
    nomor: string | null;
    tahun: number | null;
    judul: string | null;
    tanggalTerbit: string | null;
    tanggalBerlaku: string | null;
    statusAturan: string;
    confidence: number;
    updatedByUser: boolean;
}

interface Chunk {
    id: string;
    pasal: string | null;
    ayat: string | null;
    huruf: string | null;
    orderIndex: number;
    anchorCitation: string;
    text: string;
    tokenEstimate: number | null;
}

const jenisOptions = ['UU', 'PP', 'PMK', 'PER', 'SE', 'KEP', 'UNKNOWN'];
const statusAturanOptions = ['berlaku', 'diubah', 'dicabut', 'unknown'];

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const [documentId, setDocumentId] = useState<string | null>(null);
    const [document, setDocument] = useState<Document | null>(null);
    const [chunks, setChunks] = useState<Chunk[]>([]);
    const [chunkCount, setChunkCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [rerunning, setRerunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'metadata' | 'content'>('metadata');
    const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());

    const [formData, setFormData] = useState({
        jenis: 'UNKNOWN',
        nomor: '',
        tahun: '',
        judul: '',
        tanggalTerbit: '',
        tanggalBerlaku: '',
        statusAturan: 'unknown',
    });

    useEffect(() => {
        params.then(p => setDocumentId(p.id));
    }, [params]);

    useEffect(() => {
        if (!documentId) return;
        fetchDocument();
        fetchChunks();
        const interval = setInterval(() => {
            if (document?.status === 'processing' || document?.status === 'uploaded') {
                fetchDocument();
                fetchChunks();
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [documentId, document?.status]);

    const fetchDocument = async () => {
        if (!documentId) return;
        try {
            const response = await fetch(`/api/documents/${documentId}`);
            if (!response.ok) {
                if (response.status === 404) {
                    setError('Document not found');
                    return;
                }
                throw new Error('Failed to fetch document');
            }
            const data = await response.json();
            setDocument(data);

            if (data.metadata) {
                setFormData({
                    jenis: data.metadata.jenis || 'UNKNOWN',
                    nomor: data.metadata.nomor || '',
                    tahun: data.metadata.tahun?.toString() || '',
                    judul: data.metadata.judul || '',
                    tanggalTerbit: data.metadata.tanggalTerbit?.split('T')[0] || '',
                    tanggalBerlaku: data.metadata.tanggalBerlaku?.split('T')[0] || '',
                    statusAturan: data.metadata.statusAturan || 'unknown',
                });
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const fetchChunks = async () => {
        if (!documentId) return;
        try {
            const response = await fetch(`/api/documents/${documentId}/chunks?limit=100`);
            if (response.ok) {
                const data = await response.json();
                setChunks(data.chunks || []);
                setChunkCount(data.pagination?.total || 0);
            }
        } catch (err) {
            console.error('Failed to fetch chunks:', err);
        }
    };

    const handleSave = async (approve: boolean = false) => {
        if (!documentId) return;
        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await fetch(`/api/documents/${documentId}/metadata`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jenis: formData.jenis,
                    nomor: formData.nomor || null,
                    tahun: formData.tahun ? parseInt(formData.tahun) : null,
                    judul: formData.judul || null,
                    tanggalTerbit: formData.tanggalTerbit || null,
                    tanggalBerlaku: formData.tanggalBerlaku || null,
                    statusAturan: formData.statusAturan,
                    approve,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to save');
            }

            setSuccess(approve ? 'Approved' : 'Saved');
            fetchDocument();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleRerun = async () => {
        if (!documentId) return;
        setRerunning(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await fetch(`/api/documents/${documentId}/rerun`, {
                method: 'POST',
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to rerun');
            }

            setSuccess('Re-extraction queued');
            fetchDocument();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setRerunning(false);
        }
    };

    const toggleChunk = (id: string) => {
        setExpandedChunks(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black text-white flex items-center justify-center">
                <p className="text-neutral-500">Loading...</p>
            </div>
        );
    }

    if (!document) {
        return (
            <div className="min-h-screen bg-black text-white flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-400 mb-4">{error || 'Document not found'}</p>
                    <Link href="/documents" className="underline">Back</Link>
                </div>
            </div>
        );
    }

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
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-4xl mx-auto px-6 py-10">
                <Link href="/documents" className="text-neutral-500 hover:text-white text-sm mb-6 inline-block">
                    ← Back
                </Link>

                {/* Alerts */}
                {error && (
                    <div className="mb-4 p-3 border border-red-500/50 rounded text-red-400 text-sm">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="mb-4 p-3 border border-neutral-700 rounded text-white text-sm">
                        {success}
                    </div>
                )}

                {/* Document Info */}
                <div className="border border-neutral-800 rounded-lg p-6 mb-6">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h1 className="text-xl font-semibold">{document.originalName}</h1>
                            <p className="text-neutral-500 text-sm mt-1">
                                {document.status === 'approved' && 'Approved'}
                                {document.status === 'needs_review' && 'Needs Review'}
                                {document.status === 'processing' && 'Processing...'}
                                {document.status === 'uploaded' && 'Uploaded'}
                                {document.status === 'failed' && 'Failed'}
                                {chunkCount > 0 && ` • ${chunkCount} chunks`}
                            </p>
                        </div>
                        {document.metadata && (
                            <div className="text-right">
                                <p className="text-2xl font-semibold">{Math.round(document.metadata.confidence * 100)}%</p>
                                <p className="text-neutral-500 text-xs">confidence</p>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-neutral-500">SHA256</p>
                            <p className="font-mono text-xs text-neutral-400 break-all">{document.sha256}</p>
                        </div>
                        <div>
                            <p className="text-neutral-500">Type</p>
                            <p className="text-neutral-400">{document.mimeType}</p>
                        </div>
                    </div>

                    {document.lastError && (
                        <div className="mt-4 p-3 border border-red-500/30 rounded text-red-400 text-sm">
                            Error: {document.lastError}
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-4 mb-6 border-b border-neutral-800">
                    <button
                        onClick={() => setActiveTab('metadata')}
                        className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'metadata'
                                ? 'border-white text-white'
                                : 'border-transparent text-neutral-500 hover:text-white'
                            }`}
                    >
                        Metadata
                    </button>
                    <button
                        onClick={() => setActiveTab('content')}
                        className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'content'
                                ? 'border-white text-white'
                                : 'border-transparent text-neutral-500 hover:text-white'
                            }`}
                    >
                        Content ({chunkCount})
                    </button>
                </div>

                {/* Metadata Tab */}
                {activeTab === 'metadata' && (
                    <div className="border border-neutral-800 rounded-lg p-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-neutral-500 text-sm mb-1">Type</label>
                                <select
                                    value={formData.jenis}
                                    onChange={(e) => setFormData({ ...formData, jenis: e.target.value })}
                                    className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-white focus:outline-none focus:border-neutral-500"
                                >
                                    {jenisOptions.map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-neutral-500 text-sm mb-1">Number</label>
                                <input
                                    type="text"
                                    value={formData.nomor}
                                    onChange={(e) => setFormData({ ...formData, nomor: e.target.value })}
                                    placeholder="e.g., 36/PMK.03/2024"
                                    className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
                                />
                            </div>

                            <div>
                                <label className="block text-neutral-500 text-sm mb-1">Year</label>
                                <input
                                    type="number"
                                    value={formData.tahun}
                                    onChange={(e) => setFormData({ ...formData, tahun: e.target.value })}
                                    placeholder="2024"
                                    className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
                                />
                            </div>

                            <div>
                                <label className="block text-neutral-500 text-sm mb-1">Regulation Status</label>
                                <select
                                    value={formData.statusAturan}
                                    onChange={(e) => setFormData({ ...formData, statusAturan: e.target.value })}
                                    className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-white focus:outline-none focus:border-neutral-500"
                                >
                                    {statusAturanOptions.map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-span-2">
                                <label className="block text-neutral-500 text-sm mb-1">Title</label>
                                <textarea
                                    value={formData.judul}
                                    onChange={(e) => setFormData({ ...formData, judul: e.target.value })}
                                    placeholder="Document title..."
                                    rows={2}
                                    className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500 resize-none"
                                />
                            </div>

                            <div>
                                <label className="block text-neutral-500 text-sm mb-1">Issue Date</label>
                                <input
                                    type="date"
                                    value={formData.tanggalTerbit}
                                    onChange={(e) => setFormData({ ...formData, tanggalTerbit: e.target.value })}
                                    className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-white focus:outline-none focus:border-neutral-500"
                                />
                            </div>

                            <div>
                                <label className="block text-neutral-500 text-sm mb-1">Effective Date</label>
                                <input
                                    type="date"
                                    value={formData.tanggalBerlaku}
                                    onChange={(e) => setFormData({ ...formData, tanggalBerlaku: e.target.value })}
                                    className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-white focus:outline-none focus:border-neutral-500"
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 mt-8">
                            <button
                                onClick={() => handleSave(false)}
                                disabled={saving || document.status === 'processing'}
                                className="px-4 py-2 border border-neutral-700 rounded font-medium text-sm hover:border-neutral-500 transition-colors disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Save Draft'}
                            </button>

                            <button
                                onClick={() => handleSave(true)}
                                disabled={saving || document.status === 'processing' || document.status === 'approved'}
                                className="px-4 py-2 bg-white text-black rounded font-medium text-sm hover:bg-neutral-200 transition-colors disabled:opacity-50"
                            >
                                {document.status === 'approved' ? 'Approved' : 'Approve'}
                            </button>

                            <button
                                onClick={handleRerun}
                                disabled={rerunning || document.status === 'processing'}
                                className="px-4 py-2 border border-neutral-700 rounded font-medium text-sm hover:border-neutral-500 transition-colors disabled:opacity-50"
                            >
                                {rerunning ? 'Queuing...' : 'Re-extract'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Content Tab */}
                {activeTab === 'content' && (
                    <div className="border border-neutral-800 rounded-lg">
                        {chunks.length === 0 ? (
                            <div className="p-8 text-center text-neutral-500">
                                No content chunks extracted yet.
                                {document.status === 'processing' && ' Processing...'}
                            </div>
                        ) : (
                            <div className="divide-y divide-neutral-800">
                                {chunks.map((chunk) => (
                                    <div key={chunk.id} className="p-4">
                                        <button
                                            onClick={() => toggleChunk(chunk.id)}
                                            className="w-full flex justify-between items-center text-left"
                                        >
                                            <div>
                                                <span className="font-medium">
                                                    {chunk.pasal ? `Pasal ${chunk.pasal}` : chunk.anchorCitation}
                                                </span>
                                                <span className="text-neutral-500 text-sm ml-3">
                                                    ~{chunk.tokenEstimate} tokens
                                                </span>
                                            </div>
                                            <span className="text-neutral-500">
                                                {expandedChunks.has(chunk.id) ? '−' : '+'}
                                            </span>
                                        </button>
                                        {expandedChunks.has(chunk.id) && (
                                            <div className="mt-3 p-3 bg-neutral-900 rounded text-sm text-neutral-300 whitespace-pre-wrap">
                                                {chunk.text}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
