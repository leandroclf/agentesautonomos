require('module-alias/register');

try {
  require(process.argv[2]);
} catch (e) {
  console.error('Failed to load module:', e);
  process.exit(1);
}