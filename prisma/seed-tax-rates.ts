/**
 * Tax Rate Registry - Seed Script
 * 
 * Seeds all baseline tax rates for Indonesian taxation:
 * - PPN (11%, future 12%)
 * - PPh 21 Progressive + TER (Tarif Efektif Rata-rata)
 * - PTKP (Penghasilan Tidak Kena Pajak)
 * - PPh 23 (Jasa, Dividen, dll)
 * - PPh 26 (Withholding for non-residents)
 * - PPh Badan (22%)
 * - PPh Final (Sewa, UMKM, dll)
 * - PPnBM (placeholder)
 * 
 * Run with: npx tsx prisma/seed-tax-rates.ts
 */

import { PrismaClient, TaxRateType, TaxBaseType } from '@prisma/client';

const prisma = new PrismaClient();

// Effective dates
const DATE_2022_01 = new Date('2022-01-01');
const DATE_2024_01 = new Date('2024-01-01');
const DATE_2025_01 = new Date('2025-01-01');

interface CategorySeed {
    code: string;
    name: string;
    description: string;
}

interface RuleSeed {
    categoryCode: string;
    name: string;
    objectCode: string;
    rateType: TaxRateType;
    baseType?: TaxBaseType;
    rateValue?: number;
    multiplier?: number;
    conditions?: object;
    effectiveFrom: Date;
    effectiveTo?: Date;
    priority?: number;
    sourceRef?: string;
    notes?: string;
    brackets?: { minAmount: number; maxAmount: number | null; rate: number }[];
}

// ============== CATEGORIES ==============

const categories: CategorySeed[] = [
    { code: 'PPN', name: 'Pajak Pertambahan Nilai', description: 'Value Added Tax (VAT)' },
    { code: 'PPh21', name: 'PPh Pasal 21', description: 'Pajak Penghasilan atas penghasilan sehubungan dengan pekerjaan' },
    { code: 'TER', name: 'Tarif Efektif Rata-rata', description: 'Tarif efektif PPh 21 bulanan per kategori PTKP' },
    { code: 'PTKP', name: 'Penghasilan Tidak Kena Pajak', description: 'Non-taxable income threshold' },
    { code: 'PPh23', name: 'PPh Pasal 23', description: 'Withholding tax on domestic payments' },
    { code: 'PPh26', name: 'PPh Pasal 26', description: 'Withholding tax on payments to non-residents' },
    { code: 'PPhBadan', name: 'PPh Badan', description: 'Corporate Income Tax' },
    { code: 'PPhFinal', name: 'PPh Final (Pasal 4 ayat 2)', description: 'Final income tax on specific transactions' },
    { code: 'PPnBM', name: 'Pajak Penjualan Barang Mewah', description: 'Luxury Goods Sales Tax' },
    { code: 'PKP', name: 'Pengusaha Kena Pajak', description: 'VAT registration threshold' },
];

// ============== RULES ==============

