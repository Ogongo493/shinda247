# Administrator security setup

This change requires one server secret before the first administrator MFA enrollment.

## 1. Configure the encryption key

Generate a fresh 32-byte key on a trusted computer:

```bash
openssl rand -base64 32
```

In the Render dashboard, open the `shinda247-staging` service, then Environment, and add:

- Key: `ADMIN_TOTP_ENCRYPTION_KEY`
- Value: the output from the command above

Do not commit this value, put it in source code, or send it in chat. Keep a secure offline backup. If this key is lost, stored authenticator secrets cannot be decrypted and administrator MFA must be re-enrolled through a controlled recovery procedure.

## 2. Apply the database migration

Apply `lib/db/migrations/0004_strict_admin_security.sql` to the staging database only after reviewing the migration and confirming a backup is available.

The migration converts the existing account whose username is `Maiko` to the `admin` account type and temporarily sets it inactive for a safe cutover. It preserves the user record, wallet row, and historical records. Database triggers and API role checks prevent it from creating or changing player wallet, transaction, or wager records. After the new protected release is live, activate the account with a controlled database update to `is_active = true`; do not activate it while the old application version is running.

## 3. Enroll the administrator authenticator

After the migration and deployment:

1. Confirm the new protected release is running and the Maiko account has been reactivated after deployment.\n2. Open the Shinda24/7 sign-in page.
3. Sign in with the existing Maiko phone number and password.
3. Add the displayed setup key to Google Authenticator, Microsoft Authenticator, or another compatible TOTP authenticator.
5. Enter the current six-digit code to enable MFA.
6. Sign in again and enter a fresh six-digit code.

The setup key is displayed only during enrollment. Store it securely; anyone with the key can generate administrator codes.

## 4. Session and player separation

- Administrator API sessions expire after 15 minutes without activity and have a 12-hour absolute lifetime.
- Player sessions retain their existing lifetime.
- Admin accounts are denied player betting, cash-out, wallet, deposit, withdrawal and notification APIs.
- Public registration always creates a player account. It cannot assign administrator privileges. Players can register with an optional email and sign in using either that email or their phone number.
- Administrator mutations are recorded in the append-only audit log with the administrator ID, timestamp, IP address, user agent, action and result.

## 5. Staging verification checklist

- Maiko can complete password + authenticator login and open `/admin`.
- Maiko is redirected away from player pages.
- Maiko receives HTTP 403 from player bet, cash-out, wallet, deposit and withdrawal APIs.
- A newly registered player can access player pages and game APIs but receives HTTP 403 from administrator APIs.
- An administrator session is rejected after 15 minutes of inactivity.
- Audit entries are created for successful and failed administrator write requests and cannot be updated or deleted through application roles.

Do not merge or deploy until all checks pass.
