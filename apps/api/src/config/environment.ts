import { isIP } from 'node:net';

export type NodeEnvironment = 'development' | 'test' | 'staging' | 'production';

export type TrustProxySetting =
  | { readonly kind: 'disabled' }
  | { readonly kind: 'hops'; readonly count: number }
  | { readonly kind: 'subnets'; readonly subnets: readonly string[] };

export type EnvironmentVariables = {
  NODE_ENV: NodeEnvironment;
  API_PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  CORS_ORIGINS: string;
  TRUST_PROXY: TrustProxySetting;
  AUTH_HASH_KEY_VERSION: number;
  AUTH_HASH_PREVIOUS_KEY_VERSION?: number;
  AUTH_HASH_PREVIOUS_SECRET?: string;
  AUTH_HASH_SECRET: string;
  AUTH_JWT_ISSUER: string;
  JWT_ACCESS_SECRET: string;
  AUTH_DEV_CODE?: string;
  AUTH_TOTP_ENCRYPTION_KEY?: string;
  SMS_IR_API_KEY?: string;
  SMS_IR_OTP_TEMPLATE_ID?: number;
  SMS_IR_TIMEOUT_MS?: number;
  OBJECT_STORAGE_ENDPOINT: string;
  OBJECT_STORAGE_ACCESS_KEY: string;
  OBJECT_STORAGE_SECRET_KEY: string;
  OBJECT_STORAGE_BUCKET: string;
  OBJECT_STORAGE_REGION: string;
  OBJECT_STORAGE_FORCE_PATH_STYLE: boolean;
  PRODUCT_MEDIA_MAX_ASSETS: number;
  PRODUCT_MEDIA_MAX_VIDEOS: number;
  PRODUCT_MEDIA_IMAGE_MAX_BYTES: number;
  PRODUCT_MEDIA_UPLOAD_TTL_SECONDS: number;
};

const supportedEnvironments = new Set<NodeEnvironment>(['development', 'test', 'staging', 'production']);
const localCorsOrigins = ['http://localhost:5173', 'http://localhost:3001'];

function requiredString(config: Record<string, unknown>, key: keyof EnvironmentVariables) {
  const value = config[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} is required.`);
  }
  return value.trim();
}

function requiredSecretString(config: Record<string, unknown>, key: keyof EnvironmentVariables) {
  const value = config[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${key} is required.`);
  if (value !== value.trim()) throw new Error(`${key} must not contain surrounding whitespace.`);
  return value;
}

function parsePort(value: unknown, environment: NodeEnvironment) {
  if ((value === undefined || value === null || value === '') && ['staging', 'production'].includes(environment)) {
    throw new Error('API_PORT is required in staging and production.');
  }

  const port = typeof value === 'number' ? value : Number(value ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('API_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function parsePositiveInteger(value: unknown, key: string, fallback?: number) {
  const candidate = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || (candidate ?? 0) < 1) {
    throw new Error(`${key} must be a positive integer.`);
  }
  return candidate as number;
}

function parseBoolean(value: unknown, key: string, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${key} must be true or false.`);
}

function parseUrl(value: string, key: string, protocols: string[]) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be an absolute URL.`);
  }

  if (!protocols.includes(url.protocol)) {
    throw new Error(`${key} must use one of these protocols: ${protocols.join(', ')}.`);
  }

  return value;
}

export function parseCorsOrigins(value: unknown, environment: NodeEnvironment) {
  if (
    (value === undefined || value === null || value === '') &&
    environment !== 'production' &&
    environment !== 'staging'
  ) {
    return localCorsOrigins;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('CORS_ORIGINS is required in staging and production.');
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      if (origin === '*') throw new Error('CORS_ORIGINS must not contain a wildcard when credentials are enabled.');

      let url: URL;
      try {
        url = new URL(origin);
      } catch {
        throw new Error(`Invalid CORS origin: ${origin}.`);
      }

      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
        throw new Error(`CORS origin must be an http(s) origin without path/query: ${origin}.`);
      }

      return url.origin;
    });

  if (origins.length === 0) throw new Error('CORS_ORIGINS must contain at least one origin.');
  return [...new Set(origins)];
}

