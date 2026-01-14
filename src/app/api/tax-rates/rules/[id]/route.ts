/**
 * Tax Rate Rule Detail API
 * GET /api/tax-rates/rules/[id] - Get rule by ID
 * PUT /api/tax-rates/rules/[id] - Update rule
 * DELETE /api/tax-rates/rules/[id] - Soft delete (set isActive=false)
 */

import { NextResponse } from 'next/server';
import { PrismaClient, TaxRateType, TaxBaseType, AuditAction } from '@prisma/client';

const prisma = new PrismaClient();

// GET - Get rule by ID
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const rule = await prisma.taxRateRule.findUnique({
            where: { id },
            include: {
                category: true,
                brackets: {
                    orderBy: { orderIndex: 'asc' },
                },
            },
        });

        if (!rule) {
            return NextResponse.json(
                { success: false, error: 'Rule not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, data: rule });
    } catch (error) {
        console.error('[API] Error fetching rule:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch rule' },
            { status: 500 }
        );
    }
}

// PUT - Update rule
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();

        // Get existing rule for audit
        const existing = await prisma.taxRateRule.findUnique({
            where: { id },
            include: { brackets: true },
        });

        if (!existing) {
            return NextResponse.json(
                { success: false, error: 'Rule not found' },
                { status: 404 }
            );
        }

        const {
            name,
            objectCode,
            jurisdiction,
            rateType,
            baseType,
            rateValue,
            multiplier,
            conditions,
            effectiveFrom,
            effectiveTo,
            priority,
            sourceRef,
            notes,
            isActive,
            brackets,
            updatedBy,
        } = body;

        // Update rule
        const updated = await prisma.taxRateRule.update({
            where: { id },
            data: {
                name: name ?? existing.name,
                objectCode: objectCode ?? existing.objectCode,
                jurisdiction: jurisdiction ?? existing.jurisdiction,
                rateType: rateType ? (rateType as TaxRateType) : existing.rateType,
                baseType: baseType ? (baseType as TaxBaseType) : existing.baseType,
                rateValue: rateValue !== undefined ? (rateValue ? parseFloat(rateValue) : null) : existing.rateValue,
                multiplier: multiplier !== undefined ? (multiplier ? parseFloat(multiplier) : null) : existing.multiplier,
                conditions: conditions !== undefined ? conditions : existing.conditions,
                effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : existing.effectiveFrom,
                effectiveTo: effectiveTo !== undefined ? (effectiveTo ? new Date(effectiveTo) : null) : existing.effectiveTo,
                priority: priority ?? existing.priority,
                sourceRef: sourceRef !== undefined ? sourceRef : existing.sourceRef,
                notes: notes !== undefined ? notes : existing.notes,
                isActive: isActive !== undefined ? isActive : existing.isActive,
            },
        });

        // Update brackets if provided
        if (brackets !== undefined) {
            // Delete old brackets
            await prisma.taxRateBracket.deleteMany({ where: { ruleId: id } });

            // Create new brackets
            if (brackets && brackets.length > 0) {
                for (let i = 0; i < brackets.length; i++) {
                    const b = brackets[i];
                    await prisma.taxRateBracket.create({
                        data: {
                            ruleId: id,
                            minAmount: parseFloat(b.minAmount),
                            maxAmount: b.maxAmount ? parseFloat(b.maxAmount) : null,
                            rate: parseFloat(b.rate),
                            orderIndex: i,
                        },
                    });
                }
            }
        }

        // Audit log
        await prisma.taxRateAudit.create({
            data: {
                entityType: 'TaxRateRule',
                entityId: id,
                action: AuditAction.UPDATE,
                before: existing as any,
                after: updated as any,
                actor: updatedBy,
            },
        });

        // Fetch complete rule
        const completeRule = await prisma.taxRateRule.findUnique({
            where: { id },
            include: {
                category: true,
                brackets: { orderBy: { orderIndex: 'asc' } },
            },
        });

        return NextResponse.json({ success: true, data: completeRule });
    } catch (error) {
        console.error('[API] Error updating rule:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update rule' },
            { status: 500 }
        );
    }
}

// DELETE - Soft delete (set isActive=false)
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const hard = searchParams.get('hard') === 'true';
        const actor = searchParams.get('actor');

        const existing = await prisma.taxRateRule.findUnique({
            where: { id },
        });

        if (!existing) {
            return NextResponse.json(
                { success: false, error: 'Rule not found' },
                { status: 404 }
            );
        }

        if (hard) {
            // Hard delete
            await prisma.taxRateRule.delete({ where: { id } });

            await prisma.taxRateAudit.create({
                data: {
                    entityType: 'TaxRateRule',
                    entityId: id,
                    action: AuditAction.DELETE,
                    before: existing as any,
                    actor,
                },
            });

            return NextResponse.json({ success: true, message: 'Rule permanently deleted' });
        } else {
            // Soft delete
            await prisma.taxRateRule.update({
                where: { id },
                data: { isActive: false },
            });

            await prisma.taxRateAudit.create({
                data: {
                    entityType: 'TaxRateRule',
                    entityId: id,
                    action: AuditAction.UPDATE,
                    before: existing as any,
                    after: { ...existing, isActive: false } as any,
                    actor,
                },
            });

            return NextResponse.json({ success: true, message: 'Rule deactivated' });
        }
    } catch (error) {
        console.error('[API] Error deleting rule:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to delete rule' },
            { status: 500 }
        );
    }
}
