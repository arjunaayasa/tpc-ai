'use client';

import { useState, useEffect } from 'react';

interface RagToggleProps {
    documentId: string;
    initialActive: boolean;
}

export function RagToggle({ documentId, initialActive }: RagToggleProps) {
    const [isActive, setIsActive] = useState(initialActive);
    const [isLoading, setIsLoading] = useState(false);

    // Sync local state when server data changes (e.g., after bulk update)
    useEffect(() => {
        setIsActive(initialActive);
    }, [initialActive]);

    const handleToggle = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/documents/${documentId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActiveForRAG: !isActive }),
            });

            if (response.ok) {
                setIsActive(!isActive);
            } else {
                console.error('Failed to toggle RAG status');
            }
        } catch (error) {
            console.error('Error toggling RAG status:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            onClick={handleToggle}
            disabled={isLoading}
            className={`
                w-10 h-5 rounded-full relative transition-colors duration-200
                ${isActive ? 'bg-emerald-500' : 'bg-neutral-600'}
                ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}
            `}
            title={isActive ? 'Active for RAG (click to disable)' : 'Inactive for RAG (click to enable)'}
        >
            <span
                className={`
                    absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200
                    ${isActive ? 'left-5' : 'left-0.5'}
                `}
            />
        </button>
    );
}
