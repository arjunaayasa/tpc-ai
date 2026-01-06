'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function UploadPage() {
    const [file, setFile] = useState<File | null>(null);
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

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 409 && data.existingDocumentId) {
                    setError(`Duplicate file detected. View existing document.`);
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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <nav className="border-b border-slate-700/50 backdrop-blur-sm bg-slate-900/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                            Tax KB Ingestion
                        </h1>
                        <div className="flex gap-4">
                            <Link
                                href="/documents"
                                className="text-slate-300 hover:text-white transition-colors"
                            >
                                Documents
                            </Link>
                            <Link
                                href="/upload"
                                className="text-blue-400 hover:text-blue-300 transition-colors font-medium"
                            >
                                Upload
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-3xl mx-auto px-4 py-12">
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-white mb-2">Upload Document</h2>
                    <p className="text-slate-400">
                        Upload tax regulation documents (PDF, HTML, or TXT) for automatic metadata extraction.
                    </p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div
                        className={`
              relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200
              ${dragActive
                                ? 'border-blue-400 bg-blue-500/10'
                                : 'border-slate-600 hover:border-slate-500 bg-slate-800/50'
                            }
              ${file ? 'border-green-400 bg-green-500/10' : ''}
            `}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept=".pdf,.html,.htm,.txt,application/pdf,text/html,text/plain"
                            onChange={handleChange}
                        />

                        {file ? (
                            <div className="space-y-4">
                                <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
                                    <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-white font-medium">{file.name}</p>
                                    <p className="text-slate-400 text-sm">
                                        {(file.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setFile(null)}
                                    className="text-slate-400 hover:text-white text-sm underline"
                                >
                                    Choose different file
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="w-16 h-16 mx-auto bg-slate-700 rounded-full flex items-center justify-center">
                                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-white font-medium">Drop your file here</p>
                                    <p className="text-slate-400 text-sm">or click to browse</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                                >
                                    Browse Files
                                </button>
                                <p className="text-slate-500 text-xs">
                                    Supported formats: PDF, HTML, TXT (max 50MB)
                                </p>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={!file || uploading}
                        className={`
              w-full mt-6 py-4 rounded-xl font-semibold text-lg transition-all duration-200
              ${file && !uploading
                                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg shadow-blue-500/25'
                                : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                            }
            `}
                    >
                        {uploading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Uploading...
                            </span>
                        ) : (
                            'Upload & Extract Metadata'
                        )}
                    </button>
                </form>
            </main>
        </div>
    );
}
