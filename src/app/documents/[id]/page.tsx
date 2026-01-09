'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PutusanView from './PutusanView';
import { Pencil, Trash2, Check, PlayCircle, RotateCcw } from 'lucide-react';

interface Document {
    id: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    sha256: string;
    docType: string;
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
    reviewerName: string | null;
}

interface Chunk {
    id: string;
    pasal: string | null;
    ayat: string | null;
    huruf: string | null;
    chunkType: string;
    role: string;
    title: string | null;
    parentChunkId: string | null;
    legalRefs: { refs?: string[] } | null;
    orderIndex: number;
    anchorCitation: string;
    text: string;
    tokenEstimate: number | null;
}

interface GroupedChunk {
    pasal: string | null;
    anchorCitation: string;
    totalTokens: number;
    items: Chunk[];
}

interface TableRow {
    cells: string[];
}

interface DocumentTable {
    id: string;
    title: string;
    pageContext: string | null;
    headers: string[];
    rows: TableRow[];
    notes: string | null;
    orderIndex: number;
}

const jenisOptions = ['UU', 'PP', 'PMK', 'PER', 'SE', 'KEP', 'PUTUSAN', 'BUKU', 'UNKNOWN'];
const statusAturanOptions = ['berlaku', 'diubah', 'dicabut', 'unknown'];

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const [documentId, setDocumentId] = useState<string | null>(null);
    const [document, setDocument] = useState<Document | null>(null);
    const [chunks, setChunks] = useState<Chunk[]>([]);
    const [tables, setTables] = useState<DocumentTable[]>([]);
    const [chunkCount, setChunkCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [rerunning, setRerunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'metadata' | 'content'>('metadata');
    const [expandedPasals, setExpandedPasals] = useState<Set<string>>(new Set());
    const [expandedAyats, setExpandedAyats] = useState<Set<string>>(new Set());

    // Review modal state
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [reviewerName, setReviewerName] = useState('');

    // Edit chunk modal state
    const [editingChunk, setEditingChunk] = useState<Chunk | null>(null);
    const [editText, setEditText] = useState('');
    const [editTitle, setEditTitle] = useState('');

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
        fetchTables();
        const interval = setInterval(() => {
            if (document?.status === 'processing' || document?.status === 'uploaded') {
                fetchDocument();
                fetchChunks();
                fetchTables();
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
            const response = await fetch(`/api/documents/${documentId}/chunks?limit=500`);
            if (response.ok) {
                const data = await response.json();
                setChunks(data.chunks || []);
                setChunkCount(data.pagination?.total || 0);
            }
        } catch (err) {
            console.error('Failed to fetch chunks:', err);
        }
    };

    const fetchTables = async () => {
        if (!documentId) return;
        try {
            const response = await fetch(`/api/documents/${documentId}/tables`);
            if (response.ok) {
                const data = await response.json();
                setTables(data.tables || []);
            }
        } catch (err) {
            console.error('Failed to fetch tables:', err);
        }
    };

    const handleSave = async (approve: boolean = false, reviewName?: string) => {
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
                    reviewerName: reviewName,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to save');
            }

            setSuccess(approve ? `Approved by ${reviewName}` : 'Saved');
            setShowReviewModal(false);
            setReviewerName('');
            fetchDocument();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    // Start Review - just save the reviewer name, don't approve yet
    const handleStartReview = async () => {
        if (!documentId || !reviewerName.trim()) return;
        setSaving(true);
        setError(null);

        try {
            const response = await fetch(`/api/documents/${documentId}/metadata`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reviewerName: reviewerName.trim(),
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to start review');
            }

            setSuccess(`Review started by ${reviewerName.trim()}`);
            setShowReviewModal(false);
            setReviewerName('');
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

    // Chunk editing
    const handleEditChunk = (chunk: Chunk) => {
        setEditingChunk(chunk);
        setEditText(chunk.text);
        setEditTitle(chunk.title || '');
    };

    const handleSaveChunk = async () => {
        if (!documentId || !editingChunk) return;

        try {
            const response = await fetch(`/api/documents/${documentId}/chunks/${editingChunk.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: editText,
                    title: editTitle || null,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to update chunk');
            }

            setEditingChunk(null);
            setSuccess('Chunk updated');
            fetchChunks();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleDeleteChunk = async (chunkId: string) => {
        if (!documentId) return;
        if (!confirm('Delete this chunk?')) return;

        try {
            const response = await fetch(`/api/documents/${documentId}/chunks/${chunkId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error('Failed to delete chunk');
            }

            setSuccess('Chunk deleted');
            fetchChunks();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleDeleteDocument = async () => {
        if (!documentId) return;
        if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) return;

        try {
            const response = await fetch(`/api/documents/${documentId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error('Failed to delete document');
            }

            router.push('/documents');
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const toggleChunk = (id: string) => {
        setExpandedPasals(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleAyat = (id: string) => {
        setExpandedAyats(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Group chunks by Pasal
    const groupedChunks: GroupedChunk[] = chunks.reduce((acc, chunk) => {
        const key = chunk.pasal ?? chunk.anchorCitation;

        let group = acc.find(g => (g.pasal ?? g.anchorCitation) === key);
        if (!group) {
            group = {
                pasal: chunk.pasal,
                anchorCitation: chunk.anchorCitation,
                totalTokens: 0,
                items: [],
            };
            acc.push(group);
        }
        group.items.push(chunk);
        group.totalTokens += chunk.tokenEstimate ?? 0;
        return acc;
    }, [] as GroupedChunk[]);

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
            {/* Review Modal */}
            {showReviewModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold mb-4">Start Review</h3>
                        <p className="text-neutral-400 text-sm mb-4">
                            Enter your name to start reviewing this document. You can then edit the metadata and chunks before approving.
                        </p>
                        <input
                            type="text"
                            value={reviewerName}
                            onChange={(e) => setReviewerName(e.target.value)}
                            placeholder="Your name"
                            className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500 mb-4"
                            autoFocus
                        />
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowReviewModal(false);
                                    setReviewerName('');
                                }}
                                className="px-4 py-2 border border-neutral-700 rounded text-sm hover:border-neutral-500"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleStartReview}
                                disabled={saving || !reviewerName.trim()}
                                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Start Review'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Chunk Modal */}
            {editingChunk && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                        <h3 className="text-lg font-semibold mb-4">Edit Chunk</h3>
                        <div className="mb-4">
                            <label className="block text-neutral-500 text-sm mb-1">Title</label>
                            <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-white focus:outline-none focus:border-neutral-500"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block text-neutral-500 text-sm mb-1">Text</label>
                            <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                rows={12}
                                className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-white focus:outline-none focus:border-neutral-500 font-mono text-sm"
                            />
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setEditingChunk(null)}
                                className="px-4 py-2 border border-neutral-700 rounded text-sm hover:border-neutral-500"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveChunk}
                                className="px-4 py-2 bg-white text-black rounded text-sm font-medium hover:bg-neutral-200"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Navigation */}
            <nav className="border-b border-neutral-800">
                <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
                    <span className="font-semibold tracking-tight">TPC Ingestion</span>
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
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-xl font-semibold">{document.originalName}</h1>
                                <span className={`px-2 py-0.5 text-xs rounded font-medium ${document.docType === 'PUTUSAN'
                                    ? 'bg-purple-600 text-white'
                                    : document.docType === 'BUKU'
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-blue-600 text-white'
                                    }`}>
                                    {document.docType === 'PUTUSAN' ? 'Putusan' : document.docType === 'BUKU' ? 'Buku' : 'Peraturan'}
                                </span>
                            </div>
                            <p className="text-neutral-500 text-sm">
                                {document.status === 'approved' && '✓ Approved'}
                                {document.status === 'needs_review' && 'Needs Review'}
                                {document.status === 'processing' && 'Processing...'}
                                {document.status === 'uploaded' && 'Uploaded'}
                                {document.status === 'failed' && 'Failed'}
                                {chunkCount > 0 && ` • ${chunkCount} chunks`}
                            </p>
                            {/* Reviewer info */}
                            {document.metadata?.reviewerName && (
                                <p className="text-green-500 text-sm mt-1">
                                    Reviewed by: {document.metadata.reviewerName}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            {document.metadata && (
                                <div className="text-right">
                                    <p className="text-2xl font-semibold">{Math.round(document.metadata.confidence * 100)}%</p>
                                    <p className="text-neutral-500 text-xs">confidence</p>
                                </div>
                            )}
                            <button
                                onClick={handleDeleteDocument}
                                className="px-3 py-2 border border-red-600/50 text-red-400 rounded text-sm hover:bg-red-600/20 transition-colors flex items-center gap-1.5"
                                title="Delete Document"
                            >
                                <Trash2 size={14} /> Delete
                            </button>
                        </div>
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
                            {document.docType !== 'PUTUSAN' && (
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
                            )}

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
                                <label className="block text-neutral-500 text-sm mb-1">Status</label>
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
                            {/* Save Draft - only when not approved */}
                            {document.status !== 'approved' && (
                                <button
                                    onClick={() => handleSave(false)}
                                    disabled={saving || document.status === 'processing'}
                                    className="px-4 py-2 border border-neutral-700 rounded font-medium text-sm hover:border-neutral-500 transition-colors disabled:opacity-50"
                                >
                                    {saving ? 'Saving...' : 'Save Draft'}
                                </button>
                            )}

                            {/* Start Review - only when no reviewer yet */}
                            {!document.metadata?.reviewerName && document.status !== 'approved' && (
                                <button
                                    onClick={() => setShowReviewModal(true)}
                                    disabled={saving || document.status === 'processing'}
                                    className="px-4 py-2 bg-blue-600 text-white rounded font-medium text-sm hover:bg-blue-500 transition-colors disabled:opacity-50"
                                >
                                    Start Review
                                </button>
                            )}

                            {/* Approve - only when reviewer set but not approved yet */}
                            {document.metadata?.reviewerName && document.status !== 'approved' && (
                                <button
                                    onClick={() => handleSave(true, document.metadata?.reviewerName || undefined)}
                                    disabled={saving || document.status === 'processing'}
                                    className="px-4 py-2 bg-green-600 text-white rounded font-medium text-sm hover:bg-green-500 transition-colors disabled:opacity-50"
                                >
                                    {saving ? 'Approving...' : '✓ Approve Document'}
                                </button>
                            )}

                            {/* Already Approved */}
                            {document.status === 'approved' && (
                                <span className="px-4 py-2 bg-green-600/20 text-green-400 border border-green-600/50 rounded font-medium text-sm">
                                    ✓ Approved by {document.metadata?.reviewerName}
                                </span>
                            )}

                            {/* Re-extract - only when not approved */}
                            {document.status !== 'approved' && (
                                <button
                                    onClick={handleRerun}
                                    disabled={rerunning || document.status === 'processing'}
                                    className="px-4 py-2 border border-neutral-700 rounded font-medium text-sm hover:border-neutral-500 transition-colors disabled:opacity-50"
                                >
                                    {rerunning ? 'Queuing...' : 'Re-extract'}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Content Tab */}
                {activeTab === 'content' && (
                    <>
                        {document.docType === 'PUTUSAN' ? (
                            <PutusanView
                                documentId={document.id}
                                chunks={chunks}
                                tables={tables.map(t => ({
                                    title: t.title,
                                    headers: t.headers as string[],
                                    rows: t.rows as { cells: string[] }[],
                                    startOffset: 0,
                                    endOffset: 0,
                                }))}
                                metadata={{
                                    nomor: document.metadata?.nomor || null,
                                    tahun: document.metadata?.tahun || null,
                                    judul: document.metadata?.judul || null,
                                }}
                                onEditChunk={handleEditChunk}
                                onDeleteChunk={handleDeleteChunk}
                                isEditable={document.status !== 'approved'}
                            />
                        ) : (
                            <div className="border border-neutral-800 rounded-lg">
                                {chunks.length === 0 ? (
                                    <div className="p-8 text-center text-neutral-500">
                                        No content chunks extracted yet.
                                        {document.status === 'processing' && ' Processing...'}
                                    </div>
                                ) : (
                                    <div className="divide-y divide-neutral-800">
                                        {groupedChunks.map((group) => {
                                            const groupKey = group.pasal ?? group.anchorCitation;
                                            const isExpanded = expandedPasals.has(groupKey);
                                            const hasMultipleItems = group.items.length > 1;

                                            return (
                                                <div key={groupKey} className="p-4">
                                                    <button
                                                        onClick={() => toggleChunk(groupKey)}
                                                        className="w-full flex justify-between items-center text-left"
                                                    >
                                                        <div>
                                                            <span className="font-medium">
                                                                {group.pasal ? `Pasal ${group.pasal}` : group.anchorCitation}
                                                            </span>
                                                            <span className="text-neutral-500 text-sm ml-3">
                                                                ~{group.totalTokens} tokens
                                                                {hasMultipleItems && (
                                                                    <span className="ml-2 text-neutral-600">
                                                                        ({group.items.length} items)
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                        <span className="text-neutral-500">
                                                            {isExpanded ? '−' : '+'}
                                                        </span>
                                                    </button>

                                                    {isExpanded && (
                                                        <div className="mt-3 space-y-2">
                                                            {group.items.map((chunk) => (
                                                                <div key={chunk.id} className="border border-neutral-800 rounded p-3">
                                                                    <div className="flex justify-between items-start mb-2">
                                                                        <span className="text-neutral-400 text-sm">
                                                                            {chunk.title || chunk.chunkType}
                                                                        </span>
                                                                        <div className="flex gap-2">
                                                                            <button
                                                                                onClick={() => handleEditChunk(chunk)}
                                                                                className="text-neutral-500 hover:text-white text-sm"
                                                                                title="Edit"
                                                                            >
                                                                                ✏️
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleDeleteChunk(chunk.id)}
                                                                                className="text-neutral-500 hover:text-red-400 text-sm"
                                                                                title="Delete"
                                                                            >
                                                                                🗑️
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-sm text-neutral-300 whitespace-pre-wrap">
                                                                        {chunk.text.length > 500
                                                                            ? chunk.text.slice(0, 500) + '...'
                                                                            : chunk.text
                                                                        }
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )
                }
            </main >
        </div >
    );
}
