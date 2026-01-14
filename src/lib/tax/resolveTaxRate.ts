/**
 * Tax Rate Resolver
 * 
 * Core logic for resolving tax rates from the registry.
 * Used by RAG/agent to get deterministic tax rates.
 */

import { PrismaClient, TaxRateRule, TaxRateBracket } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

export interface ResolveContext {
    category: string;          // e.g., "PPh23", "TER", "PPN"
    objectCode?: string;       // e.g., "PPh23_JASA", "TER_A_BULANAN"
    context?: {
        hasNpwp?: boolean;
        countryCode?: string;
        incomeType?: string;
        ptkpCategory?: string;  // e.g., "TK/0", "K/1"
        amount?: number;
        date?: string;          // ISO date, default today
    };
}

export interface ResolveResult {
    matchedRuleId: string;
    ruleName: string;
    rateType: 'FLAT' | 'PROGRESSIVE' | 'MATRIX';
    rate: number;              // Effective rate (decimal, e.g., 0.11 for 11%)
    ratePercent: string;       // Human readable (e.g., "11%")
    withholding?: number;      // If amount provided, calculated withholding
    effectiveFrom: string;
    effectiveTo?: string;
    sourceRef?: string;
    conditions?: object;
    brackets?: {
        minAmount: number;
        maxAmount: number | null;
        rate: number;
        ratePercent: string;
    }[];
    explain: {
        matchedBy: string[];
        priority: number;
        baseType: string;
    };
}

/**
 * Convert Decimal to number safely
 */
function toNumber(val: Decimal | null | undefined): number | null {
    if (val === null || val === undefined) return null;
    return Number(val);
}

/**
 * Check if rule conditions match context
 */
function matchesConditions(
    ruleConditions: any,
    context: ResolveContext['context']
): { matches: boolean; matchedKeys: string[] } {
    if (!ruleConditions) {
        return { matches: true, matchedKeys: [] };
    }

    const matchedKeys: string[] = [];

    // hasNpwp
    if (ruleConditions.hasNpwp !== undefined && context?.hasNpwp !== undefined) {
        if (ruleConditions.hasNpwp !== context.hasNpwp) {
            return { matches: false, matchedKeys: [] };
        }
        matchedKeys.push('hasNpwp');
    }

    // countryCode
    if (ruleConditions.countryCode && context?.countryCode) {
        if (ruleConditions.countryCode !== context.countryCode) {
            return { matches: false, matchedKeys: [] };
        }
        matchedKeys.push('countryCode');
    }

    // incomeType
    if (ruleConditions.incomeType && context?.incomeType) {
        if (ruleConditions.incomeType !== context.incomeType) {
            return { matches: false, matchedKeys: [] };
        }
        matchedKeys.push('incomeType');
    }

    // ptkpCategory (can be array or string)
    if (ruleConditions.ptkpCategory && context?.ptkpCategory) {
        const categories = Array.isArray(ruleConditions.ptkpCategory)
            ? ruleConditions.ptkpCategory
            : [ruleConditions.ptkpCategory];
        if (!categories.includes(context.ptkpCategory)) {
            return { matches: false, matchedKeys: [] };
        }
        matchedKeys.push('ptkpCategory');
    }

    return { matches: true, matchedKeys };
}

/**
 * Calculate tax for PROGRESSIVE rate type
 */
function calculateProgressive(
    amount: number,
    brackets: TaxRateBracket[]
): { rate: number; tax: number } {
    let totalTax = 0;
    let remainingAmount = amount;

    for (const bracket of brackets) {
        const min = toNumber(bracket.minAmount) ?? 0;
        const max = toNumber(bracket.maxAmount);
        const rate = toNumber(bracket.rate) ?? 0;

        if (remainingAmount <= 0) break;
        if (amount < min) continue;

        const bracketMin = Math.max(0, min);
        const bracketMax = max ?? Infinity;
        const taxableInBracket = Math.min(remainingAmount, bracketMax - bracketMin);

        if (taxableInBracket > 0) {
            totalTax += taxableInBracket * rate;
            remainingAmount -= taxableInBracket;
        }
    }

    const effectiveRate = amount > 0 ? totalTax / amount : 0;
    return { rate: effectiveRate, tax: totalTax };
}

/**
 * Find matching rate in brackets for amount
 */
function findBracketRate(amount: number, brackets: TaxRateBracket[]): number {
    for (const bracket of brackets) {
        const min = toNumber(bracket.minAmount) ?? 0;
        const max = toNumber(bracket.maxAmount);

        if (amount >= min && (max === null || amount < max)) {
            return toNumber(bracket.rate) ?? 0;
        }
    }
    return 0;
}

/**
 * Main resolver function
 */