const rules: RuleSeed[] = [
    // ===== PPN =====
    {
        categoryCode: 'PPN',
        name: 'PPN Umum 11%',
        objectCode: 'PPN_GENERAL_11',
        rateType: TaxRateType.FLAT,
        baseType: TaxBaseType.DPP,
        rateValue: 0.11,
        effectiveFrom: DATE_2022_01,
        effectiveTo: new Date('2024-12-31'),
        sourceRef: 'UU HPP No. 7/2021',
        notes: 'Tarif PPN 11% berlaku sejak 1 April 2022',
    },
    {
        categoryCode: 'PPN',
        name: 'PPN Umum 12%',
        objectCode: 'PPN_GENERAL_12',
        rateType: TaxRateType.FLAT,
        baseType: TaxBaseType.DPP,
        rateValue: 0.12,
        effectiveFrom: DATE_2025_01,
        sourceRef: 'UU HPP No. 7/2021',
        notes: 'Tarif PPN 12% berlaku mulai 1 Januari 2025',
    },

    // ===== PPh 21 Progressive =====
    {
        categoryCode: 'PPh21',
        name: 'PPh 21 Tarif Progresif',
        objectCode: 'PPh21_PROGRESSIVE',
        rateType: TaxRateType.PROGRESSIVE,
        baseType: TaxBaseType.NET, // PKP = Penghasilan Kena Pajak
        effectiveFrom: DATE_2022_01,
        sourceRef: 'UU HPP No. 7/2021, Pasal 17 ayat 1',
        notes: 'Tarif progresif PPh 21 untuk WP OP Dalam Negeri',
        brackets: [
            { minAmount: 0, maxAmount: 60000000, rate: 0.05 },
            { minAmount: 60000000, maxAmount: 250000000, rate: 0.15 },
            { minAmount: 250000000, maxAmount: 500000000, rate: 0.25 },
            { minAmount: 500000000, maxAmount: 5000000000, rate: 0.30 },
            { minAmount: 5000000000, maxAmount: null, rate: 0.35 },
        ],
    },

    // ===== TER (Tarif Efektif Rata-rata) - PP 58/2023 =====
    // Kategori A: TK/0, TK/1, K/0
    {
        categoryCode: 'TER',
        name: 'TER Kategori A - Bulanan',
        objectCode: 'TER_A_BULANAN',
        rateType: TaxRateType.PROGRESSIVE,
        baseType: TaxBaseType.GROSS,
        conditions: { ptkpCategory: ['TK/0', 'TK/1', 'K/0'] },
        effectiveFrom: DATE_2024_01,
        sourceRef: 'PP 58/2023, PMK 168/2023',
        priority: 110,
        notes: 'TER Kategori A untuk status TK/0, TK/1, K/0',
        brackets: [
            { minAmount: 0, maxAmount: 5400000, rate: 0 },
            { minAmount: 5400000, maxAmount: 5650000, rate: 0.0025 },
            { minAmount: 5650000, maxAmount: 5950000, rate: 0.005 },
            { minAmount: 5950000, maxAmount: 6300000, rate: 0.0075 },
            { minAmount: 6300000, maxAmount: 6750000, rate: 0.01 },
            { minAmount: 6750000, maxAmount: 7500000, rate: 0.0125 },
            { minAmount: 7500000, maxAmount: 8550000, rate: 0.015 },
            { minAmount: 8550000, maxAmount: 9650000, rate: 0.0175 },
            { minAmount: 9650000, maxAmount: 10050000, rate: 0.02 },
            { minAmount: 10050000, maxAmount: 10350000, rate: 0.0225 },
            { minAmount: 10350000, maxAmount: 10700000, rate: 0.025 },
            { minAmount: 10700000, maxAmount: 11050000, rate: 0.03 },
            { minAmount: 11050000, maxAmount: 11600000, rate: 0.035 },
            { minAmount: 11600000, maxAmount: 12500000, rate: 0.04 },
            { minAmount: 12500000, maxAmount: 13750000, rate: 0.05 },
            { minAmount: 13750000, maxAmount: 15100000, rate: 0.06 },
            { minAmount: 15100000, maxAmount: 16950000, rate: 0.07 },
            { minAmount: 16950000, maxAmount: 19750000, rate: 0.08 },
            { minAmount: 19750000, maxAmount: 24150000, rate: 0.09 },
            { minAmount: 24150000, maxAmount: 26450000, rate: 0.10 },
            { minAmount: 26450000, maxAmount: 28000000, rate: 0.11 },
            { minAmount: 28000000, maxAmount: 30050000, rate: 0.12 },
            { minAmount: 30050000, maxAmount: 32400000, rate: 0.13 },
            { minAmount: 32400000, maxAmount: 35400000, rate: 0.14 },
            { minAmount: 35400000, maxAmount: 39100000, rate: 0.15 },
            { minAmount: 39100000, maxAmount: 43850000, rate: 0.16 },
            { minAmount: 43850000, maxAmount: 47800000, rate: 0.17 },
            { minAmount: 47800000, maxAmount: 51400000, rate: 0.18 },
            { minAmount: 51400000, maxAmount: 56300000, rate: 0.19 },
            { minAmount: 56300000, maxAmount: 62200000, rate: 0.20 },
            { minAmount: 62200000, maxAmount: 68600000, rate: 0.21 },
            { minAmount: 68600000, maxAmount: 77500000, rate: 0.22 },
            { minAmount: 77500000, maxAmount: 89000000, rate: 0.23 },
            { minAmount: 89000000, maxAmount: 103000000, rate: 0.24 },
            { minAmount: 103000000, maxAmount: 125000000, rate: 0.25 },
            { minAmount: 125000000, maxAmount: 157000000, rate: 0.26 },
            { minAmount: 157000000, maxAmount: 206000000, rate: 0.27 },
            { minAmount: 206000000, maxAmount: 337000000, rate: 0.28 },
            { minAmount: 337000000, maxAmount: 454000000, rate: 0.29 },
            { minAmount: 454000000, maxAmount: 550000000, rate: 0.30 },
            { minAmount: 550000000, maxAmount: 695000000, rate: 0.31 },
            { minAmount: 695000000, maxAmount: 910000000, rate: 0.32 },
            { minAmount: 910000000, maxAmount: 1400000000, rate: 0.33 },
            { minAmount: 1400000000, maxAmount: null, rate: 0.34 },
        ],
    },
    // Kategori B: TK/2, TK/3, K/1, K/2
    {
        categoryCode: 'TER',
        name: 'TER Kategori B - Bulanan',
        objectCode: 'TER_B_BULANAN',
        rateType: TaxRateType.PROGRESSIVE,
        baseType: TaxBaseType.GROSS,
        conditions: { ptkpCategory: ['TK/2', 'TK/3', 'K/1', 'K/2'] },
        effectiveFrom: DATE_2024_01,
        sourceRef: 'PP 58/2023, PMK 168/2023',
        priority: 110,
        notes: 'TER Kategori B untuk status TK/2, TK/3, K/1, K/2',
        brackets: [
            { minAmount: 0, maxAmount: 6200000, rate: 0 },
            { minAmount: 6200000, maxAmount: 6500000, rate: 0.0025 },
            { minAmount: 6500000, maxAmount: 6850000, rate: 0.005 },
            { minAmount: 6850000, maxAmount: 7300000, rate: 0.0075 },
            { minAmount: 7300000, maxAmount: 9200000, rate: 0.01 },
            { minAmount: 9200000, maxAmount: 10750000, rate: 0.015 },
            { minAmount: 10750000, maxAmount: 11250000, rate: 0.02 },
            { minAmount: 11250000, maxAmount: 11600000, rate: 0.025 },
            { minAmount: 11600000, maxAmount: 12600000, rate: 0.03 },
            { minAmount: 12600000, maxAmount: 13600000, rate: 0.04 },
            { minAmount: 13600000, maxAmount: 14950000, rate: 0.05 },
            { minAmount: 14950000, maxAmount: 16400000, rate: 0.06 },
            { minAmount: 16400000, maxAmount: 18450000, rate: 0.07 },
            { minAmount: 18450000, maxAmount: 21850000, rate: 0.08 },
            { minAmount: 21850000, maxAmount: 26000000, rate: 0.09 },
            { minAmount: 26000000, maxAmount: 27700000, rate: 0.10 },
            { minAmount: 27700000, maxAmount: 29350000, rate: 0.11 },
            { minAmount: 29350000, maxAmount: 31450000, rate: 0.12 },
            { minAmount: 31450000, maxAmount: 33950000, rate: 0.13 },
            { minAmount: 33950000, maxAmount: 37100000, rate: 0.14 },
            { minAmount: 37100000, maxAmount: 41100000, rate: 0.15 },
            { minAmount: 41100000, maxAmount: 45800000, rate: 0.16 },
            { minAmount: 45800000, maxAmount: 49500000, rate: 0.17 },
            { minAmount: 49500000, maxAmount: 53800000, rate: 0.18 },
            { minAmount: 53800000, maxAmount: 58500000, rate: 0.19 },
            { minAmount: 58500000, maxAmount: 64000000, rate: 0.20 },
            { minAmount: 64000000, maxAmount: 71000000, rate: 0.21 },
            { minAmount: 71000000, maxAmount: 80000000, rate: 0.22 },
            { minAmount: 80000000, maxAmount: 93000000, rate: 0.23 },
            { minAmount: 93000000, maxAmount: 109000000, rate: 0.24 },
            { minAmount: 109000000, maxAmount: 129000000, rate: 0.25 },
            { minAmount: 129000000, maxAmount: 163000000, rate: 0.26 },
            { minAmount: 163000000, maxAmount: 211000000, rate: 0.27 },
            { minAmount: 211000000, maxAmount: 374000000, rate: 0.28 },
            { minAmount: 374000000, maxAmount: 459000000, rate: 0.29 },
            { minAmount: 459000000, maxAmount: 555000000, rate: 0.30 },
            { minAmount: 555000000, maxAmount: 704000000, rate: 0.31 },
            { minAmount: 704000000, maxAmount: 957000000, rate: 0.32 },
            { minAmount: 957000000, maxAmount: 1405000000, rate: 0.33 },
            { minAmount: 1405000000, maxAmount: null, rate: 0.34 },
        ],
    },
    // Kategori C: K/3
    {
        categoryCode: 'TER',
        name: 'TER Kategori C - Bulanan',
        objectCode: 'TER_C_BULANAN',
        rateType: TaxRateType.PROGRESSIVE,
        baseType: TaxBaseType.GROSS,
        conditions: { ptkpCategory: ['K/3'] },
        effectiveFrom: DATE_2024_01,
        sourceRef: 'PP 58/2023, PMK 168/2023',
        priority: 110,
        notes: 'TER Kategori C untuk status K/3',
        brackets: [
            { minAmount: 0, maxAmount: 6600000, rate: 0 },
            { minAmount: 6600000, maxAmount: 6950000, rate: 0.0025 },
            { minAmount: 6950000, maxAmount: 7350000, rate: 0.005 },
            { minAmount: 7350000, maxAmount: 7800000, rate: 0.0075 },
            { minAmount: 7800000, maxAmount: 8850000, rate: 0.01 },
            { minAmount: 8850000, maxAmount: 9800000, rate: 0.0125 },
            { minAmount: 9800000, maxAmount: 10950000, rate: 0.015 },
            { minAmount: 10950000, maxAmount: 11200000, rate: 0.0175 },
            { minAmount: 11200000, maxAmount: 12050000, rate: 0.02 },
            { minAmount: 12050000, maxAmount: 12950000, rate: 0.03 },
            { minAmount: 12950000, maxAmount: 14150000, rate: 0.04 },
            { minAmount: 14150000, maxAmount: 15550000, rate: 0.05 },
            { minAmount: 15550000, maxAmount: 17050000, rate: 0.06 },
            { minAmount: 17050000, maxAmount: 19500000, rate: 0.07 },
            { minAmount: 19500000, maxAmount: 22700000, rate: 0.08 },
            { minAmount: 22700000, maxAmount: 26600000, rate: 0.09 },
            { minAmount: 26600000, maxAmount: 28100000, rate: 0.10 },
            { minAmount: 28100000, maxAmount: 30100000, rate: 0.11 },
            { minAmount: 30100000, maxAmount: 32600000, rate: 0.12 },
            { minAmount: 32600000, maxAmount: 35400000, rate: 0.13 },
            { minAmount: 35400000, maxAmount: 38900000, rate: 0.14 },
            { minAmount: 38900000, maxAmount: 43000000, rate: 0.15 },
            { minAmount: 43000000, maxAmount: 47400000, rate: 0.16 },
            { minAmount: 47400000, maxAmount: 51200000, rate: 0.17 },
            { minAmount: 51200000, maxAmount: 55800000, rate: 0.18 },
            { minAmount: 55800000, maxAmount: 60400000, rate: 0.19 },
            { minAmount: 60400000, maxAmount: 66700000, rate: 0.20 },
            { minAmount: 66700000, maxAmount: 74500000, rate: 0.21 },
            { minAmount: 74500000, maxAmount: 83200000, rate: 0.22 },
            { minAmount: 83200000, maxAmount: 95000000, rate: 0.23 },
            { minAmount: 95000000, maxAmount: 110000000, rate: 0.24 },
            { minAmount: 110000000, maxAmount: 134000000, rate: 0.25 },
            { minAmount: 134000000, maxAmount: 169000000, rate: 0.26 },
            { minAmount: 169000000, maxAmount: 221000000, rate: 0.27 },
            { minAmount: 221000000, maxAmount: 390000000, rate: 0.28 },
            { minAmount: 390000000, maxAmount: 463000000, rate: 0.29 },
            { minAmount: 463000000, maxAmount: 561000000, rate: 0.30 },
            { minAmount: 561000000, maxAmount: 709000000, rate: 0.31 },
            { minAmount: 709000000, maxAmount: 965000000, rate: 0.32 },
            { minAmount: 965000000, maxAmount: 1419000000, rate: 0.33 },
            { minAmount: 1419000000, maxAmount: null, rate: 0.34 },
        ],
    },

    // ===== PTKP =====
    {
        categoryCode: 'PTKP',
        name: 'PTKP TK/0 (Tidak Kawin, Tanpa Tanggungan)',
        objectCode: 'PTKP_TK_0',
        rateType: TaxRateType.FLAT,
        rateValue: 54000000, // Stored as amount, not rate
        conditions: { status: 'TK', tanggungan: 0 },
        effectiveFrom: DATE_2022_01,
        sourceRef: 'PMK 101/PMK.010/2016',
        notes: 'PTKP untuk WP tidak kawin tanpa tanggungan: Rp54.000.000/tahun',
    },
    {
        categoryCode: 'PTKP',
        name: 'PTKP TK/1',
        objectCode: 'PTKP_TK_1',
        rateType: TaxRateType.FLAT,
        rateValue: 58500000,
        conditions: { status: 'TK', tanggungan: 1 },
        effectiveFrom: DATE_2022_01,
        sourceRef: 'PMK 101/PMK.010/2016',
    },
    {
        categoryCode: 'PTKP',
        name: 'PTKP TK/2',
        objectCode: 'PTKP_TK_2',
        rateType: TaxRateType.FLAT,
        rateValue: 63000000,
        conditions: { status: 'TK', tanggungan: 2 },
        effectiveFrom: DATE_2022_01,
        sourceRef: 'PMK 101/PMK.010/2016',
    },
    {
        categoryCode: 'PTKP',
        name: 'PTKP TK/3',
        objectCode: 'PTKP_TK_3',
        rateType: TaxRateType.FLAT,
        rateValue: 67500000,
        conditions: { status: 'TK', tanggungan: 3 },
        effectiveFrom: DATE_2022_01,
        sourceRef: 'PMK 101/PMK.010/2016',
    },
    {
        categoryCode: 'PTKP',
        name: 'PTKP K/0 (Kawin, Tanpa Tanggungan)',
        objectCode: 'PTKP_K_0',
        rateType: TaxRateType.FLAT,
        rateValue: 58500000,
        conditions: { status: 'K', tanggungan: 0 },
        effectiveFrom: DATE_2022_01,
        sourceRef: 'PMK 101/PMK.010/2016',
    },
    {
        categoryCode: 'PTKP',
        name: 'PTKP K/1',
        objectCode: 'PTKP_K_1',
        rateType: TaxRateType.FLAT,
        rateValue: 63000000,
        conditions: { status: 'K', tanggungan: 1 },
        effectiveFrom: DATE_2022_01,
        sourceRef: 'PMK 101/PMK.010/2016',
    },
    {
        categoryCode: 'PTKP',
        name: 'PTKP K/2',
        objectCode: 'PTKP_K_2',
        rateType: TaxRateType.FLAT,
        rateValue: 67500000,
        conditions: { status: 'K', tanggungan: 2 },
        effectiveFrom: DATE_2022_01,
        sourceRef: 'PMK 101/PMK.010/2016',
    },
    {
        categoryCode: 'PTKP',
        name: 'PTKP K/3',
        objectCode: 'PTKP_K_3',
        rateType: TaxRateType.FLAT,
        rateValue: 72000000,
        conditions: { status: 'K', tanggungan: 3 },
        effectiveFrom: DATE_2022_01,
        sourceRef: 'PMK 101/PMK.010/2016',
    },

    // ===== PPh 23 =====
    {
        categoryCode: 'PPh23',
        name: 'PPh 23 Jasa (dengan NPWP)',
        objectCode: 'PPh23_JASA',
        rateType: TaxRateType.FLAT,
        baseType: TaxBaseType.GROSS,
        rateValue: 0.02,
        conditions: { hasNpwp: true, incomeType: 'JASA' },
        effectiveFrom: DATE_2022_01,
        priority: 100,
        sourceRef: 'Pasal 23 ayat (1) huruf c UU PPh',
        notes: 'Tarif 2% untuk jasa teknik, manajemen, konsultan, dll',
    },
    {
        categoryCode: 'PPh23',
        name: 'PPh 23 Jasa (tanpa NPWP)',
        objectCode: 'PPh23_JASA_NO_NPWP',
        rateType: TaxRateType.FLAT,
        baseType: TaxBaseType.GROSS,
        rateValue: 0.04, // 2% x 2 (100% lebih tinggi)
        conditions: { hasNpwp: false, incomeType: 'JASA' },
        effectiveFrom: DATE_2022_01,
        priority: 110,
        sourceRef: 'Pasal 21 ayat (5a) UU PPh',
        notes: 'Tarif 4% (100% lebih tinggi) untuk penerima tanpa NPWP',
    },
    {
        categoryCode: 'PPh23',
        name: 'PPh 23 Sewa (dengan NPWP)',
        objectCode: 'PPh23_SEWA',
        rateType: TaxRateType.FLAT,
        baseType: TaxBaseType.GROSS,
        rateValue: 0.02,
        conditions: { hasNpwp: true, incomeType: 'SEWA' },
        effectiveFrom: DATE_2022_01,
        sourceRef: 'Pasal 23 ayat (1) huruf c UU PPh',
        notes: 'Sewa selain tanah/bangunan',
    },
    {
        categoryCode: 'PPh23',
        name: 'PPh 23 Dividen (dengan NPWP)',
        objectCode: 'PPh23_DIVIDEN',
        rateType: TaxRateType.FLAT,
        baseType: TaxBaseType.GROSS,
        rateValue: 0.15,
        conditions: { hasNpwp: true, incomeType: 'DIVIDEN' },
        effectiveFrom: DATE_2022_01,
        sourceRef: 'Pasal 23 ayat (1) huruf a UU PPh',
    },
    {
        categoryCode: 'PPh23',
        name: 'PPh 23 Bunga (dengan NPWP)',
        objectCode: 'PPh23_BUNGA',
        rateType: TaxRateType.FLAT,
        baseType: TaxBaseType.GROSS,
        rateValue: 0.15,
        conditions: { hasNpwp: true, incomeType: 'BUNGA' },
        effectiveFrom: DATE_2022_01,
        sourceRef: 'Pasal 23 ayat (1) huruf a UU PPh',
    },
    {
        categoryCode: 'PPh23',
        name: 'PPh 23 Royalti (dengan NPWP)',
        objectCode: 'PPh23_ROYALTI',
        rateType: TaxRateType.FLAT,
        baseType: TaxBaseType.GROSS,
        rateValue: 0.15,
        conditions: { hasNpwp: true, incomeType: 'ROYALTI' },
        effectiveFrom: DATE_2022_01,
        sourceRef: 'Pasal 23 ayat (1) huruf a UU PPh',
    },

    // ===== PPh 26 =====
    {
        categoryCode: 'PPh26',
        name: 'PPh 26 Default',
        objectCode: 'PPh26_DEFAULT',
        rateType: TaxRateType.FLAT,
        baseType: TaxBaseType.GROSS,
        rateValue: 0.20,
        effectiveFrom: DATE_2022_01,
        priority: 50,
        sourceRef: 'Pasal 26 ayat (1) UU PPh',
        notes: 'Tarif umum 20% untuk pembayaran ke WPLN',
    },
    // Treaty rates examples (MATRIX type)
    {
        categoryCode: 'PPh26',
        name: 'PPh 26 Dividen - Singapura (P3B)',
        objectCode: 'PPh26_DIV_SG',
        rateType: TaxRateType.MATRIX,
        baseType: TaxBaseType.GROSS,
        rateValue: 0.10,
        conditions: { countryCode: 'SG', incomeType: 'DIVIDEND' },
        effectiveFrom: DATE_2022_01,
        priority: 200,
        sourceRef: 'P3B Indonesia-Singapura',
        notes: 'Treaty rate dividen ke Singapura: 10%',
    },
    {
        categoryCode: 'PPh26',
        name: 'PPh 26 Bunga - Singapura (P3B)',
        objectCode: 'PPh26_INT_SG',
        rateType: TaxRateType.MATRIX,
        baseType: TaxBaseType.GROSS,
        rateValue: 0.10,
        conditions: { countryCode: 'SG', incomeType: 'INTEREST' },
        effectiveFrom: DATE_2022_01,
        priority: 200,
        sourceRef: 'P3B Indonesia-Singapura',
    },
    {
        categoryCode: 'PPh26',
        name: 'PPh 26 Royalti - Singapura (P3B)',
        objectCode: 'PPh26_ROY_SG',
        rateType: TaxRateType.MATRIX,
        baseType: TaxBaseType.GROSS,
        rateValue: 0.15,
        conditions: { countryCode: 'SG', incomeType: 'ROYALTY' },
        effectiveFrom: DATE_2022_01,
        priority: 200,
        sourceRef: 'P3B Indonesia-Singapura',
    },

    // ===== PPh Badan =====
    {
        categoryCode: 'PPhBadan',
        name: 'PPh Badan Umum',
        objectCode: 'PPhBadan_GENERAL',
        rateType: TaxRateType.FLAT,
        baseType: TaxBaseType.NET,
        rateValue: 0.22,
        effectiveFrom: DATE_2022_01,
        sourceRef: 'Pasal 17 ayat (1) huruf b UU PPh (UU HPP)',
        notes: 'Tarif PPh Badan 22% untuk WP Badan DN',
    },

    // ===== PPh Final =====
    {
        categoryCode: 'PPhFinal',
        name: 'PPh Final Sewa Tanah/Bangunan',
        objectCode: 'PPhFinal_SEWA_TB',
        rateType: TaxRateType.FLAT,
        baseType: TaxBaseType.GROSS,
        rateValue: 0.10,
        effectiveFrom: DATE_2022_01,
        sourceRef: 'PP 34/2017',
        notes: 'PPh Final 10% atas sewa tanah dan/atau bangunan',
    },
    {
        categoryCode: 'PPhFinal',
        name: 'PPh Final UMKM',
        objectCode: 'PPhFinal_UMKM',
        rateType: TaxRateType.FLAT,
        baseType: TaxBaseType.GROSS,
        rateValue: 0.005,
        conditions: { isUMKM: true },
        effectiveFrom: DATE_2022_01,
        sourceRef: 'PP 55/2022',
        notes: 'PPh Final 0.5% untuk WP dengan omzet <= 4.8M/tahun',
    },
    {
        categoryCode: 'PPhFinal',
        name: 'PPh Final Jasa Konstruksi - Perencana/Pengawas',
        objectCode: 'PPhFinal_KONSTRUKSI_PP',
        rateType: TaxRateType.FLAT,
        baseType: TaxBaseType.GROSS,
        rateValue: 0.04,
        conditions: { constructionType: 'PLANNING_SUPERVISION' },
        effectiveFrom: DATE_2022_01,
        sourceRef: 'PP 9/2022',
    },
    {
        categoryCode: 'PPhFinal',
        name: 'PPh Final Jasa Konstruksi - Pelaksana (Kualifikasi Kecil)',
        objectCode: 'PPhFinal_KONSTRUKSI_EXEC_SMALL',
        rateType: TaxRateType.FLAT,
        baseType: TaxBaseType.GROSS,
        rateValue: 0.02,
        conditions: { constructionType: 'EXECUTION', qualification: 'SMALL' },
        effectiveFrom: DATE_2022_01,
        sourceRef: 'PP 9/2022',
    },
    {
        categoryCode: 'PPhFinal',
        name: 'PPh Final Jasa Konstruksi - Pelaksana (Non-Kualifikasi)',
        objectCode: 'PPhFinal_KONSTRUKSI_EXEC_NO_QUAL',
        rateType: TaxRateType.FLAT,
        baseType: TaxBaseType.GROSS,
        rateValue: 0.04,
        conditions: { constructionType: 'EXECUTION', qualification: 'NONE' },
        effectiveFrom: DATE_2022_01,
        sourceRef: 'PP 9/2022',
    },
    {
        categoryCode: 'PPhFinal',
        name: 'PPh Final Pengalihan Hak Tanah/Bangunan',
        objectCode: 'PPhFinal_PHTB',
        rateType: TaxRateType.FLAT,
        baseType: TaxBaseType.GROSS,
        rateValue: 0.025,
        effectiveFrom: DATE_2022_01,
        sourceRef: 'PP 34/2016',
        notes: 'PPh Final 2.5% atas pengalihan hak atas tanah dan/atau bangunan',
    },

    // ===== PKP Threshold =====
    {
        categoryCode: 'PKP',
        name: 'Threshold PKP (Pengusaha Kena Pajak)',
        objectCode: 'PKP_THRESHOLD',
        rateType: TaxRateType.FLAT,
        rateValue: 4800000000, // Rp 4.8 Miliar
        effectiveFrom: DATE_2022_01,
        sourceRef: 'PMK 197/PMK.03/2013',
        notes: 'Pengusaha dengan peredaran bruto >Rp4,8 Miliar/tahun wajib dikukuhkan sebagai PKP',
    },
];

