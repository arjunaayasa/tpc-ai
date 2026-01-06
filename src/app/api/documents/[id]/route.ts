import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        const document = await prisma.document.findUnique({
            where: { id },
            include: { metadata: true },
        });

        if (!document) {
            return NextResponse.json(
                { error: 'Document not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(document);
    } catch (error) {
        console.error('Get document error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch document', details: (error as Error).message },
            { status: 500 }
        );
    }
}
