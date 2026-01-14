/**
 * Tax Rate Rules API
 * GET /api/tax-rates/rules - List rules with filters
 * POST /api/tax-rates/rules - Create rule
 */

import { NextResponse } from 'next/server';
import { PrismaClient, TaxRateType, TaxBaseType, AuditAction } from '@prisma/client';

const prisma = new PrismaClient();

// GET - List rules with filters
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category');
        const q = searchParams.get('q');
        const active = searchParams.get('active');
        const objectCode = searchParams.get('objectCode');

        const where: any = {};

        if (category) {
            const cat = await prisma.taxRateCategory.findUnique({
                where: { code: category },
            });
            if (cat) {
                where.categoryId = cat.id;
            }
        }

        if (active !== null && active !== 'all') {
            where.isActive = active === 'true';
        }

        if (objectCode) {
            where.objectCode = { contains: objectCode, mode: 'insensitive' };
        }

        if (q) {
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { objectCode: { contains: q, mode: 'insensitive' } },
                { sourceRef: { contains: q, mode: 'insensitive' } },
            ];
        }

        const rules = await prisma.taxRateRule.findMany({
            where,
            include: {
                category: true,
                brackets: {
                    orderBy: { orderIndex: 'asc' },
                },
            },
            orderBy: [
                { category: { code: 'asc' } },
                { priority: 'desc' },
                { effectiveFrom: 'desc' },
            ],
        });

        return NextResponse.json({
            success: true,
            data: rules,
            count: rules.length,
        });
    } catch (error) {
        console.error('[API] Error fetching rules:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch rules' },
            { status: 500 }
        );
    }
}

// POST - Create rule
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            categoryCode,
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
            brackets,
            createdBy,
        } = body;

        // Validate required fields
        if (!categoryCode || !name || !objectCode || !rateType || !effectiveFrom) {
            return NextResponse.json(
                { success: false, error: 'categoryCode, name, objectCode, rateType, and effectiveFrom are required' },
                { status: 400 }
            );
        }

        // Get category
        const category = await prisma.taxRateCategory.findUnique({
            where: { code: categoryCode },
        });
        if (!category) {
            return NextResponse.json(
                { success: false, error: 'Category not found' },
                { status: 404 }
            );
        }

        // Create rule
        const rule = await prisma.taxRateRule.create({
            data: {
                categoryId: category.id,
                name,
                objectCode,
                jurisdiction: jurisdiction ?? 'ID',
                rateType: rateType as TaxRateType,
                baseType: (baseType as TaxBaseType) ?? TaxBaseType.GROSS,
                rateValue: rateValue ? parseFloat(rateValue) : null,
                multiplier: multiplier ? parseFloat(multiplier) : null,
                conditions: conditions ?? null,
                effectiveFrom: new Date(effectiveFrom),
                effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
                priority: priority ?? 100,
                sourceRef,
                notes,
                createdBy,
            },
        });

        // Create brackets if provided
        if (brackets && brackets.length > 0) {
            for (let i = 0; i < brackets.length; i++) {
                const b = brackets[i];
                await prisma.taxRateBracket.create({
                    data: {
                        ruleId: rule.id,
                        minAmount: parseFloat(b.minAmount),
                        maxAmount: b.maxAmount ? parseFloat(b.maxAmount) : null,
                        rate: parseFloat(b.rate),
                        orderIndex: i,
                    },
                });
            }
        }

        // Audit log
        await prisma.taxRateAudit.create({
            data: {
                entityType: 'TaxRateRule',
                entityId: rule.id,
                action: AuditAction.CREATE,
                after: rule as any,
                actor: createdBy,
            },
        });

        // Fetch complete rule
        const completeRule = await prisma.taxRateRule.findUnique({
            where: { id: rule.id },
            include: {
                category: true,
                brackets: { orderBy: { orderIndex: 'asc' } },
            },
        });

        return NextResponse.json({ success: true, data: completeRule }, { status: 201 });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return NextResponse.json(
                { success: false, error: 'Rule with same objectCode and effectiveFrom already exists' },
                { status: 409 }
            );
        }
        console.error('[API] Error creating rule:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to create rule' },
            { status: 500 }
        );
    }
}
