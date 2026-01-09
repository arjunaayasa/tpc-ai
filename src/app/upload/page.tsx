'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type DocumentType = 'PERATURAN' | 'PUTUSAN' | 'BUKU';

export default function UploadPage() {
    const [file, setFile] = useState<File | null>(null);
    const [docType, setDocType] = useState<DocumentType>('PERATURAN');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    const handleFile = (file: File) => {
        const validTypes = ['application/pdf', 'text/html', 'text/plain'];
        const validExtensions = ['.pdf', '.html', '.htm', '.txt'];

        const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
            setError('Invalid file type. Allowed: PDF, HTML, TXT');
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            setError('File too large. Maximum size is 50MB');
            return;
        }

        setFile(file);
        setError(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return;

        setUploading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('docType', docType);

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 409 && data.existingDocumentId) {
                    setError(`Duplicate file detected.`);
                    setTimeout(() => {
                        router.push(`/documents/${data.existingDocumentId}`);
                    }, 2000);
                    return;
                }
                throw new Error(data.error || 'Upload failed');
            }

            router.push(`/documents/${data.documentId}`);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Navigation */}
            <nav className="border-b border-neutral-800">
                <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
                    <Link href="/chat" className="font-semibold tracking-tight hover:text-emerald-400 transition-colors">TPC AI</Link>
                    <div className="flex gap-6 text-sm">
                        <Link href="/chat" className="text-neutral-400 hover:text-white transition-colors">
                            Chat
                        </Link>
                        <Link href="/documents" className="text-neutral-400 hover:text-white transition-colors">
                            Documents
                        </Link>
                        <Link href="/upload" className="text-white">
                            Upload
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-xl mx-auto px-6 py-16">
                <h1 className="text-2xl font-semibold mb-2">Upload Document</h1>
                <p className="text-neutral-500 text-sm mb-8">
                    PDF, HTML, or TXT files up to 50MB
                </p>

                <form onSubmit={handleSubmit}>
                    {/* Document Type Selector */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                            Jenis Dokumen
                        </label>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setDocType('PERATURAN')}
                                className={`flex-1 py-3 px-4 rounded-lg border transition-colors ${
                                    docType === 'PERATURAN'
                                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                                        : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
                                }`}
                            >
                                <div className="font-medium">Peraturan</div>
                                <div className="text-xs opacity-70 mt-1">UU, PP, PMK, PER, SE</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setDocType('PUTUSAN')}
                                className={`flex-1 py-3 px-4 rounded-lg border transition-colors ${
                                    docType === 'PUTUSAN'
                                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                                        : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
                                }`}
                            >
                                <div className="font-medium">Putusan</div>
                                <div className="text-xs opacity-70 mt-1">Putusan Pengadilan Pajak</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setDocType('BUKU')}
                                className={`flex-1 py-3 px-4 rounded-lg border transition-colors ${
                                    docType === 'BUKU'
                                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                                        : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
                                }`}
                            >
                                <div className="font-medium">Buku</div>
                                <div className="text-xs opacity-70 mt-1">Buku Perpajakan</div>
                            </button>
                        </div>
                    </div>

                    {/* Drop Zone */}
                    <div
                        className={`
              border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer
              ${dragActive ? 'border-white bg-neutral-900' : 'border-neutral-700 hover:border-neutral-500'}
              ${file ? 'border-white' : ''}
            `}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept=".pdf,.html,.htm,.txt,application/pdf,text/html,text/plain"
                            onChange={handleChange}
                        />

                        {file ? (
                            <div>
                                <p className="font-medium">{file.name}</p>
                                <p className="text-neutral-500 text-sm mt-1">
                                    {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                                    className="text-neutral-500 hover:text-white text-sm mt-3 underline"
                                >
                                    Remove
                                </button>
                            </div>
                        ) : (
                            <div>
                                <p className="text-neutral-400">Drop file here or click to browse</p>
                            </div>
                        )}
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mt-4 p-3 border border-red-500/50 rounded text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={!file || uploading}
                        className={`
              w-full mt-6 py-3 rounded font-medium transition-colors
              ${file && !uploading
                                ? 'bg-white text-black hover:bg-neutral-200'
                                : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                            }
            `}
                    >
                        {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                </form>
            </main>
        </div>
    );
}
