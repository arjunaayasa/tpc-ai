'use client';

import { useState, useMemo, useEffect } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

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

interface TableRow {
    cells: string[];
}

interface PutusanTable {
    title: string | null;
    headers: string[];
    rows: TableRow[];
    startOffset: number;
    endOffset: number;
}

interface PutusanViewProps {
    documentId: string;
    chunks: Chunk[];
    tables?: PutusanTable[];
    metadata: {
        nomor: string | null;
        tahun: number | null;
        judul: string | null;
    };
    onEditChunk?: (chunk: Chunk) => void;
    onDeleteChunk?: (chunkId: string) => void;
    isEditable?: boolean;
}

// Section type display config
const SECTION_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
    AMAR: { label: 'Amar Putusan', color: 'bg-emerald-500', icon: '⚖️' },
    SECTION: { label: 'Section', color: 'bg-blue-500', icon: '📄' },
    SUBSECTION: { label: 'Subsection', color: 'bg-blue-400', icon: '📑' },
    EVIDENCE: { label: 'Bukti', color: 'bg-amber-500', icon: '📋' },
};

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
    MAJELIS: { label: 'Majelis', color: 'bg-purple-500' },
    PEMOHON: { label: 'Pemohon', color: 'bg-blue-500' },
    TERBANDING: { label: 'Terbanding', color: 'bg-orange-500' },
    UNKNOWN: { label: 'Unknown', color: 'bg-gray-500' },
};

/**
 * Detect if text contains table-like content
 * PDF tables often get extracted as unstructured text with numbers on separate lines
 */
function detectTableInText(text: string): PutusanTable | null {
    // Look for "perhitungan" marker
    const tableMarker = text.match(/(?:dengan\s+)?perhitungan\s+(?:pajak\s+)?(?:sebagai\s+)?berikut\s*:?\s*/i);
    if (!tableMarker) return null;

    const startPos = tableMarker.index! + tableMarker[0].length;
    const tableText = text.slice(startPos, startPos + 3000).trim();

    // Alternative approach: find patterns like "Description\nNumber Number Number"
    // E.g., "Penghasilan Kena Pajak\n755.178.449 11.854.998.677 755.178.449"

    const rows: TableRow[] = [];

    // Pattern: text description followed by line with multiple numbers
    const pattern = /([A-Za-z][^\n]*?)\n\s*([\d\.]+(?:\s+[\d\.]+)*)/g;
    let match;

    while ((match = pattern.exec(tableText)) !== null) {
        const desc = match[1].trim();
        const numLine = match[2].trim();

        // Parse numbers (format: 755.178.449)
        const numbers = numLine.split(/\s+/).filter(n => /^\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(n) || /^\d+$/.test(n));

        if (numbers.length >= 1 && desc.length > 3 && !desc.match(/^(NO|Menurut|Pemohon|Terbanding|URAIAN|Pembahasan)/i)) {
            rows.push({
                cells: [String(rows.length + 1), desc, ...numbers]
            });
        }
    }

    // Also try inline format: "1 Description 123.456 789.012"
    const inlinePattern = /^(\d+)\s+([A-Za-z][^\d]*?)\s+([\d\.]+(?:\s+[\d\.]+)*)/gm;
    while ((match = inlinePattern.exec(tableText)) !== null) {
        const rowNum = match[1];
        const desc = match[2].trim();
        const numLine = match[3].trim();
        const numbers = numLine.split(/\s+/).filter(n => /^\d{1,3}(?:\.\d{3})*$/.test(n) || /^\d+$/.test(n));

        if (numbers.length >= 1 && desc.length > 3) {
            // Avoid duplicates
            const exists = rows.some(r => r.cells[1] === desc);
            if (!exists) {
                rows.push({
                    cells: [rowNum, desc, ...numbers]
                });
            }
        }
    }

    if (rows.length < 2) return null;

    // Sort by row number
    rows.sort((a, b) => parseInt(a.cells[0]) - parseInt(b.cells[0]));

    // Determine max columns
    const maxCols = Math.max(...rows.map(r => r.cells.length));

    // Normalize row lengths
    rows.forEach(row => {
        while (row.cells.length < maxCols) {
            row.cells.push('');
        }
    });

    // Generate headers based on column count
    const headers = ['NO', 'URAIAN'];
    if (maxCols >= 3) headers.push('Pemohon (Rp)');
    if (maxCols >= 4) headers.push('Terbanding (Rp)');
    if (maxCols >= 5) headers.push('Disetujui (Rp)');
    while (headers.length < maxCols) {
        headers.push(`Kolom ${headers.length + 1}`);
    }

    return {
        title: 'Tabel Perhitungan Pajak',
        headers,
        rows,
        startOffset: startPos,
        endOffset: startPos + tableText.length,
    };
}

