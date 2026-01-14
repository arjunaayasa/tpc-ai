const fs = require('fs');
const file = 'src/worker/worker.ts';
let content = fs.readFileSync(file, 'utf8');

// Fix the malformed import line
content = content.replace(
    /import \{ parsePerpu, perpuChunkToDbFormat \} from '\.\.\/lib\/extractors\/perpu'; \\r\\nimport \{ parseUu, uuChunkToDbFormat \} from '\.\.\/lib\/extractors\/uu';/,
    "import { parsePerpu, perpuChunkToDbFormat } from '../lib/extractors/perpu';\r\nimport { parseUu, uuChunkToDbFormat } from '../lib/extractors/uu';"
);

fs.writeFileSync(file, content);
console.log('Fixed import line in worker.ts');
