\set ON_ERROR_STOP on

BEGIN;

INSERT INTO "User" (
  "id", "mobile", "email", "status", "isMobileVerified", "mobileVerifiedAt", "updatedAt"
) VALUES (
  'auth_test_user', '+989121234567', 'admin@example.com', 'ACTIVE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "Role" ("id", "key", "name", "updatedAt")
VALUES ('auth_test_role', 'admin', 'Administrator', CURRENT_TIMESTAMP);

INSERT INTO "Permission" ("id", "key", "name", "group", "updatedAt")
VALUES ('auth_test_permission', 'users.manage', 'Manage users', 'users', CURRENT_TIMESTAMP);

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "grantedById")
VALUES ('auth_test_role_permission', 'auth_test_role', 'auth_test_permission', 'auth_test_user');

INSERT INTO "UserRole" ("id", "userId", "roleId", "assignedById")
VALUES ('auth_test_user_role', 'auth_test_user', 'auth_test_role', 'auth_test_user');

INSERT INTO "Session" (
  "id", "userId", "refreshTokenHash", "tokenFamilyId", "expiresAt", "updatedAt"
) VALUES (
  'auth_test_session', 'auth_test_user', 'argon2id$test-refresh-hash', 'auth_test_family',
  CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP
);

INSERT INTO "OtpCode" (
  "id", "userId", "destinationHash", "codeHash", "purpose", "expiresAt"
) VALUES (
  'auth_test_otp', 'auth_test_user', 'hmac$destination', 'argon2id$otp-hash', 'SIGN_IN',
  CURRENT_TIMESTAMP + INTERVAL '5 minutes'
);

INSERT INTO "LoginAttempt" ("id", "userId", "identifierHash", "method", "outcome")
VALUES ('auth_test_attempt', 'auth_test_user', 'hmac$identifier', 'OTP', 'SUCCESS');

INSERT INTO "AuditLog" ("id", "actorId", "action", "entityType", "entityId")
VALUES ('auth_test_audit', 'auth_test_user', 'auth.login.succeeded', 'User', 'auth_test_user');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('User', 'Session', 'OtpCode')
      AND column_name IN ('password', 'refreshToken', 'token', 'code', 'otp')
  ) THEN
    RAISE EXCEPTION 'A raw credential/token/OTP column exists';
  END IF;

  BEGIN
    INSERT INTO "User" ("id", "email", "updatedAt")
    VALUES ('auth_invalid_email', ' Admin@Example.com ', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Expected canonical email constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "User" ("id", "mobile", "updatedAt")
    VALUES ('auth_invalid_mobile', '09121234567', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Expected normalized mobile constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "User" ("id", "updatedAt")
    VALUES ('auth_missing_contact', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Expected contact-required constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "User" ("id", "mobile", "updatedAt")
    VALUES ('auth_duplicate_mobile', '+989121234567', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Expected unique mobile index to reject the row';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "Session" (
      "id", "userId", "refreshTokenHash", "tokenFamilyId", "expiresAt", "updatedAt"
    ) VALUES (
      'auth_invalid_session', 'auth_test_user', 'argon2id$invalid-session', 'auth_test_family',
      CURRENT_TIMESTAMP - INTERVAL '1 minute', CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'Expected session expiry constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "OtpCode" (
      "id", "destinationHash", "codeHash", "purpose", "attempts", "maxAttempts", "expiresAt"
    ) VALUES (
      'auth_invalid_otp', 'hmac$destination-2', 'argon2id$otp-hash-2', 'SIGN_IN', 6, 5,
      CURRENT_TIMESTAMP + INTERVAL '5 minutes'
    );
    RAISE EXCEPTION 'Expected OTP attempt constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;

ROLLBACK;
