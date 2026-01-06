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

const jenisOptions = ['UU', 'PP', 'PMK', 'PER', 'SE', 'KEP', 'UNKNOWN'];
const statusAturanOptions = ['berlaku', 'diubah', 'dicabut', 'unknown'];

const statusColors: Record<string, string> = {
    uploaded: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    processing: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    needs_review: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    approved: 'bg-green-500/20 text-green-300 border-green-500/30',
    failed: 'bg-red-500/20 text-red-300 border-red-500/30',
};

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const [documentId, setDocumentId] = useState<string | null>(null);
    const [document, setDocument] = useState<Document | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [rerunning, setRerunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Form state
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
        // Poll for updates if processing
        const interval = setInterval(() => {
            if (document?.status === 'processing' || document?.status === 'uploaded') {
                fetchDocument();
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

            // Populate form with metadata
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

    const handleSaveDraft = async () => {
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
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to save');
            }

            setSuccess('Draft saved successfully');
            fetchDocument();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleApprove = async () => {
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
                    approve: true,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to approve');
            }

            setSuccess('Document approved!');
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

            setSuccess('Re-extraction job queued');
            fetchDocument();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setRerunning(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="text-white flex items-center gap-3">
                    <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Loading document...
                </div>
            </div>
        );
    }

    if (!document) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-400 mb-4">{error || 'Document not found'}</p>
                    <Link href="/documents" className="text-blue-400 hover:text-blue-300 underline">
                        Back to documents
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <nav className="border-b border-slate-700/50 backdrop-blur-sm bg-slate-900/50 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                            Tax KB Ingestion
                        </h1>
                        <div className="flex gap-4">
                            <Link href="/documents" className="text-slate-300 hover:text-white transition-colors">
                                Documents
                            </Link>
                            <Link href="/upload" className="text-slate-300 hover:text-white transition-colors">
                                Upload
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-4xl mx-auto px-4 py-8">
                <Link
                    href="/documents"
                    className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to documents
                </Link>

                {/* Alerts */}
                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="mb-6 p-4 bg-green-500/10 border border-green-500/50 rounded-lg text-green-400">
                        {success}
                    </div>
                )}

                {/* Document Info */}
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6 mb-6">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-2">{document.originalName}</h2>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors[document.status]}`}>
                                {document.status.replace('_', ' ').toUpperCase()}
                            </span>
                        </div>
                        {document.metadata && (
                            <div className="text-right">
                                <div className="text-slate-400 text-sm">Confidence</div>
                                <div className="text-2xl font-bold text-white">
                                    {Math.round(document.metadata.confidence * 100)}%
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-slate-400">SHA256:</span>
                            <p className="text-slate-300 font-mono text-xs break-all">{document.sha256}</p>
                        </div>
                        <div>
                            <span className="text-slate-400">MIME Type:</span>
                            <p className="text-slate-300">{document.mimeType}</p>
                        </div>
                        <div>
                            <span className="text-slate-400">Created:</span>
                            <p className="text-slate-300">
                                {new Date(document.createdAt).toLocaleString('id-ID')}
                            </p>
                        </div>
                        <div>
                            <span className="text-slate-400">Updated:</span>
                            <p className="text-slate-300">
                                {new Date(document.updatedAt).toLocaleString('id-ID')}
                            </p>
                        </div>
                    </div>

                    {document.lastError && (
                        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                            <span className="text-red-400 text-sm font-medium">Error: </span>
                            <span className="text-red-300 text-sm">{document.lastError}</span>
                        </div>
                    )}
                </div>

                {/* Metadata Form */}
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
                    <h3 className="text-xl font-bold text-white mb-6">Metadata</h3>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-slate-400 text-sm mb-2">Jenis Dokumen</label>
                            <select
                                value={formData.jenis}
                                onChange={(e) => setFormData({ ...formData, jenis: e.target.value })}
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                            >
                                {jenisOptions.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-slate-400 text-sm mb-2">Nomor</label>
                            <input
                                type="text"
                                value={formData.nomor}
                                onChange={(e) => setFormData({ ...formData, nomor: e.target.value })}
                                placeholder="e.g., 36/PMK.03/2024"
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-slate-400 text-sm mb-2">Tahun</label>
                            <input
                                type="number"
                                value={formData.tahun}
                                onChange={(e) => setFormData({ ...formData, tahun: e.target.value })}
                                placeholder="e.g., 2024"
                                min="1900"
                                max="2100"
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-slate-400 text-sm mb-2">Status Aturan</label>
                            <select
                                value={formData.statusAturan}
                                onChange={(e) => setFormData({ ...formData, statusAturan: e.target.value })}
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                            >
                                {statusAturanOptions.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>

                        <div className="col-span-2">
                            <label className="block text-slate-400 text-sm mb-2">Judul</label>
                            <textarea
                                value={formData.judul}
                                onChange={(e) => setFormData({ ...formData, judul: e.target.value })}
                                placeholder="Document title..."
                                rows={3}
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                            />
                        </div>

                        <div>
                            <label className="block text-slate-400 text-sm mb-2">Tanggal Terbit</label>
                            <input
                                type="date"
                                value={formData.tanggalTerbit}
                                onChange={(e) => setFormData({ ...formData, tanggalTerbit: e.target.value })}
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-slate-400 text-sm mb-2">Tanggal Berlaku</label>
                            <input
                                type="date"
                                value={formData.tanggalBerlaku}
                                onChange={(e) => setFormData({ ...formData, tanggalBerlaku: e.target.value })}
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-4 mt-8">
                        <button
                            onClick={handleSaveDraft}
                            disabled={saving || document.status === 'processing'}
                            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? 'Saving...' : 'Save Draft'}
                        </button>

                        <button
                            onClick={handleApprove}
                            disabled={saving || document.status === 'processing' || document.status === 'approved'}
                            className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-medium transition-all shadow-lg shadow-green-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                        >
                            {document.status === 'approved' ? 'Already Approved' : 'Approve'}
                        </button>

                        <button
                            onClick={handleRerun}
                            disabled={rerunning || document.status === 'processing'}
                            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <svg className={`w-4 h-4 ${rerunning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            {rerunning ? 'Queuing...' : 'Re-run Extraction'}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
