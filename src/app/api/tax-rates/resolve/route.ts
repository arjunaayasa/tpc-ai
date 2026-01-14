/**
 * Tax Rate Resolver API
 * POST /api/tax-rates/resolve - Resolve tax rate by context
 * 
 * This is the main endpoint used by RAG/agent to get deterministic tax rates
 */

import { NextResponse } from 'next/server';
import { resolveTaxRate, ResolveContext, ResolveResult } from '@/lib/tax/resolveTaxRate';

export async function POST(request: Request) {
    try {
        const body: ResolveContext = await request.json();

        if (!body.category) {
            return NextResponse.json(
                { success: false, error: 'category is required' },
                { status: 400 }
            );
        }

        const result = await resolveTaxRate(body);

        if (!result) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'No matching tax rate rule found',
                    query: body,
                },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error('[API] Error resolving tax rate:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to resolve tax rate' },
            { status: 500 }
        );
    }
}
