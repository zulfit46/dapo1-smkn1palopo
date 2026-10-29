const fs = require('fs');
const path = require('path');

const codeGsPath = path.resolve(__dirname, 'code.gs');
const targetTsPath = path.resolve(__dirname, 'src/data/codeGsScript.ts');

const codeGs = fs.readFileSync(codeGsPath, 'utf-8');
const targetTs = fs.readFileSync(targetTsPath, 'utf-8');

const marker = 'export const CODE_GS_SCRIPT = `';
const idx = targetTs.indexOf(marker);
if (idx === -1) {
  console.error('Marker not found in ' + targetTsPath);
  process.exit(1);
}

const prefix = targetTs.substring(0, idx + marker.length);
// Escape backticks and ${}
const escaped = codeGs.replace(/`/g, '\\`').replace(/\${/g, '\\${');
fs.writeFileSync(targetTsPath, prefix + escaped + '`;\n');
console.log('Successfully updated src/data/codeGsScript.ts from code.gs');
