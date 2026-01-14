'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PutusanView from './PutusanView';
import { Pencil, Trash2, Check, PlayCircle, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

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

const jenisOptions = ['UU', 'PERPU', 'PP', 'PMK', 'PER', 'SE', 'KEP', 'NOTA_DINAS', 'PUTUSAN', 'BUKU', 'UNKNOWN'];
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

    // Add chunk modal state
    const [showAddChunkModal, setShowAddChunkModal] = useState(false);
    const [newChunkTitle, setNewChunkTitle] = useState('');
    const [newChunkText, setNewChunkText] = useState('');
    const [newChunkType, setNewChunkType] = useState('SECTION');
    const [addingChunk, setAddingChunk] = useState(false);

    // Selected chunk for split view
    const [selectedChunk, setSelectedChunk] = useState<Chunk | null>(null);

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
            const response = await fetch(`/api/documents/${documentId}/chunks?limit=10000`);
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

    const handleAddChunk = async () => {
        if (!documentId || !newChunkText.trim()) return;
        setAddingChunk(true);
        setError(null);

        try {
            const response = await fetch(`/api/documents/${documentId}/chunks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newChunkTitle || null,
                    text: newChunkText.trim(),
                    chunkType: newChunkType,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to add chunk');
            }

            setSuccess('Chunk added successfully');
            setShowAddChunkModal(false);
            setNewChunkTitle('');
            setNewChunkText('');
            setNewChunkType('SECTION');
            fetchChunks();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setAddingChunk(false);
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

            {/* Add Chunk Modal */}
            {showAddChunkModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                        <h3 className="text-lg font-semibold mb-4">Add New Chunk</h3>
                        <div className="mb-4">
                            <label className="block text-neutral-500 text-sm mb-1">Title (optional)</label>
                            <input
                                type="text"
                                value={newChunkTitle}
                                onChange={(e) => setNewChunkTitle(e.target.value)}
                                placeholder="e.g., Pasal 1, Section A, etc."
                                className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block text-neutral-500 text-sm mb-1">Chunk Type</label>
                            <select
                                value={newChunkType}
                                onChange={(e) => setNewChunkType(e.target.value)}
                                className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-white focus:outline-none focus:border-neutral-500"
                            >
                                <option value="SECTION">SECTION</option>
                                <option value="PASAL">PASAL</option>
                                <option value="AYAT">AYAT</option>
                                <option value="PREAMBLE">PREAMBLE</option>
                                <option value="LAMPIRAN">LAMPIRAN</option>
                                <option value="ND_ISI_ITEM">ND_ISI_ITEM</option>
                                <option value="ND_PEMBUKA">ND_PEMBUKA</option>
                            </select>
                        </div>
                        <div className="mb-4">
                            <label className="block text-neutral-500 text-sm mb-1">Text Content *</label>
                            <textarea
                                value={newChunkText}
                                onChange={(e) => setNewChunkText(e.target.value)}
                                rows={10}
                                placeholder="Enter the chunk text content..."
                                className="w-full bg-black border border-neutral-700 rounded px-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500 font-mono text-sm"
                            />
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowAddChunkModal(false);
                                    setNewChunkTitle('');
                                    setNewChunkText('');
                                    setNewChunkType('SECTION');
                                }}
                                className="px-4 py-2 border border-neutral-700 rounded text-sm hover:border-neutral-500"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddChunk}
                                disabled={addingChunk || !newChunkText.trim()}
                                className="px-4 py-2 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                            >
                                {addingChunk ? 'Adding...' : 'Add Chunk'}
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
                            <div className="border border-neutral-800 rounded-lg h-[70vh] flex">
                                {chunks.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center text-neutral-500">
                                        No content chunks extracted yet.
                                        {document.status === 'processing' && ' Processing...'}
                                    </div>
                                ) : (
                                    <>
                                        {/* Left Sidebar - Hierarchical Chunk Tree */}
                                        <div className="w-72 border-r border-neutral-800 overflow-y-auto">
                                            <div className="p-2 border-b border-neutral-800 bg-neutral-900 sticky top-0 flex items-center justify-between">
                                                <span className="text-sm text-neutral-400">{chunks.length} chunks</span>
                                                {document.status !== 'approved' && (
                                                    <button
                                                        onClick={() => setShowAddChunkModal(true)}
                                                        className="px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-500 transition-colors"
                                                    >
                                                        + Add
                                                    </button>
                                                )}
                                            </div>
                                            <div>
                                                {/* Non-Pasal chunks (PREAMBLE, MENIMBANG, etc.), SE chunks, Nota Dinas chunks, and TABLEs */}
                                                {chunks.filter(c => !c.pasal || ['PREAMBLE', 'MENIMBANG', 'MENGINGAT', 'PENETAPAN', 'PENUTUP', 'SECTION', 'SUBSECTION', 'PENJELASAN_UMUM', 'PENJELASAN_PASAL', 'PENJELASAN_AYAT', 'HEADING_SECTION', 'LAMPIRAN', 'LAMPIRAN_SECTION', 'BAB', 'BAGIAN', 'PARAGRAF', 'ND_HEADER', 'ND_PEMBUKA', 'ND_ISI_ITEM', 'ND_SUB_ITEM', 'ND_SUB_SUB_ITEM', 'ND_PENEGASAN', 'ND_PENUTUP', 'ND_LAMPIRAN_SECTION', 'TABLE'].includes(c.chunkType)).map((chunk) => (
                                                    <button
                                                        key={chunk.id}
                                                        onClick={() => setSelectedChunk(chunk)}
                                                        className={`w-full text-left p-3 border-b border-neutral-800 hover:bg-neutral-800 transition-colors ${selectedChunk?.id === chunk.id ? 'bg-neutral-800 border-l-2 border-blue-500' : ''
                                                            }`}
                                                    >
                                                        <div className="text-sm font-medium truncate">
                                                            {chunk.title || chunk.chunkType}
                                                        </div>
                                                        <div className="text-xs text-neutral-600 mt-1">
                                                            ~{chunk.tokenEstimate || 0} tokens
                                                        </div>
                                                    </button>
                                                ))}

                                                {/* Pasal groups with nested Ayat */}
                                                {(() => {
                                                    const pasalGroups = new Map<string, { pasal: Chunk | null; ayats: Chunk[] }>();
                                                    chunks.forEach(chunk => {
                                                        if (chunk.pasal && chunk.chunkType === 'PASAL') {
                                                            if (!pasalGroups.has(chunk.pasal)) {
                                                                pasalGroups.set(chunk.pasal, { pasal: chunk, ayats: [] });
                                                            } else {
                                                                pasalGroups.get(chunk.pasal)!.pasal = chunk;
                                                            }
                                                        } else if (chunk.pasal && chunk.chunkType === 'AYAT') {
                                                            if (!pasalGroups.has(chunk.pasal)) {
                                                                pasalGroups.set(chunk.pasal, { pasal: null, ayats: [] });
                                                            }
                                                            pasalGroups.get(chunk.pasal)!.ayats.push(chunk);
                                                        }
                                                    });

                                                    const sortedPasals = Array.from(pasalGroups.entries())
                                                        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

                                                    return sortedPasals.map(([pasalNum, group]) => {
                                                        const isExpanded = expandedPasals.has(pasalNum);
                                                        const hasAyats = group.ayats.length > 0;
                                                        const mainChunk = group.pasal || group.ayats[0];

                                                        return (
                                                            <div key={pasalNum} className="border-b border-neutral-800">
                                                                <div className="flex">
                                                                    {hasAyats && (
                                                                        <button
                                                                            onClick={() => toggleChunk(pasalNum)}
                                                                            className="px-2 text-neutral-500 hover:text-white"
                                                                        >
                                                                            {isExpanded ? '▼' : '▶'}
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        onClick={() => mainChunk && setSelectedChunk(mainChunk)}
                                                                        className={`flex-1 text-left p-3 hover:bg-neutral-800 transition-colors ${selectedChunk?.id === mainChunk?.id ? 'bg-neutral-800 border-l-2 border-blue-500' : ''
                                                                            } ${!hasAyats ? 'pl-7' : ''}`}
                                                                    >
                                                                        <div className="text-sm font-medium truncate">
                                                                            Pasal {pasalNum}
                                                                        </div>
                                                                        <div className="text-xs text-neutral-600 mt-1">
                                                                            ~{mainChunk?.tokenEstimate || 0} tokens
                                                                            {hasAyats && <span className="ml-1 text-neutral-500">• {group.ayats.length} ayat</span>}
                                                                        </div>
                                                                    </button>
                                                                </div>

                                                                {isExpanded && hasAyats && (
                                                                    <div className="bg-neutral-900/50">
                                                                        {group.ayats.sort((a, b) => parseInt(a.ayat || '0') - parseInt(b.ayat || '0')).map((ayat) => (
                                                                            <button
                                                                                key={ayat.id}
                                                                                onClick={() => setSelectedChunk(ayat)}
                                                                                className={`w-full text-left pl-10 pr-3 py-2 hover:bg-neutral-800 transition-colors border-t border-neutral-800/50 ${selectedChunk?.id === ayat.id ? 'bg-neutral-800 border-l-2 border-blue-500' : ''
                                                                                    }`}
                                                                            >
                                                                                <div className="text-sm truncate text-neutral-300">
                                                                                    Ayat ({ayat.ayat})
                                                                                </div>
                                                                                <div className="text-xs text-neutral-600">
                                                                                    ~{ayat.tokenEstimate || 0} tokens
                                                                                </div>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    });
                                                })()}
                                            </div>
                                        </div>

                                        {/* Right Panel - Content */}
                                        <div className="flex-1 overflow-y-auto">
                                            {selectedChunk ? (
                                                <div className="p-6">
                                                    <div className="flex justify-between items-start mb-4">
                                                        <div>
                                                            <h3 className="text-lg font-semibold">
                                                                {selectedChunk.title || selectedChunk.chunkType}
                                                            </h3>
                                                            <p className="text-sm text-neutral-500 mt-1">
                                                                {selectedChunk.anchorCitation}
                                                            </p>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => handleEditChunk(selectedChunk)}
                                                                className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded"
                                                                title="Edit"
                                                            >
                                                                <Pencil size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteChunk(selectedChunk.id)}
                                                                className="p-2 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 rounded"
                                                                title="Delete"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="text-xs text-neutral-600 mb-4 flex gap-4">
                                                        {selectedChunk.pasal && <span>Pasal: {selectedChunk.pasal}</span>}
                                                        {selectedChunk.ayat && <span>Ayat: {selectedChunk.ayat}</span>}
                                                        <span>Type: {selectedChunk.chunkType}</span>
                                                        <span>Tokens: ~{selectedChunk.tokenEstimate || 0}</span>
                                                    </div>

                                                    <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900 overflow-auto">
                                                        {selectedChunk.chunkType === 'TABLE' ? (
                                                            <div className="markdown-table">
                                                                <ReactMarkdown>
                                                                    {selectedChunk.text}
                                                                </ReactMarkdown>
                                                            </div>
                                                        ) : (
                                                            <pre className="whitespace-pre-wrap text-sm text-neutral-300 font-mono">
                                                                {selectedChunk.text}
                                                            </pre>
                                                        )}
                                                    </div>

                                                    {selectedChunk.legalRefs && selectedChunk.legalRefs.refs && selectedChunk.legalRefs.refs.length > 0 && (
                                                        <div className="mt-4 p-3 border border-neutral-800 rounded-lg">
                                                            <h4 className="text-sm font-medium text-neutral-400 mb-2">Legal References</h4>
                                                            <div className="flex flex-wrap gap-2">
                                                                {selectedChunk.legalRefs.refs.map((ref, i) => (
                                                                    <span key={i} className="text-xs bg-neutral-800 px-2 py-1 rounded">
                                                                        {ref}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex-1 flex items-center justify-center text-neutral-500 h-full">
                                                    Select a chunk from the list to view its content
                                                </div>
                                            )}
                                        </div>
                                    </>
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
