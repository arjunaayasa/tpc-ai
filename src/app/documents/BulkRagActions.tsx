'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function BulkRagActions() {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleBulkAction = async (enableAll: boolean) => {
        if (!confirm(`Are you sure you want to ${enableAll ? 'ENABLE' : 'DISABLE'} RAG for ALL documents?`)) {
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch('/api/documents/bulk-rag', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActiveForRAG: enableAll }),
            });

            const data = await response.json();

            if (response.ok) {
                alert(data.message);
                router.refresh(); // Refresh page to update all toggles
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error('Bulk action error:', error);
            alert('Failed to update documents');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex gap-2">
            <button
                onClick={() => handleBulkAction(true)}
                disabled={isLoading}
                className={`
                    px-3 py-1.5 text-xs font-medium rounded border
                    border-emerald-600 text-emerald-400 hover:bg-emerald-600/20
                    ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                    transition-colors
                `}
            >
                {isLoading ? '...' : 'Enable All RAG'}
            </button>
            <button
                onClick={() => handleBulkAction(false)}
                disabled={isLoading}
                className={`
                    px-3 py-1.5 text-xs font-medium rounded border
                    border-neutral-600 text-neutral-400 hover:bg-neutral-600/20
                    ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                    transition-colors
                `}
            >
                {isLoading ? '...' : 'Disable All RAG'}
            </button>
        </div>
    );
}