export async function resolveTaxRate(query: ResolveContext): Promise<ResolveResult | null> {
    const { category, objectCode, context } = query;
    const queryDate = context?.date ? new Date(context.date) : new Date();

    // Get category
    const cat = await prisma.taxRateCategory.findUnique({
        where: { code: category },
    });

    if (!cat) {
        console.warn(`[Resolver] Category not found: ${category}`);
        return null;
    }

    // Build query
    const where: any = {
        categoryId: cat.id,
        isActive: true,
        effectiveFrom: { lte: queryDate },
        OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: queryDate } },
        ],
    };

    if (objectCode) {
        where.objectCode = objectCode;
    }

    // Fetch matching rules
    const rules = await prisma.taxRateRule.findMany({
        where,
        include: {
            brackets: { orderBy: { orderIndex: 'asc' } },
        },
        orderBy: [
            { priority: 'desc' },
            { effectiveFrom: 'desc' },
        ],
    });

    if (rules.length === 0) {
        return null;
    }

    // Score and filter rules by conditions
    type ScoredRule = {
        rule: TaxRateRule & { brackets: TaxRateBracket[] };
        matchedKeys: string[];
        score: number;
    };

    const scoredRules: ScoredRule[] = [];

    for (const rule of rules) {
        const { matches, matchedKeys } = matchesConditions(rule.conditions, context);
        if (matches) {
            scoredRules.push({
                rule,
                matchedKeys,
                // Score: priority * 1000 + number of matched conditions * 10
                score: rule.priority * 1000 + matchedKeys.length * 10,
            });
        }
    }

    if (scoredRules.length === 0) {
        return null;
    }

    // Sort by score (highest first)
    scoredRules.sort((a, b) => b.score - a.score);

    // Pick best match
    const best = scoredRules[0];
    const rule = best.rule;

    // Calculate rate
    let rate: number;
    let withholding: number | undefined;

    if (rule.rateType === 'PROGRESSIVE' && rule.brackets.length > 0) {
        if (context?.amount) {
            const result = calculateProgressive(context.amount, rule.brackets);
            rate = result.rate;
            withholding = result.tax;
        } else {
            // Return first bracket rate if no amount
            rate = findBracketRate(0, rule.brackets);
        }
    } else {
        // FLAT or MATRIX
        rate = toNumber(rule.rateValue) ?? 0;

        // Apply multiplier if present
        const multiplier = toNumber(rule.multiplier);
        if (multiplier) {
            rate = rate * multiplier;
        }

        if (context?.amount) {
            withholding = context.amount * rate;
        }
    }

    // Format brackets for response
    const formattedBrackets = rule.brackets.length > 0
        ? rule.brackets.map(b => ({
            minAmount: toNumber(b.minAmount) ?? 0,
            maxAmount: toNumber(b.maxAmount),
            rate: toNumber(b.rate) ?? 0,
            ratePercent: `${((toNumber(b.rate) ?? 0) * 100).toFixed(2)}%`,
        }))
        : undefined;

    return {
        matchedRuleId: rule.id,
        ruleName: rule.name,
        rateType: rule.rateType,
        rate,
        ratePercent: `${(rate * 100).toFixed(2)}%`,
        withholding,
        effectiveFrom: rule.effectiveFrom.toISOString().split('T')[0],
        effectiveTo: rule.effectiveTo?.toISOString().split('T')[0],
        sourceRef: rule.sourceRef ?? undefined,
        conditions: rule.conditions as object | undefined,
        brackets: formattedBrackets,
        explain: {
            matchedBy: best.matchedKeys,
            priority: rule.priority,
            baseType: rule.baseType,
        },
    };
}

/**
 * Helper: Get PTKP amount for a status
 */
export async function getPTKPAmount(status: string): Promise<number | null> {
    const result = await resolveTaxRate({
        category: 'PTKP',
        objectCode: `PTKP_${status.replace('/', '_')}`,
    });

    return result?.rate ?? null;
}

/**
 * Helper: Get TER rate for income and PTKP category
 */
export async function getTERRate(
    monthlyIncome: number,
    ptkpCategory: string // e.g., "TK/0", "K/1"
): Promise<ResolveResult | null> {
    // Determine TER category based on PTKP status
    let terCategory: string;
    if (['TK/0', 'TK/1', 'K/0'].includes(ptkpCategory)) {
        terCategory = 'TER_A_BULANAN';
    } else if (['TK/2', 'TK/3', 'K/1', 'K/2'].includes(ptkpCategory)) {
        terCategory = 'TER_B_BULANAN';
    } else {
        terCategory = 'TER_C_BULANAN';
    }

    return resolveTaxRate({
        category: 'TER',
        objectCode: terCategory,
        context: {
            amount: monthlyIncome,
            ptkpCategory,
        },
    });
}
