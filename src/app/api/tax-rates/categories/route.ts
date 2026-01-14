/**
 * Tax Rate Categories API
 * GET /api/tax-rates/categories - List all categories
 * POST /api/tax-rates/categories - Create category
 */

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET - List all categories
export async function GET() {
    try {
        const categories = await prisma.taxRateCategory.findMany({
            include: {
                _count: {
                    select: { rules: true },
                },
            },
            orderBy: { code: 'asc' },
        });

        return NextResponse.json({
            success: true,
            data: categories.map(cat => ({
                ...cat,
                ruleCount: cat._count.rules,
            })),
        });
    } catch (error) {
        console.error('[API] Error fetching categories:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch categories' },
            { status: 500 }
        );
    }
}

// POST - Create category
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { code, name, description } = body;

        if (!code || !name) {
            return NextResponse.json(
                { success: false, error: 'Code and name are required' },
                { status: 400 }
            );
        }

        const category = await prisma.taxRateCategory.create({
            data: {
                code: code.toUpperCase(),
                name,
                description,
            },
        });

        return NextResponse.json({ success: true, data: category }, { status: 201 });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return NextResponse.json(
                { success: false, error: 'Category code already exists' },
                { status: 409 }
            );
        }
        console.error('[API] Error creating category:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to create category' },
            { status: 500 }
        );
    }
}