function validateDeploymentSecret(value: string, key: string, environment: NodeEnvironment) {
  if (
    ['staging', 'production'].includes(environment) &&
    (value.length < 32 || /(change-me|replace-me|development-only)/iu.test(value))
  ) {
    throw new Error(`${key} must be a non-placeholder secret of at least 32 characters in staging and production.`);
  }
  return value;
}

function validateAuthSecret(value: string, key: string, environment: NodeEnvironment) {
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error(`${key} must contain at least 32 bytes.`);
  }
  return validateDeploymentSecret(value, key, environment);
}

function optionalSecretString(value: unknown, key: string) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${key} must be a string.`);
  if (value !== value.trim()) throw new Error(`${key} must not contain surrounding whitespace.`);
  return value;
}

function optionalOpaqueSecret(value: unknown, key: string) {
  const secret = optionalSecretString(value, key);
  if (secret === undefined) return undefined;
  const hasWhitespaceOrControl = [...secret].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return /\s/u.test(character) || codePoint <= 31 || codePoint === 127;
  });
  if (hasWhitespaceOrControl) {
    throw new Error(`${key} must not contain whitespace or control characters.`);
  }
  return secret;
}

function parseBoundedInteger(value: unknown, key: string, minimum: number, maximum: number) {
  const candidate = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}.`);
  }
  return candidate;
}

const TRUST_PROXY_MAX_HOPS = 5;

function parseTrustProxySubnet(subnet: string): string {
  const normalized = subnet.trim();
  if (normalized === '') throw new Error('TRUST_PROXY must not contain an empty entry.');

  const slashIndex = normalized.indexOf('/');
  const address = slashIndex === -1 ? normalized : normalized.slice(0, slashIndex);
  const prefixRaw = slashIndex === -1 ? undefined : normalized.slice(slashIndex + 1);

  const family = isIP(address);
  if (family === 0) {
    throw new Error(`TRUST_PROXY must contain only IPv4/IPv6 addresses or CIDR subnets: ${subnet}.`);
  }

  if (prefixRaw !== undefined) {
    const maximumPrefix = family === 4 ? 32 : 128;
    if (!/^\d{1,3}$/u.test(prefixRaw)) {
      throw new Error(`TRUST_PROXY CIDR prefix must be an integer: ${subnet}.`);
    }
    const prefix = Number(prefixRaw);
    if (!Number.isInteger(prefix) || prefix < 1 || prefix > maximumPrefix) {
      throw new Error(
        `TRUST_PROXY CIDR prefix must be between 1 and ${maximumPrefix} (all-trusting /0 is not allowed): ${subnet}.`,
      );
    }
  }

  return normalized;
}

export function parseTrustProxy(value: unknown): TrustProxySetting {
  if (value === undefined || value === null || String(value).trim() === '') return { kind: 'disabled' };

  const raw = String(value).trim();
  if (/^\d{1,2}$/u.test(raw)) {
    const count = Number(raw);
    if (!Number.isSafeInteger(count) || count < 1 || count > TRUST_PROXY_MAX_HOPS) {
      throw new Error(`TRUST_PROXY hop count must be an integer between 1 and ${TRUST_PROXY_MAX_HOPS}.`);
    }
    return { kind: 'hops', count };
  }

  const subnets = raw
    .split(',')
    .map(parseTrustProxySubnet)
    .filter(entry => entry !== '');
  if (subnets.length === 0) throw new Error('TRUST_PROXY must contain at least one IP address or CIDR subnet.');
  return { kind: 'subnets', subnets };
}

