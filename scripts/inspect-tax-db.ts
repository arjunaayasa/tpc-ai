
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspectTaxDB() {
    console.log('Inspecting Tax Rate Registry...');

    // 1. List Categories
    const categories = await prisma.taxRateCategory.findMany();
    console.log('\nCategories:', categories.map(c => `${c.code} (${c.id})`).join(', '));

    // 2. Check TER Rules
    const terCat = categories.find(c => c.code === 'TER');
    if (terCat) {
        console.log('\n--- TER RULES ---');
        const rules = await prisma.taxRateRule.findMany({
            where: { categoryId: terCat.id },
            orderBy: { priority: 'desc' },
            include: { brackets: true }
        });

        rules.forEach(r => {
            console.log(`\nRule: ${r.name}`);
            console.log(`Notes: ${r.notes}`);
            console.log(`Brackets: ${r.brackets.length}`);
        });
    } else {
        console.log('\n❌ TER Category not found!');
    }

    // 3. Check PTKP Rules
    const ptkpCat = categories.find(c => c.code === 'PTKP');
    if (ptkpCat) {
        console.log('\n--- PTKP RULES ---');
        const rules = await prisma.taxRateRule.findMany({
            where: { categoryId: ptkpCat.id },
            include: { brackets: true }
        });

        rules.forEach(r => {
            console.log(`\nRule: ${r.name}`);
            console.log(`Value: ${r.rateValue}`);
        });
    }
}

inspectTaxDB()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
