# Backups and restore

Four layers protect the data. Project ID below is `collections-tracker-nls`; substitute `<project-id>` if it changes. Steps 1 and 2 need the Blaze plan and `gcloud` authenticated against the project (`gcloud config set project <project-id>`).

**Windows:** run the `gcloud` commands in PowerShell. In Git Bash the `(default)` database name breaks gcloud's `.cmd` wrapper. In PowerShell keep `--database='(default)'` quoted; in Git Bash use `--database=^(default^)`. `--format=value(...)` projections may also print nothing there, so use `--format=json`.

| Layer | Covers | Frequency | Retention |
| --- | --- | --- | --- |
| 1. Scheduled Firestore backups | Firestore data | daily | 14 days |
| 2. Point-in-time recovery (PITR) | Firestore data | continuous | 7 days |
| 3. Firebase Auth users | Auth users | with each JSON dump (step 4) | 30 days (pruned) |
| 4. JSON dump to Drive | Firestore data + Auth users, portable | weekly or before risky scripts | 30 days (pruned) |

## 1. Scheduled Firestore backups

Set up (once):

```bash
gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14d
```

Verify:

```bash
gcloud firestore backups schedules list --database='(default)'
```

List backups and find the one to restore:

```bash
gcloud firestore backups list
```

Restore. This always creates a **new** database, it never overwrites the live one. Restore into a scratch database first, inspect it, then copy back what you need (or point the app at it):

```bash
gcloud firestore databases restore --source-backup=projects/<project-id>/locations/<location>/backups/<backup-id> --destination-database=restore-test
```

Delete the scratch database when done:

```bash
gcloud firestore databases delete --database=restore-test
```

## 2. Point-in-time recovery

Enable (once):

```bash
gcloud firestore databases update --database='(default)' --enable-pitr
```

Verify: `gcloud firestore databases describe --database='(default)'` shows `pointInTimeRecoveryEnablement: POINT_IN_TIME_RECOVERY_ENABLED`.

Restore any moment in the last 7 days (timestamp on a whole minute, RFC 3339). Like backups, this restores into a new database. `--source-database` is the full path `projects/<project-id>/databases/(default)`:

```bash
gcloud firestore databases clone --source-database=projects/<project-id>/databases/'(default)' --destination-database=pitr-restore --snapshot-time=2026-09-28T10:00:00Z
```

## 3. Firebase Auth users

Firestore backups do not include Auth users (Google and SimpleLogin sign-ins). `npm run backup-firestore` (step 4) also writes `auth-users.json` into each dump, via the Admin SDK, so the weekly dump covers Auth and lands in the private Drive folder. Pass `--no-auth` to skip it.

`auth-users.json` contains user identifiers (and password hashes, if any), so keep the Drive folder private and never share it.

Manual alternative (same data, Firebase CLI format):

```bash
npx firebase auth:export users.json --project <project-id>
npx firebase auth:import users.json --project <project-id>
```

Restoring from `auth-users.json` uses the Admin SDK `importUsers()`; the file holds each user's `uid`, `email`, `providerData` etc. as returned by `listUsers()`.

## 4. Portable JSON dump

`scripts/backup-firestore.js` walks every top-level collection and subcollection (including `collections/{id}/members` and `invites`, and phantom parents that only have subcollections) and writes one JSON file per top-level collection plus a `manifest.json` with document counts:

```bash
npm run backup-firestore
```

It writes to `backups/` (or `--out`), then uploads the dated folder to Google Drive when the Drive env vars are set.

### One-time Drive setup

Service accounts have no storage quota on a personal Drive, so uploads use OAuth as you with the narrow `drive.file` scope (the script can only see files it created).

1. Google Cloud console → APIs & Services → Library → enable **Google Drive API** for the project.
2. APIs & Services → OAuth consent screen: user type External, add yourself as a test user. Leave it in Testing, but note that Testing-mode refresh tokens expire after 7 days. To avoid that, click **Publish app** (it stays private to you; the `drive.file` scope needs no verification).
3. APIs & Services → Credentials → Create credentials → OAuth client ID → type **Desktop app**. Copy the client ID and secret.
4. Run the helper, open the printed URL, approve, and copy the two values it prints:

   ```bash
   DRIVE_CLIENT_ID=... DRIVE_CLIENT_SECRET=... npm run backup-drive-auth
   ```

   It also creates the Drive folder `collections-firestore-backups`.
5. Put the four values in a git-ignored `.env.backup` (or your scheduler's secret store): `DRIVE_CLIENT_ID`, `DRIVE_CLIENT_SECRET`, `DRIVE_REFRESH_TOKEN`, `DRIVE_FOLDER_ID`. Load it before running, e.g. `node --env-file=.env.backup scripts/backup-firestore.js`.

- `--out` defaults to `backups/` (git-ignored). `--no-drive` skips the upload.
- `--keep-days` (default 30, `0` disables) prunes older `firestore-<timestamp>` directories in `--out`, and moves older dump folders in the Drive backup folder to the Drive trash. Nothing else is touched.
- Targets production using Admin credentials (`GOOGLE_APPLICATION_CREDENTIALS`), or the emulator if `FIRESTORE_EMULATOR_HOST` is set.
- Timestamps are written as `{"__type":"timestamp","value":"<ISO>"}`; references, geopoints and bytes are tagged the same way.

Run it before any bulk script (`import-sheet`, `cleanup-phantom-collections`, `trim-item-fields` without `--dry-run`).

There is no automated restore script: the dump is a last-resort, vendor-neutral copy. To restore, read the JSON and write each `docs[]` entry back with the Admin SDK (`exists: false` entries are phantom parents and can be skipped), converting tagged values back to `Timestamp`, etc.

## Testing a restore

Before relying on the setup, restore the latest backup into a scratch database (step 1, `restore-test`), then confirm `collections`, their `members`/`invites`, and `items` are present and counts match `manifest.json` from a fresh dump. Delete the scratch database afterwards.

## Automating the dump (GitHub Actions)

`.github/workflows/backup.yml` runs the dump daily at 08:00 UTC (and on demand via Actions → Backup → Run workflow). It needs these repo secrets:

- `DRIVE_CLIENT_ID`, `DRIVE_CLIENT_SECRET`, `DRIVE_REFRESH_TOKEN`, `DRIVE_FOLDER_ID` (from the Drive setup above)
- `BACKUP_SERVICE_ACCOUNT`: the JSON key of a read-only service account

Create the service account (PowerShell):

```powershell
gcloud iam service-accounts create firestore-backup --display-name="Firestore backup (read-only)" --project=<project-id>
gcloud projects add-iam-policy-binding <project-id> --member="serviceAccount:firestore-backup@<project-id>.iam.gserviceaccount.com" --role="roles/datastore.viewer"
gcloud projects add-iam-policy-binding <project-id> --member="serviceAccount:firestore-backup@<project-id>.iam.gserviceaccount.com" --role="roles/firebaseauth.viewer"
gcloud iam service-accounts keys create backup-sa-key.json --iam-account="firestore-backup@<project-id>.iam.gserviceaccount.com"
Get-Content -Raw backup-sa-key.json | gh secret set BACKUP_SERVICE_ACCOUNT
```

Then delete `backup-sa-key.json` from disk. The repo is public, so the workflow never uploads the dump as an artifact and never prints document contents. GitHub disables scheduled workflows in a public repo after 60 days without repo activity; re-enable from the Actions tab if that happens. A failed run emails you (Actions notifications).

## Never commit

Dump output (`backups/`), `users.json`, and any service-account key files are in `.gitignore`. Keep them out of the repo.
