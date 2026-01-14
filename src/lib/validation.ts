import { z } from 'zod';

// Local enum values matching Prisma schema
const RegulationTypeValues = ['UU', 'PERPU', 'PP', 'PMK', 'PER', 'SE', 'KEP', 'NOTA_DINAS', 'PUTUSAN', 'BUKU', 'UNKNOWN'] as const;
const RegulationStatusValues = ['berlaku', 'diubah', 'dicabut', 'unknown'] as const;

// Upload file validation
export const uploadSchema = z.object({
    file: z.instanceof(File, { message: 'File is required' }),
});

// Metadata update validation
export const metadataUpdateSchema = z.object({
    jenis: z.enum(RegulationTypeValues).optional(),
    nomor: z.string().nullable().optional(),
    tahun: z.number().int().min(1900).max(2100).nullable().optional(),
    judul: z.string().nullable().optional(),
    tanggalTerbit: z.string().nullable().optional(), // ISO date string
    tanggalBerlaku: z.string().nullable().optional(), // ISO date string
    statusAturan: z.enum(RegulationStatusValues).optional(),
    approve: z.boolean().optional(), // If true, set document status to approved
    reviewerName: z.string().optional(), // Name of person approving
    reExtract: z.boolean().optional(), // If false, skip re-extraction when type changes (default true)
});

export type MetadataUpdateInput = z.infer<typeof metadataUpdateSchema>;

// Document ID validation
export const documentIdSchema = z.object({
    id: z.string().uuid(),
});