export default function PutusanView({ documentId, chunks, tables = [], metadata, onEditChunk, onDeleteChunk, isEditable = true }: PutusanViewProps) {
    const [selectedChunk, setSelectedChunk] = useState<Chunk | null>(null);
    const [selectedTable, setSelectedTable] = useState<PutusanTable | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRole, setFilterRole] = useState<string | null>(null);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['AMAR', 'TABLES']));

    // Sync selectedChunk with updated chunks prop (for realtime edit updates)
    useEffect(() => {
        if (selectedChunk) {
            const updated = chunks.find(c => c.id === selectedChunk.id);
            if (updated && (updated.text !== selectedChunk.text || updated.title !== selectedChunk.title)) {
                setSelectedChunk(updated);
            }
        }
    }, [chunks, selectedChunk]);

    // Use provided tables from API (AI-extracted) or auto-detect from chunk texts as fallback
    const allTables = useMemo(() => {
        // If tables are provided from API (Gemini extracted), use those
        if (tables.length > 0) {
            console.log('[PutusanView] Using', tables.length, 'AI-extracted tables from API');
            return tables;
        }

        // Fallback: try to detect tables from chunk texts (less accurate)
        console.log('[PutusanView] No API tables, attempting client-side detection...');
        const detected: PutusanTable[] = [];
        for (const chunk of chunks) {
            const table = detectTableInText(chunk.text);
            if (table) {
                console.log('[PutusanView] Detected table:', table);
                detected.push(table);
            }
        }
        console.log('[PutusanView] Total tables detected:', detected.length, 'from', chunks.length, 'chunks');
        return detected;
    }, [chunks, tables]);

    // Group chunks by section type
    const groupedChunks = useMemo(() => {
        const groups: Record<string, Chunk[]> = {
            AMAR: [],
            SECTION: [],
            SUBSECTION: [],
            EVIDENCE: [],
        };

        chunks.forEach(chunk => {
            const type = chunk.chunkType || 'SECTION';
            if (groups[type]) {
                groups[type].push(chunk);
            } else {
                groups.SECTION.push(chunk);
            }
        });

        return groups;
    }, [chunks]);

    // Build tree structure
    const sectionTree = useMemo(() => {
        const tree: { section: Chunk; subsections: Chunk[] }[] = [];
        const sections = groupedChunks.SECTION;
        const subsections = groupedChunks.SUBSECTION;

        sections.forEach(section => {
            const children = subsections.filter(
                sub => sub.parentChunkId === section.anchorCitation
            );
            tree.push({ section, subsections: children });
        });

        return tree;
    }, [groupedChunks]);

    // Filter chunks based on search and role
    const filteredTree = useMemo(() => {
        if (!searchQuery && !filterRole) return sectionTree;

        return sectionTree.filter(item => {
            const sectionMatches =
                (!searchQuery ||
                    item.section.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    item.section.title?.toLowerCase().includes(searchQuery.toLowerCase())) &&
                (!filterRole || item.section.role === filterRole);

            const subsectionMatches = item.subsections.some(sub =>
                (!searchQuery ||
                    sub.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    sub.title?.toLowerCase().includes(searchQuery.toLowerCase())) &&
                (!filterRole || sub.role === filterRole)
            );

            return sectionMatches || subsectionMatches;
        });
    }, [sectionTree, searchQuery, filterRole]);

    // Evidence items
    const evidenceChunks = useMemo(() => {
        return chunks.filter(c =>
            c.text.match(/Bukti\s+P-\d+/i) ||
            c.anchorCitation.includes('EVIDENCE')
        );
    }, [chunks]);

    const toggleSection = (type: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(type)) {
                next.delete(type);
            } else {
                next.add(type);
            }
            return next;
        });
    };

    return (
        <div className="flex gap-6 h-[calc(100vh-200px)]">
            {/* Left Panel - Outline Tree */}
            <div className="w-80 flex-shrink-0 border border-neutral-800 rounded-lg overflow-hidden flex flex-col">
                <div className="p-4 border-b border-neutral-800 bg-neutral-900">
                    <h3 className="font-semibold text-white mb-3">Struktur Putusan</h3>

                    {/* Search */}
                    <input
                        type="text"
                        placeholder="Cari..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
                    />

                    {/* Role Filter */}
                    <div className="flex gap-2 mt-3 flex-wrap">
                        {Object.entries(ROLE_CONFIG).map(([role, config]) => (
                            <button
                                key={role}
                                onClick={() => setFilterRole(filterRole === role ? null : role)}
                                className={`px-2 py-1 text-xs rounded transition-colors ${filterRole === role
                                    ? `${config.color} text-white`
                                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                                    }`}
                            >
                                {config.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tree Content */}
                <div className="flex-1 overflow-y-auto p-2">
                    {/* Amar Section (Pinned) */}
                    {groupedChunks.AMAR.length > 0 && (
                        <div className="mb-4">
                            <button
                                onClick={() => toggleSection('AMAR')}
                                className="w-full flex items-center gap-2 px-3 py-2 bg-emerald-900/30 border border-emerald-700/50 rounded-lg text-left hover:bg-emerald-900/50 transition-colors"
                            >
                                <span>⚖️</span>
                                <span className="font-medium text-emerald-400">Amar Putusan</span>
                                <span className="ml-auto text-xs text-neutral-500">
                                    {expandedSections.has('AMAR') ? '▼' : '▶'}
                                </span>
                            </button>
                            {expandedSections.has('AMAR') && groupedChunks.AMAR.map(chunk => (
                                <div
                                    key={chunk.id}
                                    onClick={() => setSelectedChunk(chunk)}
                                    className={`ml-4 mt-1 px-3 py-2 rounded cursor-pointer text-sm transition-colors ${selectedChunk?.id === chunk.id
                                        ? 'bg-emerald-800/50 text-white'
                                        : 'text-neutral-400 hover:bg-neutral-800'
                                        }`}
                                >
                                    {chunk.title || 'Amar'}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Main Sections */}
                    {filteredTree.map(({ section, subsections }) => (
                        <div key={section.id} className="mb-2">
                            <div
                                onClick={() => {
                                    setSelectedChunk(section);
                                    setSelectedTable(null);
                                    toggleSection(section.id);
                                }}
                                className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors ${selectedChunk?.id === section.id
                                    ? 'bg-blue-800/50 text-white'
                                    : 'text-neutral-300 hover:bg-neutral-800'
                                    }`}
                            >
                                <span className={`w-2 h-2 rounded-full ${ROLE_CONFIG[section.role]?.color || 'bg-gray-500'}`} />
                                <span className="flex-1 text-sm truncate">{section.title || section.anchorCitation.split(' - ').pop()}</span>
                                {subsections.length > 0 && (
                                    <span className="text-xs text-neutral-500">
                                        {expandedSections.has(section.id) ? '▼' : '▶'}
                                    </span>
                                )}
                            </div>

                            {/* Subsections */}
                            {expandedSections.has(section.id) && subsections.map(sub => (
                                <div
                                    key={sub.id}
                                    onClick={() => { setSelectedChunk(sub); setSelectedTable(null); }}
                                    className={`ml-6 mt-1 px-3 py-1.5 rounded cursor-pointer text-sm transition-colors ${selectedChunk?.id === sub.id
                                        ? 'bg-blue-700/50 text-white'
                                        : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
                                        }`}
                                >
                                    {sub.title || sub.anchorCitation.split(' - ').pop()}
                                </div>
                            ))}
                        </div>
                    ))}

                    {/* Evidence List */}
                    {evidenceChunks.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-neutral-800">
                            <button
                                onClick={() => toggleSection('EVIDENCE')}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-neutral-400 hover:text-white transition-colors"
                            >
                                <span>📋</span>
                                <span className="font-medium">Bukti ({evidenceChunks.length})</span>
                                <span className="ml-auto text-xs">
                                    {expandedSections.has('EVIDENCE') ? '▼' : '▶'}
                                </span>
                            </button>
                            {expandedSections.has('EVIDENCE') && (
                                <div className="ml-4 mt-1 space-y-1">
                                    {evidenceChunks.slice(0, 20).map(chunk => {
                                        const match = chunk.text.match(/Bukti\s+(P-\d+)/i);
                                        const code = match ? match[1] : 'Bukti';
                                        return (
                                            <div
                                                key={chunk.id}
                                                onClick={() => { setSelectedChunk(chunk); setSelectedTable(null); }}
                                                className={`px-3 py-1.5 rounded cursor-pointer text-sm transition-colors ${selectedChunk?.id === chunk.id
                                                    ? 'bg-amber-800/50 text-white'
                                                    : 'text-neutral-500 hover:bg-neutral-800'
                                                    }`}
                                            >
                                                {code}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tables List */}
                    {(() => { console.log('[PutusanView] Rendering tables section, allTables.length:', allTables.length); return null; })()}
                    {allTables.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-neutral-800">
                            <button
                                onClick={() => toggleSection('TABLES')}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-cyan-400 hover:text-white transition-colors"
                            >
                                <span>📊</span>
                                <span className="font-medium">Tabel ({allTables.length})</span>
                                <span className="ml-auto text-xs">
                                    {expandedSections.has('TABLES') ? '▼' : '▶'}
                                </span>
                            </button>
                            {expandedSections.has('TABLES') && (
                                <div className="ml-4 mt-1 space-y-1">
                                    {allTables.map((table, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => { setSelectedTable(table); setSelectedChunk(null); }}
                                            className={`px-3 py-1.5 rounded cursor-pointer text-sm transition-colors ${selectedTable === table
                                                ? 'bg-cyan-800/50 text-white'
                                                : 'text-neutral-500 hover:bg-neutral-800'
                                                }`}
                                        >
                                            📊 {table.title || `Tabel ${idx + 1}`} ({table.rows.length} baris)
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel - Chunk/Table Preview */}
            <div className="flex-1 border border-neutral-800 rounded-lg overflow-hidden flex flex-col">
                {selectedTable ? (
                    <>
                        {/* Table Header */}
                        <div className="p-4 border-b border-neutral-800 bg-neutral-900">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="px-2 py-0.5 text-xs rounded bg-cyan-500 text-white">
                                    Tabel
                                </span>
                                <span className="text-xs text-neutral-500">
                                    {selectedTable.rows.length} baris × {selectedTable.headers.length} kolom
                                </span>
                            </div>
                            <h3 className="font-semibold text-white">
                                {selectedTable.title || 'Tabel Perhitungan'}
                            </h3>
                        </div>

                        {/* Table Content */}
                        <div className="flex-1 overflow-auto p-4">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-neutral-800">
                                            {selectedTable.headers.map((header, idx) => (
                                                <th
                                                    key={idx}
                                                    className="px-3 py-2 text-left text-neutral-300 font-medium border border-neutral-700"
                                                >
                                                    {header}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedTable.rows.map((row, rowIdx) => (
                                            <tr key={rowIdx} className="hover:bg-neutral-800/50">
                                                {row.cells.map((cell, cellIdx) => (
                                                    <td
                                                        key={cellIdx}
                                                        className={`px-3 py-2 border border-neutral-700 ${/^[\d\.,]+$/.test(cell.replace(/\s/g, ''))
                                                            ? 'text-right text-emerald-400 font-mono'
                                                            : 'text-neutral-300'
                                                            }`}
                                                    >
                                                        {cell}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                ) : selectedChunk ? (
                    <>
                        {/* Chunk Header */}
                        <div className="p-4 border-b border-neutral-800 bg-neutral-900">
                            <div className="flex items-center gap-3 mb-2">
                                {/* Chunk Type Badge */}
                                <span className={`px-2 py-0.5 text-xs rounded ${SECTION_CONFIG[selectedChunk.chunkType]?.color || 'bg-gray-500'} text-white`}>
                                    {SECTION_CONFIG[selectedChunk.chunkType]?.label || selectedChunk.chunkType}
                                </span>

                                {/* Role Badge */}
                                <span className={`px-2 py-0.5 text-xs rounded ${ROLE_CONFIG[selectedChunk.role]?.color || 'bg-gray-500'} text-white`}>
                                    {ROLE_CONFIG[selectedChunk.role]?.label || selectedChunk.role}
                                </span>

                                {/* Token Count */}
                                <span className="text-xs text-neutral-500">
                                    ~{selectedChunk.tokenEstimate || 0} tokens
                                </span>

                                {/* Edit/Delete Buttons */}
                                {isEditable && (
                                    <div className="ml-auto flex gap-2">
                                        <button
                                            onClick={() => onEditChunk?.(selectedChunk)}
                                            className="px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 text-white rounded transition-colors flex items-center gap-1"
                                            title="Edit"
                                        >
                                            <Pencil size={12} /> Edit
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (confirm('Delete this chunk?')) {
                                                    onDeleteChunk?.(selectedChunk.id);
                                                }
                                            }}
                                            className="px-2 py-1 text-xs bg-red-600/50 hover:bg-red-600 text-white rounded transition-colors flex items-center gap-1"
                                            title="Delete"
                                        >
                                            <Trash2 size={12} /> Delete
                                        </button>
                                    </div>
                                )}
                            </div>

                            <h3 className="font-semibold text-white">
                                {selectedChunk.title || selectedChunk.anchorCitation}
                            </h3>

                            <p className="text-xs text-neutral-500 mt-1 font-mono">
                                {selectedChunk.anchorCitation}
                            </p>
                        </div>

                        {/* Chunk Content */}
                        <div className="flex-1 overflow-y-auto p-4">
                            <div className="prose prose-invert prose-sm max-w-none">
                                <pre className="whitespace-pre-wrap text-sm text-neutral-300 font-sans leading-relaxed">
                                    {selectedChunk.text}
                                </pre>
                            </div>

                            {/* Legal References */}
                            {selectedChunk.legalRefs?.refs && selectedChunk.legalRefs.refs.length > 0 && (
                                <div className="mt-6 pt-4 border-t border-neutral-800">
                                    <h4 className="text-sm font-medium text-neutral-400 mb-2">Referensi Hukum</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedChunk.legalRefs.refs.map((ref, idx) => (
                                            <span
                                                key={idx}
                                                className="px-2 py-1 text-xs bg-neutral-800 text-neutral-300 rounded"
                                            >
                                                {ref}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-neutral-500">
                        <div className="text-center">
                            <p className="text-4xl mb-4">📄</p>
                            <p>Pilih section dari panel kiri untuk melihat isi</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
