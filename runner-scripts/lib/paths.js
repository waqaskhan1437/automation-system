/**
 * Shared Paths - No Duplication
 */
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const CONFIG_PATH = path.join(ROOT_DIR, 'automation-config.json');

module.exports = {
  ROOT_DIR,
  OUTPUT_DIR,
  CONFIG_PATH,
};
