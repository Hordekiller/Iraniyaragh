\set ON_ERROR_STOP on

BEGIN;

INSERT INTO "User" (
  "id", "mobile", "email", "passwordHash", "status",
  "isMobileVerified", "mobileVerifiedAt", "updatedAt"
) VALUES (
  'auth_test_user', '+989121234567', 'admin@example.com', repeat('p', 64), 'ACTIVE',
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
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
  'auth_test_session', 'auth_test_user', repeat('r', 64), 'auth_test_family',
  CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP
);

INSERT INTO "OtpCode" (
  "id", "userId", "destinationHash", "codeHash", "purpose", "channel", "expiresAt"
) VALUES (
  'auth_test_otp', 'auth_test_user', repeat('d', 64), repeat('o', 64),
  'SIGN_IN', 'SMS', CURRENT_TIMESTAMP + INTERVAL '5 minutes'
);

INSERT INTO "LoginAttempt" ("id", "userId", "identifierHash", "method", "outcome")
VALUES ('auth_test_attempt', 'auth_test_user', repeat('i', 64), 'OTP', 'SUCCESS');

INSERT INTO "AuditLog" ("id", "actorId", "action", "entityType", "entityId")
VALUES ('auth_test_audit', 'auth_test_user', 'auth.login.succeeded', 'User', 'auth_test_user');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('User', 'Session', 'OtpCode', 'LoginAttempt', 'AuditLog')
      AND column_name IN ('password', 'refreshToken', 'accessToken', 'token', 'code', 'otp', 'ip')
  ) THEN
    RAISE EXCEPTION 'A raw credential, token, OTP, or IP column exists';
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
    INSERT INTO "User" (
      "id", "email", "isEmailVerified", "updatedAt"
    ) VALUES (
      'auth_invalid_verification', 'verified@example.com', true, CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'Expected verification timestamp constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "User" ("id", "email", "status", "updatedAt")
    VALUES ('auth_invalid_deleted_state', 'deleted@example.com', 'DELETED', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Expected deletion lifecycle constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "Role" ("id", "key", "name", "updatedAt")
    VALUES ('auth_invalid_role', 'Admin Role', 'Invalid role', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Expected role key format constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "Permission" ("id", "key", "name", "group", "updatedAt")
    VALUES ('auth_invalid_permission', 'manage', 'Invalid permission', 'users', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Expected namespaced permission key constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE "UserRole"
    SET "revokedAt" = CURRENT_TIMESTAMP
    WHERE "id" = 'auth_test_user_role';
    RAISE EXCEPTION 'Expected role revocation reason constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE "RolePermission"
    SET "revokedAt" = CURRENT_TIMESTAMP
    WHERE "id" = 'auth_test_role_permission';
    RAISE EXCEPTION 'Expected permission revocation reason constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "Session" (
      "id", "userId", "refreshTokenHash", "tokenFamilyId", "expiresAt", "updatedAt"
    ) VALUES (
      'auth_invalid_session', 'auth_test_user', repeat('x', 64), 'auth_test_family',
      CURRENT_TIMESTAMP - INTERVAL '1 minute', CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'Expected session expiry constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE "Session"
    SET "revokedAt" = CURRENT_TIMESTAMP
    WHERE "id" = 'auth_test_session';
    RAISE EXCEPTION 'Expected session revocation reason constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "OtpCode" (
      "id", "destinationHash", "codeHash", "purpose", "channel",
      "attempts", "maxAttempts", "expiresAt"
    ) VALUES (
      'auth_invalid_otp', repeat('e', 64), repeat('c', 64), 'SIGN_IN', 'SMS',
      6, 5, CURRENT_TIMESTAMP + INTERVAL '5 minutes'
    );
    RAISE EXCEPTION 'Expected OTP attempt constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE "OtpCode"
    SET "consumedAt" = CURRENT_TIMESTAMP, "invalidatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = 'auth_test_otp';
    RAISE EXCEPTION 'Expected mutually exclusive OTP terminal state constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "LoginAttempt" ("id", "method", "outcome")
    VALUES ('auth_invalid_attempt', 'PASSWORD', 'INVALID_CREDENTIALS');
    RAISE EXCEPTION 'Expected login attempt identity constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "AuditLog" ("id", "action", "entityType")
    VALUES ('auth_invalid_audit', ' ', 'User');
    RAISE EXCEPTION 'Expected non-empty audit action constraint to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;

ROLLBACK;
