#!/usr/bin/env node

/**
 * generate-password-hash.mjs
 *
 * Generate a PBKDF2 hash + salt for the admin password. Use the output with
 *   npx wrangler secret put ADMIN_PASSWORD_HASH
 *   npx wrangler secret put ADMIN_PASSWORD_SALT
 *   npx wrangler secret put ADMIN_SESSION_SECRET
 *
 * Usage:
 *   node scripts/generate-password-hash.mjs '<your-password>'
 */

import crypto from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/generate-password-hash.mjs "<password>"');
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(password, salt, 100_000, 32, 'sha256');
const sessionSecret = crypto.randomBytes(32).toString('base64');

console.log('');
console.log('=== Admin credentials ===');
console.log('');
console.log('ADMIN_PASSWORD_HASH:');
console.log(hash.toString('base64'));
console.log('');
console.log('ADMIN_PASSWORD_SALT:');
console.log(salt.toString('base64'));
console.log('');
console.log('ADMIN_SESSION_SECRET:');
console.log(sessionSecret);
console.log('');
console.log('To install in your Cloudflare Worker:');
console.log('  npx wrangler secret put ADMIN_PASSWORD_HASH     # paste the hash');
console.log('  npx wrangler secret put ADMIN_PASSWORD_SALT     # paste the salt');
console.log('  npx wrangler secret put ADMIN_SESSION_SECRET    # paste the session secret');
console.log('');
console.log('For local dev, add them to .dev.vars in the project root:');
console.log('  ADMIN_PASSWORD_HASH="<hash>"');
console.log('  ADMIN_PASSWORD_SALT="<salt>"');
console.log('  ADMIN_SESSION_SECRET="<secret>"');
console.log('');
