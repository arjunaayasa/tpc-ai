import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const tables = await prisma.documentTable.findMany({
            where: { documentId: id },
            orderBy: { orderIndex: 'asc' },
            select: {
                id: true,
                title: true,
                pageContext: true,
                headers: true,
                rows: true,
                notes: true,
                orderIndex: true,
            },
        });

        return NextResponse.json({ tables });
    } catch (error) {
        console.error('Error fetching tables:', error);
        return NextResponse.json(
            { error: 'Failed to fetch tables' },
            { status: 500 }
        );
    }
}
