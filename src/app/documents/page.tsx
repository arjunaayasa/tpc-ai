import Link from 'next/link';
import prisma from '@/lib/prisma';

type DocumentStatus = 'uploaded' | 'processing' | 'needs_review' | 'approved' | 'failed';

interface DocumentWithMetadata {
    id: string;
    originalName: string;
    status: DocumentStatus;
    updatedAt: Date;
    metadata: {
        jenis: string;
        nomor: string | null;
        tahun: number | null;
    } | null;
}

interface SearchParams {
    status?: string;
}

async function getDocuments(status?: DocumentStatus): Promise<DocumentWithMetadata[]> {
    const where = status ? { status } : {};
    return prisma.document.findMany({
        where,
        include: { metadata: true },
        orderBy: { updatedAt: 'desc' },
    }) as unknown as DocumentWithMetadata[];
}

const statusColors: Record<DocumentStatus, string> = {
    uploaded: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    processing: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    needs_review: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    approved: 'bg-green-500/20 text-green-300 border-green-500/30',
    failed: 'bg-red-500/20 text-red-300 border-red-500/30',
};

const statusLabels: Record<DocumentStatus, string> = {
    uploaded: 'Uploaded',
    processing: 'Processing',
    needs_review: 'Needs Review',
    approved: 'Approved',
    failed: 'Failed',
};

export default async function DocumentsPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const params = await searchParams;
    const statusFilter = params.status as DocumentStatus | undefined;
    const documents = await getDocuments(statusFilter);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <nav className="border-b border-slate-700/50 backdrop-blur-sm bg-slate-900/50 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                            Tax KB Ingestion
                        </h1>
                        <div className="flex gap-4">
                            <Link
                                href="/documents"
                                className="text-blue-400 hover:text-blue-300 transition-colors font-medium"
                            >
                                Documents
                            </Link>
                            <Link
                                href="/upload"
                                className="text-slate-300 hover:text-white transition-colors"
                            >
                                Upload
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-3xl font-bold text-white mb-2">Documents</h2>
                        <p className="text-slate-400">
                            {documents.length} document{documents.length !== 1 ? 's' : ''} found
                        </p>
                    </div>
                    <Link
                        href="/upload"
                        className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-xl font-semibold transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Upload New
                    </Link>
                </div>

                {/* Status Filter */}
                <div className="flex gap-2 mb-6 flex-wrap">
                    <Link
                        href="/documents"
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!statusFilter
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                    >
                        All
                    </Link>
                    {Object.entries(statusLabels).map(([status, label]) => (
                        <Link
                            key={status}
                            href={`/documents?status=${status}`}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === status
                                ? 'bg-blue-500 text-white'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                }`}
                        >
                            {label}
                        </Link>
                    ))}
                </div>

                {/* Documents Table */}
                {documents.length === 0 ? (
                    <div className="text-center py-16 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                        <div className="w-16 h-16 mx-auto bg-slate-700 rounded-full flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <p className="text-slate-400 mb-4">No documents found</p>
                        <Link
                            href="/upload"
                            className="text-blue-400 hover:text-blue-300 underline"
                        >
                            Upload your first document
                        </Link>
                    </div>
                ) : (
                    <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-700/50">
                                        <th className="text-left py-4 px-6 text-slate-400 font-medium text-sm">File Name</th>
                                        <th className="text-left py-4 px-6 text-slate-400 font-medium text-sm">Jenis</th>
                                        <th className="text-left py-4 px-6 text-slate-400 font-medium text-sm">Nomor</th>
                                        <th className="text-left py-4 px-6 text-slate-400 font-medium text-sm">Tahun</th>
                                        <th className="text-left py-4 px-6 text-slate-400 font-medium text-sm">Status</th>
                                        <th className="text-left py-4 px-6 text-slate-400 font-medium text-sm">Updated</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {documents.map((doc) => (
                                        <tr
                                            key={doc.id}
                                            className="border-b border-slate-700/30 hover:bg-slate-700/30 transition-colors"
                                        >
                                            <td className="py-4 px-6">
                                                <Link
                                                    href={`/documents/${doc.id}`}
                                                    className="text-white hover:text-blue-400 transition-colors font-medium"
                                                >
                                                    {doc.originalName}
                                                </Link>
                                            </td>
                                            <td className="py-4 px-6 text-slate-300">
                                                {doc.metadata?.jenis || '-'}
                                            </td>
                                            <td className="py-4 px-6 text-slate-300">
                                                {doc.metadata?.nomor || '-'}
                                            </td>
                                            <td className="py-4 px-6 text-slate-300">
                                                {doc.metadata?.tahun || '-'}
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors[doc.status]}`}>
                                                    {statusLabels[doc.status]}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-slate-400 text-sm">
                                                {new Date(doc.updatedAt).toLocaleDateString('id-ID', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric',
                                                })}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
