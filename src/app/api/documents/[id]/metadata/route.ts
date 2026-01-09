import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { metadataUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // Validate document exists
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

        // Parse and validate request body
        const body = await request.json();
        const validationResult = metadataUpdateSchema.safeParse(body);

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: validationResult.error.issues },
                { status: 400 }
            );
        }

        const data = validationResult.data;

        // Prepare update data
        const updateData: Record<string, unknown> = {
            updatedByUser: true,
        };

        if (data.jenis !== undefined) updateData.jenis = data.jenis;
        if (data.nomor !== undefined) updateData.nomor = data.nomor;
        if (data.tahun !== undefined) updateData.tahun = data.tahun;
        if (data.judul !== undefined) updateData.judul = data.judul;
        if (data.statusAturan !== undefined) updateData.statusAturan = data.statusAturan;
        if (data.reviewerName !== undefined) updateData.reviewerName = data.reviewerName;

        if (data.tanggalTerbit !== undefined) {
            updateData.tanggalTerbit = data.tanggalTerbit ? new Date(data.tanggalTerbit) : null;
        }
        if (data.tanggalBerlaku !== undefined) {
            updateData.tanggalBerlaku = data.tanggalBerlaku ? new Date(data.tanggalBerlaku) : null;
        }

        // Upsert metadata
        const metadata = await prisma.documentMetadata.upsert({
            where: { documentId: id },
            create: {
                documentId: id,
                ...updateData,
            },
            update: updateData,
        });

        // Update document status if approving
        if (data.approve) {
            // Set confidence to 100% and save reviewer name
            await prisma.documentMetadata.update({
                where: { documentId: id },
                data: {
                    confidence: 1.0,
                    reviewerName: data.reviewerName || null,
                },
            });

            await prisma.document.update({
                where: { id },
                data: { status: 'approved' },
            });
        }

        return NextResponse.json({
            success: true,
            metadata,
            documentStatus: data.approve ? 'approved' : document.status,
        });
    } catch (error) {
        console.error('Metadata update error:', error);
        return NextResponse.json(
            { error: 'Update failed', details: (error as Error).message },
            { status: 500 }
        );
    }
}