function parseAuthIssuer(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('AUTH_JWT_ISSUER is required.');
  }
  const issuer = value.trim();
  const hasControlCharacter = [...issuer].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (issuer.length > 200 || hasControlCharacter) {
    throw new Error('AUTH_JWT_ISSUER must be at most 200 characters and contain no control characters.');
  }
  return issuer;
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables & Record<string, unknown> {
  const rawEnvironment = typeof config.NODE_ENV === 'string' ? config.NODE_ENV : 'development';
  if (!supportedEnvironments.has(rawEnvironment as NodeEnvironment)) {
    throw new Error(`NODE_ENV must be one of: ${[...supportedEnvironments].join(', ')}.`);
  }
  const environment = rawEnvironment as NodeEnvironment;

  const databaseUrl = parseUrl(requiredString(config, 'DATABASE_URL'), 'DATABASE_URL', ['postgres:', 'postgresql:']);
  const redisUrl = parseUrl(requiredString(config, 'REDIS_URL'), 'REDIS_URL', ['redis:', 'rediss:']);
  const objectStorageEndpoint = parseUrl(requiredString(config, 'OBJECT_STORAGE_ENDPOINT'), 'OBJECT_STORAGE_ENDPOINT', [
    'http:',
    'https:',
  ]);
  const accessSecret = validateAuthSecret(
    requiredSecretString(config, 'JWT_ACCESS_SECRET'),
    'JWT_ACCESS_SECRET',
    environment,
  );
  const hashSecret = validateAuthSecret(
    requiredSecretString(config, 'AUTH_HASH_SECRET'),
    'AUTH_HASH_SECRET',
    environment,
  );
  const hashKeyVersion = parsePositiveInteger(
    config.AUTH_HASH_KEY_VERSION,
    'AUTH_HASH_KEY_VERSION',
    ['development', 'test'].includes(environment) ? 1 : undefined,
  );
  const previousHashSecret = optionalSecretString(config.AUTH_HASH_PREVIOUS_SECRET, 'AUTH_HASH_PREVIOUS_SECRET');
  const previousHashVersionRaw = config.AUTH_HASH_PREVIOUS_KEY_VERSION;
  const hasPreviousHashVersion =
    previousHashVersionRaw !== undefined && previousHashVersionRaw !== null && previousHashVersionRaw !== '';

  const hasPreviousHashSecret = previousHashSecret !== undefined;
  if (hasPreviousHashSecret !== hasPreviousHashVersion) {
    throw new Error('AUTH_HASH_PREVIOUS_SECRET and AUTH_HASH_PREVIOUS_KEY_VERSION must be configured together.');
  }

  const previousHashKeyVersion = hasPreviousHashVersion
    ? parsePositiveInteger(previousHashVersionRaw, 'AUTH_HASH_PREVIOUS_KEY_VERSION')
    : undefined;
  const validatedPreviousHashSecret = previousHashSecret
    ? validateAuthSecret(previousHashSecret, 'AUTH_HASH_PREVIOUS_SECRET', environment)
    : undefined;
  const objectStorageSecret = validateDeploymentSecret(
    requiredString(config, 'OBJECT_STORAGE_SECRET_KEY'),
    'OBJECT_STORAGE_SECRET_KEY',
    environment,
  );
  const totpEncryptionKey = optionalSecretString(config.AUTH_TOTP_ENCRYPTION_KEY, 'AUTH_TOTP_ENCRYPTION_KEY');
  const smsApiKey = optionalOpaqueSecret(config.SMS_IR_API_KEY, 'SMS_IR_API_KEY');
  const smsTemplateId =
    config.SMS_IR_OTP_TEMPLATE_ID === undefined ||
    config.SMS_IR_OTP_TEMPLATE_ID === null ||
    config.SMS_IR_OTP_TEMPLATE_ID === ''
      ? undefined
      : parseBoundedInteger(config.SMS_IR_OTP_TEMPLATE_ID, 'SMS_IR_OTP_TEMPLATE_ID', 1, 9_999_999_999);
  const smsTimeoutMs =
    config.SMS_IR_TIMEOUT_MS === undefined || config.SMS_IR_TIMEOUT_MS === null || config.SMS_IR_TIMEOUT_MS === ''
      ? undefined
      : parseBoundedInteger(config.SMS_IR_TIMEOUT_MS, 'SMS_IR_TIMEOUT_MS', 500, 10_000);
  if (
    ['staging', 'production'].includes(environment) &&
    (!totpEncryptionKey || Buffer.byteLength(totpEncryptionKey, 'utf8') < 32)
  ) {
    throw new Error('AUTH_TOTP_ENCRYPTION_KEY must contain at least 32 bytes in staging and production.');
  }

  if (['staging', 'production'].includes(environment)) {
    if (smsApiKey === undefined) throw new Error('SMS_IR_API_KEY is required in staging and production.');
    if (smsTemplateId === undefined) {
      throw new Error('SMS_IR_OTP_TEMPLATE_ID is required in staging and production.');
    }
    if (config.PRODUCT_MEDIA_IMAGE_MAX_BYTES === undefined || config.PRODUCT_MEDIA_IMAGE_MAX_BYTES === '') {
      throw new Error('PRODUCT_MEDIA_IMAGE_MAX_BYTES is required in staging and production.');
    }
  }

  if (accessSecret === hashSecret || accessSecret === validatedPreviousHashSecret) {
    throw new Error('JWT_ACCESS_SECRET must be different from every Auth hashing secret.');
  }
  if (previousHashKeyVersion === hashKeyVersion || validatedPreviousHashSecret === hashSecret) {
    throw new Error('Current and previous Auth hashing keys must have distinct versions and secrets.');
  }

  return {
    ...config,
    NODE_ENV: environment,
    API_PORT: parsePort(config.API_PORT, environment),
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    CORS_ORIGINS: parseCorsOrigins(config.CORS_ORIGINS, environment).join(','),
    TRUST_PROXY: parseTrustProxy(config.TRUST_PROXY),
    AUTH_HASH_KEY_VERSION: hashKeyVersion,
    AUTH_HASH_PREVIOUS_KEY_VERSION: previousHashKeyVersion,
    AUTH_HASH_PREVIOUS_SECRET: validatedPreviousHashSecret,
    AUTH_HASH_SECRET: hashSecret,
    AUTH_JWT_ISSUER: parseAuthIssuer(config.AUTH_JWT_ISSUER),
    JWT_ACCESS_SECRET: accessSecret,
    AUTH_DEV_CODE: optionalSecretString(config.AUTH_DEV_CODE, 'AUTH_DEV_CODE'),
    AUTH_TOTP_ENCRYPTION_KEY: totpEncryptionKey,
    SMS_IR_API_KEY: smsApiKey,
    SMS_IR_OTP_TEMPLATE_ID: smsTemplateId,
    SMS_IR_TIMEOUT_MS: smsTimeoutMs,
    OBJECT_STORAGE_ENDPOINT: objectStorageEndpoint,
    OBJECT_STORAGE_ACCESS_KEY: requiredString(config, 'OBJECT_STORAGE_ACCESS_KEY'),
    OBJECT_STORAGE_SECRET_KEY: objectStorageSecret,
    OBJECT_STORAGE_BUCKET: requiredString(config, 'OBJECT_STORAGE_BUCKET'),
    OBJECT_STORAGE_REGION:
      typeof config.OBJECT_STORAGE_REGION === 'string' && config.OBJECT_STORAGE_REGION.trim()
        ? config.OBJECT_STORAGE_REGION.trim()
        : 'us-east-1',
    OBJECT_STORAGE_FORCE_PATH_STYLE: parseBoolean(
      config.OBJECT_STORAGE_FORCE_PATH_STYLE,
      'OBJECT_STORAGE_FORCE_PATH_STYLE',
      !['staging', 'production'].includes(environment),
    ),
    PRODUCT_MEDIA_MAX_ASSETS: parseBoundedInteger(
      config.PRODUCT_MEDIA_MAX_ASSETS ?? 12,
      'PRODUCT_MEDIA_MAX_ASSETS',
      1,
      100,
    ),
    PRODUCT_MEDIA_MAX_VIDEOS: parseBoundedInteger(
      config.PRODUCT_MEDIA_MAX_VIDEOS ?? 3,
      'PRODUCT_MEDIA_MAX_VIDEOS',
      0,
      20,
    ),
    PRODUCT_MEDIA_IMAGE_MAX_BYTES: parseBoundedInteger(
      config.PRODUCT_MEDIA_IMAGE_MAX_BYTES ?? 20 * 1024 * 1024,
      'PRODUCT_MEDIA_IMAGE_MAX_BYTES',
      1024,
      100 * 1024 * 1024,
    ),
    PRODUCT_MEDIA_UPLOAD_TTL_SECONDS: parseBoundedInteger(
      config.PRODUCT_MEDIA_UPLOAD_TTL_SECONDS ?? 15 * 60,
      'PRODUCT_MEDIA_UPLOAD_TTL_SECONDS',
      60,
      30 * 60,
    ),
  };
}
