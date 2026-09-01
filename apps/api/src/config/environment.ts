export type NodeEnvironment = 'development' | 'test' | 'staging' | 'production';

export type EnvironmentVariables = {
  NODE_ENV: NodeEnvironment;
  API_PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  CORS_ORIGINS: string;
  AUTH_HASH_KEY_VERSION: number;
  AUTH_HASH_PREVIOUS_KEY_VERSION?: number;
  AUTH_HASH_PREVIOUS_SECRET?: string;
  AUTH_HASH_SECRET: string;
  AUTH_JWT_ISSUER: string;
  JWT_ACCESS_SECRET: string;
  OBJECT_STORAGE_ENDPOINT: string;
  OBJECT_STORAGE_ACCESS_KEY: string;
  OBJECT_STORAGE_SECRET_KEY: string;
  OBJECT_STORAGE_BUCKET: string;
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
    .map(origin => origin.trim())
    .filter(Boolean)
    .map(origin => {
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

function parseAuthIssuer(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('AUTH_JWT_ISSUER is required.');
  }
  const issuer = value.trim();
  const hasControlCharacter = [...issuer].some(character => {
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
    AUTH_HASH_KEY_VERSION: hashKeyVersion,
    AUTH_HASH_PREVIOUS_KEY_VERSION: previousHashKeyVersion,
    AUTH_HASH_PREVIOUS_SECRET: validatedPreviousHashSecret,
    AUTH_HASH_SECRET: hashSecret,
    AUTH_JWT_ISSUER: parseAuthIssuer(config.AUTH_JWT_ISSUER),
    JWT_ACCESS_SECRET: accessSecret,
    OBJECT_STORAGE_ENDPOINT: objectStorageEndpoint,
    OBJECT_STORAGE_ACCESS_KEY: requiredString(config, 'OBJECT_STORAGE_ACCESS_KEY'),
    OBJECT_STORAGE_SECRET_KEY: objectStorageSecret,
    OBJECT_STORAGE_BUCKET: requiredString(config, 'OBJECT_STORAGE_BUCKET'),
  };
}
