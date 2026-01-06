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

const statusLabels: Record<DocumentStatus, string> = {
    uploaded: 'Uploaded',
    processing: 'Processing',
    needs_review: 'Review',
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
        <div className="min-h-screen bg-black text-white">
            {/* Navigation */}
            <nav className="border-b border-neutral-800">
                <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
                    <span className="font-semibold tracking-tight">TPC Ingestion</span>
                    <div className="flex gap-6 text-sm">
                        <Link href="/documents" className="text-white">
                            Documents
                        </Link>
                        <Link href="/upload" className="text-neutral-400 hover:text-white transition-colors">
                            Upload
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-5xl mx-auto px-6 py-10">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-semibold">Documents</h1>
                        <p className="text-neutral-500 text-sm mt-1">
                            {documents.length} document{documents.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <Link
                        href="/upload"
                        className="px-4 py-2 bg-white text-black rounded font-medium text-sm hover:bg-neutral-200 transition-colors"
                    >
                        Upload
                    </Link>
                </div>

                {/* Filters */}
                <div className="flex gap-2 mb-6 text-sm">
                    <Link
                        href="/documents"
                        className={`px-3 py-1.5 rounded transition-colors ${!statusFilter ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
                            }`}
                    >
                        All
                    </Link>
                    {Object.entries(statusLabels).map(([status, label]) => (
                        <Link
                            key={status}
                            href={`/documents?status=${status}`}
                            className={`px-3 py-1.5 rounded transition-colors ${statusFilter === status ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
                                }`}
                        >
                            {label}
                        </Link>
                    ))}
                </div>

                {/* Table */}
                {documents.length === 0 ? (
                    <div className="text-center py-16 text-neutral-500">
                        <p>No documents found</p>
                        <Link href="/upload" className="text-white underline mt-2 inline-block">
                            Upload your first document
                        </Link>
                    </div>
                ) : (
                    <div className="border border-neutral-800 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-800 text-neutral-500">
                                    <th className="text-left py-3 px-4 font-medium">File</th>
                                    <th className="text-left py-3 px-4 font-medium">Type</th>
                                    <th className="text-left py-3 px-4 font-medium">Number</th>
                                    <th className="text-left py-3 px-4 font-medium">Year</th>
                                    <th className="text-left py-3 px-4 font-medium">Status</th>
                                    <th className="text-left py-3 px-4 font-medium">Updated</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documents.map((doc) => (
                                    <tr
                                        key={doc.id}
                                        className="border-b border-neutral-800 last:border-0 hover:bg-neutral-900 transition-colors"
                                    >
                                        <td className="py-3 px-4">
                                            <Link
                                                href={`/documents/${doc.id}`}
                                                className="hover:underline"
                                            >
                                                {doc.originalName}
                                            </Link>
                                        </td>
                                        <td className="py-3 px-4 text-neutral-400">
                                            {doc.metadata?.jenis || '-'}
                                        </td>
                                        <td className="py-3 px-4 text-neutral-400">
                                            {doc.metadata?.nomor || '-'}
                                        </td>
                                        <td className="py-3 px-4 text-neutral-400">
                                            {doc.metadata?.tahun || '-'}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`
                        ${doc.status === 'approved' ? 'text-white' : ''}
                        ${doc.status === 'failed' ? 'text-red-400' : ''}
                        ${doc.status === 'processing' ? 'text-neutral-400' : ''}
                        ${doc.status === 'needs_review' ? 'text-yellow-400' : ''}
                        ${doc.status === 'uploaded' ? 'text-neutral-500' : ''}
                      `}>
                                                {statusLabels[doc.status]}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-neutral-500">
                                            {new Date(doc.updatedAt).toLocaleDateString('en-US', {
                                                day: 'numeric',
                                                month: 'short',
                                            })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}
