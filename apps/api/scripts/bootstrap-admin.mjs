import { createCipheriv, randomBytes } from 'node:crypto';
import { stdin, stdout } from 'node:process';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { generateSecret, generateURI, verify } from 'otplib';
import { createFirstAdministrator } from './bootstrap-admin-core.mjs';

const PASSWORD_MIN_LENGTH = 15;
const PASSWORD_MAX_LENGTH = 128;
const RECOVERY_COUNT = 10;
const ARGON_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

if (!stdin.isTTY || !stdout.isTTY || process.argv[2] !== '--confirm') {
  throw new Error('First-admin bootstrap requires an interactive TTY and the explicit --confirm flag.');
}

const required = name => {
  const value = process.env[name];
  if (!value || value.trim() === '') throw new Error(`${name} is required.`);
  return value;
};

const prisma = new PrismaClient({ datasources: { db: { url: required('DATABASE_URL') } } });
const hashSecret = required('AUTH_HASH_SECRET');
const encryptionKey = decodeKey(required('AUTH_TOTP_ENCRYPTION_KEY'));

try {
  const email = (await question('Administrator email: ')).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/u.test(email)) throw new Error('A valid email is required.');
  const password = await hidden('Password: ');
  if (password !== (await hidden('Confirm password: '))) throw new Error('Passwords do not match.');
  if (Array.from(password).length < PASSWORD_MIN_LENGTH || Array.from(password).length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Password must contain ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters.`);
  }

  const secret = generateSecret();
  stdout.write(`\nConfigure this TOTP secret before continuing:\n${secret}\n${generateURI({ issuer: 'Iraniyaragh', label: email, secret })}\n`);
  if (!(await verify({ secret, token: (await question('Current TOTP code: ')).trim(), epochTolerance: 30 })).valid) {
    throw new Error('TOTP confirmation failed.');
  }

  const now = new Date();
  const passwordHash = await argon2.hash(password, { ...ARGON_OPTIONS, raw: false });
  const encrypted = encrypt(secret, encryptionKey);
  const recoveryCodes = Array.from({ length: RECOVERY_COUNT }, () => `RECOVERY-${randomBytes(10).toString('base64url').toUpperCase()}`);

  const outcome = await createFirstAdministrator({
    prisma,
    email,
    passwordHash,
    encryptedSecret: encrypted,
    encryptionKeyVersion: 'v1',
    recoveryCodes,
    hashSecret,
    operator: 'tty',
  });
  if (outcome.status !== 'CREATED') {
    throw new Error('An active system-admin already exists; bootstrap refuses replacement.');
  }

  stdout.write(`\nBootstrap complete. Store these recovery codes securely; they will not be shown again:\n${recoveryCodes.join('\n')}\n`);
} finally {
  await prisma.$disconnect();
}

function question(prompt) {
  return new Promise(resolve => {
    stdout.write(prompt);
    const onData = chunk => { stdin.off('data', onData); resolve(String(chunk).replace(/[\r\n]+$/u, '')); };
    stdin.once('data', onData);
  });
}

function hidden(prompt) {
  return new Promise((resolve, reject) => {
    stdout.write(prompt);
    let value = '';
    const onData = chunk => {
      for (const character of String(chunk)) {
        if (character === '\u0003') { cleanup(); reject(new Error('Bootstrap cancelled.')); return; }
        if (character === '\r' || character === '\n') { cleanup(); stdout.write('\n'); resolve(value); return; }
        if (character === '\u007f') value = value.slice(0, -1); else value += character;
      }
    };
    const cleanup = () => { stdin.off('data', onData); stdin.setRawMode(false); stdin.pause(); };
    stdin.setRawMode(true); stdin.resume(); stdin.on('data', onData);
  });
}

function decodeKey(value) {
  const key = /^[0-9a-f]{64}$/iu.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64url');
  if (key.length !== 32) throw new Error('AUTH_TOTP_ENCRYPTION_KEY must decode to 32 bytes.');
  return key;
}

function encrypt(secret, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join(':');
}