// ============== MAIN SEED FUNCTION ==============

async function main() {
    console.log('🌱 Seeding tax rate registry...');

    // Seed categories
    console.log('\n📁 Seeding categories...');
    for (const cat of categories) {
        await prisma.taxRateCategory.upsert({
            where: { code: cat.code },
            update: { name: cat.name, description: cat.description },
            create: cat,
        });
        console.log(`  ✅ ${cat.code}: ${cat.name}`);
    }

    // Get category map
    const categoryMap = new Map<string, string>();
    const allCategories = await prisma.taxRateCategory.findMany();
    for (const cat of allCategories) {
        categoryMap.set(cat.code, cat.id);
    }

    // Seed rules
    console.log('\n📋 Seeding rules...');
    for (const rule of rules) {
        const categoryId = categoryMap.get(rule.categoryCode);
        if (!categoryId) {
            console.warn(`  ⚠️ Category not found: ${rule.categoryCode}`);
            continue;
        }

        // Check if rule exists
        const existing = await prisma.taxRateRule.findFirst({
            where: {
                categoryId,
                objectCode: rule.objectCode,
                effectiveFrom: rule.effectiveFrom,
            },
        });

        if (existing) {
            // Update existing rule
            await prisma.taxRateRule.update({
                where: { id: existing.id },
                data: {
                    name: rule.name,
                    rateType: rule.rateType,
                    baseType: rule.baseType ?? TaxBaseType.GROSS,
                    rateValue: rule.rateValue,
                    multiplier: rule.multiplier,
                    conditions: rule.conditions,
                    effectiveTo: rule.effectiveTo,
                    priority: rule.priority ?? 100,
                    sourceRef: rule.sourceRef,
                    notes: rule.notes,
                },
            });
            console.log(`  ♻️ Updated: ${rule.objectCode}`);

            // Update brackets if provided
            if (rule.brackets) {
                await prisma.taxRateBracket.deleteMany({ where: { ruleId: existing.id } });
                for (let i = 0; i < rule.brackets.length; i++) {
                    const b = rule.brackets[i];
                    await prisma.taxRateBracket.create({
                        data: {
                            ruleId: existing.id,
                            minAmount: b.minAmount,
                            maxAmount: b.maxAmount,
                            rate: b.rate,
                            orderIndex: i,
                        },
                    });
                }
                console.log(`    📊 Updated ${rule.brackets.length} brackets`);
            }
        } else {
            // Create new rule
            const created = await prisma.taxRateRule.create({
                data: {
                    categoryId,
                    name: rule.name,
                    objectCode: rule.objectCode,
                    rateType: rule.rateType,
                    baseType: rule.baseType ?? TaxBaseType.GROSS,
                    rateValue: rule.rateValue,
                    multiplier: rule.multiplier,
                    conditions: rule.conditions,
                    effectiveFrom: rule.effectiveFrom,
                    effectiveTo: rule.effectiveTo,
                    priority: rule.priority ?? 100,
                    sourceRef: rule.sourceRef,
                    notes: rule.notes,
                },
            });
            console.log(`  ✅ Created: ${rule.objectCode}`);

            // Create brackets if provided
            if (rule.brackets) {
                for (let i = 0; i < rule.brackets.length; i++) {
                    const b = rule.brackets[i];
                    await prisma.taxRateBracket.create({
                        data: {
                            ruleId: created.id,
                            minAmount: b.minAmount,
                            maxAmount: b.maxAmount,
                            rate: b.rate,
                            orderIndex: i,
                        },
                    });
                }
                console.log(`    📊 Created ${rule.brackets.length} brackets`);
            }
        }
    }

    // Summary
    const ruleCount = await prisma.taxRateRule.count();
    const bracketCount = await prisma.taxRateBracket.count();
    console.log(`\n✨ Seed complete!`);
    console.log(`   Categories: ${categories.length}`);
    console.log(`   Rules: ${ruleCount}`);
    console.log(`   Brackets: ${bracketCount}`);
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
