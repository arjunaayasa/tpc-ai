/**
 * Tax Rate Context for RAG
 * 
 * Provides functions to detect tariff-related questions and
 * fetch tax rate data from registry for AI context injection.
 */

import { PrismaClient, TaxRateType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

// Keywords that indicate the question needs tax rate data
const TAX_RATE_KEYWORDS = [
    // Direct rate keywords
    'tarif', 'persen', 'rate', 'persentase',
    // Tax types
    'ppn', 'pph21', 'pph 21', 'pph23', 'pph 23', 'pph26', 'pph 26',
    'pph badan', 'pph final', 'ppnbm',
    // TER and PTKP
    'ter ', ' ter', 'tarif efektif', 'ptkp',
    // Question patterns
    'berapa persen', 'berapa tarif', 'berapa pajak', 'berapa potongan',
    'tarif progresif', 'tarif flat',
    // Calculation related
    'hitung pajak', 'perhitungan', 'potong pajak', 'pemotongan',
    'potongan pajak', 'withholding',
];

// Categories to exclude from auto-fetching (e.g., PTKP is an amount, not rate)
const RATE_CATEGORIES = ['PPN', 'PPh21', 'TER', 'PPh23', 'PPh26', 'PPhBadan', 'PPhFinal'];

export interface TaxRateContextItem {
    label: string;  // TR1, TR2, etc.
    categoryCode: string;
    ruleName: string;
    objectCode: string;
    rateType: TaxRateType;
    rateValue: number | null;
    ratePercent: string | null;
    baseType: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    sourceRef: string | null;
    notes: string | null;
    brackets?: {
        minAmount: number;
        maxAmount: number | null;
        rate: number;
        ratePercent: string;
    }[];
}

/**
 * Check if a question likely needs tax rate information
 */
export function detectTaxRateKeywords(question: string): boolean {
    const q = question.toLowerCase();
    return TAX_RATE_KEYWORDS.some(keyword => q.includes(keyword));
}

/**
 * Convert Decimal to number safely
 */
function toNumber(val: Decimal | null | undefined): number | null {
    if (val === null || val === undefined) return null;
    return Number(val);
}

/**
 * Detect which tax categories are relevant based on question
 */
export function detectRelevantCategories(question: string): string[] {
    const q = question.toLowerCase();
    const categories: string[] = [];

    if (q.includes('ppn') || q.includes('pertambahan nilai')) {
        categories.push('PPN');
    }
    if (q.includes('pph21') || q.includes('pph 21') || q.includes('pasal 21')) {
        categories.push('PPh21', 'TER');
    }
    if (q.includes('ter') || q.includes('tarif efektif')) {
        categories.push('TER');
    }
    if (q.includes('ptkp') || q.includes('tidak kena pajak')) {
        categories.push('PTKP');
    }
    if (q.includes('pph23') || q.includes('pph 23') || q.includes('pasal 23')) {
        categories.push('PPh23');
    }
    if (q.includes('pph26') || q.includes('pph 26') || q.includes('pasal 26')) {
        categories.push('PPh26');
    }
    if (q.includes('pph badan') || q.includes('badan usaha') || q.includes('corporate')) {
        categories.push('PPhBadan');
    }
    if (q.includes('pph final') || q.includes('final') || q.includes('sewa') || q.includes('umkm')) {
        categories.push('PPhFinal');
    }

    // If no specific category detected but has rate keywords, return common ones
    if (categories.length === 0 && detectTaxRateKeywords(question)) {
        return RATE_CATEGORIES;
    }

    return [...new Set(categories)]; // Remove duplicates
}

/**
 * Get tax rate rules for specified categories (or all rate categories)
 */
export async function getTaxRatesForContext(
    categories?: string[]
): Promise<TaxRateContextItem[]> {
    const today = new Date();
    const targetCategories = categories && categories.length > 0
        ? categories
        : RATE_CATEGORIES;

    // Fetch category IDs
    const cats = await prisma.taxRateCategory.findMany({
        where: { code: { in: targetCategories } },
    });
    const catIds = cats.map(c => c.id);
    const catCodeMap = new Map(cats.map(c => [c.id, c.code]));

    // Fetch active rules
    const rules = await prisma.taxRateRule.findMany({
        where: {
            categoryId: { in: catIds },
            isActive: true,
            effectiveFrom: { lte: today },
            OR: [
                { effectiveTo: null },
                { effectiveTo: { gte: today } },
            ],
        },
        include: {
            brackets: { orderBy: { orderIndex: 'asc' } },
        },
        orderBy: [
            { categoryId: 'asc' },
            { priority: 'desc' },
            { effectiveFrom: 'desc' },
        ],
    });

    // Format as context items
    const items: TaxRateContextItem[] = rules.map((rule, index) => {
        const rateValue = toNumber(rule.rateValue);
        const brackets = rule.brackets.length > 0
            ? rule.brackets.map(b => ({
                minAmount: toNumber(b.minAmount) ?? 0,
                maxAmount: toNumber(b.maxAmount),
                rate: toNumber(b.rate) ?? 0,
                ratePercent: `${((toNumber(b.rate) ?? 0) * 100).toFixed(2)}%`,
            }))
            : undefined;

        return {
            label: `TR${index + 1}`,
            categoryCode: catCodeMap.get(rule.categoryId) || 'UNKNOWN',
            ruleName: rule.name,
            objectCode: rule.objectCode,
            rateType: rule.rateType,
            rateValue,
            ratePercent: rateValue !== null ? `${(rateValue * 100).toFixed(2)}%` : null,
            baseType: rule.baseType,
            effectiveFrom: rule.effectiveFrom.toISOString().split('T')[0],
            effectiveTo: rule.effectiveTo?.toISOString().split('T')[0] || null,
            sourceRef: rule.sourceRef,
            notes: rule.notes,
            brackets,
        };
    });

    return items;
}

/**
 * Format tax rates as context string for prompt injection
 */
export function formatTaxRateContext(items: TaxRateContextItem[]): string {
    if (items.length === 0) return '';

    const lines: string[] = [
        '=== DATA TARIF PAJAK (dari Tax Rate Registry) ===',
        '',
    ];

    for (const item of items) {
        lines.push(`[${item.label}] ${item.ruleName}`);
        lines.push(`- Kategori: ${item.categoryCode}`);

        if (item.rateType === 'PROGRESSIVE' && item.brackets) {
            lines.push(`- Tarif Progresif (basis: ${item.baseType}):`);
            for (const b of item.brackets) {
                const max = b.maxAmount !== null
                    ? `Rp${b.maxAmount.toLocaleString('id-ID')}`
                    : 'Tidak terbatas';
                lines.push(`  * Rp${b.minAmount.toLocaleString('id-ID')} - ${max}: ${b.ratePercent}`);
            }
        } else if (item.ratePercent) {
            lines.push(`- Tarif: ${item.ratePercent} (${item.rateType}, basis: ${item.baseType})`);
        }

        lines.push(`- Berlaku sejak: ${item.effectiveFrom}${item.effectiveTo ? ` s.d. ${item.effectiveTo}` : ''}`);

        if (item.sourceRef) {
            lines.push(`- Sumber: ${item.sourceRef}`);
        }
        if (item.notes) {
            lines.push(`- Catatan: ${item.notes}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Main function: detect if question needs rates and return formatted context
 */
export async function getTaxRateContextForQuestion(
    question: string
): Promise<{ needed: boolean; context: string; items: TaxRateContextItem[] }> {
    if (!detectTaxRateKeywords(question)) {
        return { needed: false, context: '', items: [] };
    }

    const categories = detectRelevantCategories(question);
    const items = await getTaxRatesForContext(categories);
    const context = formatTaxRateContext(items);

    return { needed: true, context, items };
}
