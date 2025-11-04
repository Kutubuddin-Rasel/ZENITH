/**
 * This is a patch file to fix the "this.log is not a function" error in pg-pool
 * 
 * To apply this patch, add the following to your package.json:
 * "scripts": {
 *   "postinstall": "node patches/pg-pool-fix.js"
 * }
 */

const fs = require('fs');
const path = require('path');

// Path to the pg-pool index.js file
const pgPoolPath = path.join(__dirname, '..', 'node_modules', 'pg-pool', 'index.js');

// Check if the file exists
if (!fs.existsSync(pgPoolPath)) {
  console.error('pg-pool module not found. Skipping patch.');
  process.exit(0);
}

// Read the file
let content = fs.readFileSync(pgPoolPath, 'utf8');

// Replace the problematic line
const problematicLine = 'this.log(\'checking client timeout\')';
const fixedLine = 'if (typeof this.log === \'function\') this.log(\'checking client timeout\')';

if (content.includes(problematicLine)) {
  content = content.replace(problematicLine, fixedLine);
  
  // Replace other occurrences
  content = content.replace('this.log(\'ending client due to timeout\')', 
                          'if (typeof this.log === \'function\') this.log(\'ending client due to timeout\')');
  
  content = content.replace('this.log(\'connection established\')', 
                          'if (typeof this.log === \'function\') this.log(\'connection established\')');
                          
  content = content.replace('this.log(\'removing client from pool due to error during connection\')', 
                          'if (typeof this.log === \'function\') this.log(\'removing client from pool due to error during connection\')');
  
  // Write the fixed content back to the file
  fs.writeFileSync(pgPoolPath, content, 'utf8');
  console.log('Successfully patched pg-pool to fix the "this.log is not a function" error.');
} else {
  console.log('The pg-pool file does not contain the expected code. Skipping patch.');
}
