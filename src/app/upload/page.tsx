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
                    <span className="font-semibold tracking-tight">Tax KB</span>
                    <div className="flex gap-6 text-sm">
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
