# Docli Connect

Two-way sync between your Obsidian vault and a [docli.ru](https://docli.ru) workspace. Edit notes in
Obsidian or in docli on the web — changes flow both ways. Overlapping edits keep both copies (a
`(conflict)` file), never a silent overwrite. Works on desktop and mobile.

## Install

### Community plugins (recommended)

1. In Obsidian, open **Settings → Community plugins** and turn off Restricted mode.
2. **Browse**, search for **Docli Connect**, and click **Install**, then **Enable**.

### BRAT (beta)

Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin, then **Add beta plugin** and
enter `Docli-ru/docli-connect`. BRAT keeps it updated ahead of the store release.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the
   [latest release](https://github.com/Docli-ru/docli-connect/releases/latest).
2. Copy them into `<your vault>/.obsidian/plugins/docli-connect/`.
3. Reload Obsidian (or **Settings → Community plugins → Reload**) and enable **Docli Connect**.

## Set up sync

Open **Settings → Docli Connect**:

1. **Sign in to docli** — approve access in your browser and return to Obsidian. Your workspaces load automatically.
2. **Workspace** — choose the space for this vault. Choosing does not start syncing.
3. **Start syncing** — confirm the first-sync explanation to begin two-way sync.

**Sync preferences** contains folders, attachment limits, schedule and conflict details.
For a custom server or PAT, expand **Server and access token**. HTTPS is required on mobile;
existing PAT connections keep working after upgrade.

**Pause and change workspace** stops syncing so you can choose another space.
The status bar shows 🟢 live, 🟡 polling, 🔴 error, or ⏸️ paused.

Closing settings before choosing a workspace keeps you signed in, with sync off. Click **docli · Finish setup** in the status bar, or run **Open sync settings** from the command palette, to continue. If authorization later expires, the status changes to **docli · Sign in again**. A non-blocking reminder appears at most every 10 minutes while setup or sign-in needs attention, Obsidian is active, and settings are closed. **Don’t remind me again** disables connection reminders across restarts; re-enable them under **Server and access token**. Choosing a workspace or signing in again stops the corresponding reminder.

The sync status shows the current mode: real-time, syncing, periodic fallback, or an error. **Check now** is optional when real-time sync is on; the last successful completion appears separately.

Sign out pauses and drains sync, clears local credentials, and attempts to revoke the OAuth
connection. If offline, revoke it later through **Account → Connections**. Local notes and sync
history stay in place. Changing the server or credentials requires selecting a workspace again.
OAuth credentials live in Obsidian SecretStorage for this vault; this is not an OS keychain and
other plugins can access that storage. An interrupted token rotation may require a fresh sign-in.

New installs allow attachments up to **50 MiB** by default. Saved limits (including 15 MiB) are
preserved; use **Reset to 50 MiB** to change them. Files above 25 MiB use 8 MiB upload chunks;
custom limits up to the server's 200 MiB chunked maximum remain supported. Reading a vault file
still buffers it in memory. This release does not introduce paid per-file ceilings.

## How it works

- **First sync** pulls the workspace down and adopts your existing notes by path — no duplicates.
- **Conflicts** are kept side by side as `Note (conflict).md` — and a whole **folder** that collides
  with one already on the server is moved aside intact to `Folder (conflict)/` (its notes and
  attachments ride along). Resolve them and delete the extra copy. Pending conflicts are listed in
  settings.
- **Deleting** a note in Obsidian, in Finder while Obsidian is open, or on the web removes it
  everywhere. A note deleted *while Obsidian is closed* is treated cautiously (it can't be told apart
  from a vault that hasn't finished loading): it is **restored from the server** rather than deleted —
  so delete from inside Obsidian (or the web) to remove it for good.
- **Attachments** of any file type sync as files — images, PDF, audio, and video preview in docli;
  other types download from it. Since 0.4.0 attachment **edits** sync both ways too: change a file
  on either side and the other follows; edit the same file in two places and both versions are
  kept (a `(conflict)` copy), never overwritten. Large ones transfer in chunks; files above your
  size limit are skipped with a notice.
- **Renames and moves** are tracked so links and history follow the note — even when the rename
  signal is lost (a dropped event, a restart, or a folder moved back into scope): the note is matched
  by its content and its identity is preserved rather than re-created. If a note was moved in two
  places at once (here and on the server), the **server’s location wins** (the server is the authority);
  your overridden move is listed under **Overridden moves** in settings — no content is lost, only the
  folder differs.
- **Selective sync** — by default the whole vault syncs. In settings, **Folders to sync** takes one
  folder per line (vault-relative, e.g. `Work` or `Projects/2026`); only those folders and their
  contents are mirrored, everything else is left untouched on both sides. Removing a folder from the
  list un-syncs its notes (it never deletes them); changing the list re-pulls so a newly added folder
  downloads its notes. Moving a note out of a synced folder and later widening the scope to include it
  again relocates the original (by content) instead of duplicating it.
- Reserved folders (`.obsidian`, `.trash`, `.git`) are never synced.
- **Custom order mirror** (optional, off by default) — docli lets you order notes and folders by
  hand (the Custom sort). Turn on **"Mirror docli custom order in the file explorer"** in settings
  and the file explorer shows that same order; on desktop you can also drag rows onto a neighbor's
  edge to reorder — the new order syncs back to docli. Needs the whole vault synced (it's disabled
  while "Folders to sync" is set) and a server that has the feature enabled. It patches Obsidian's
  file explorer, so an Obsidian update may break it — if that happens the explorer just falls back
  to its native sort; sync itself is never affected.

## Data safety

Keep your own independent backups. Sync **merges, overwrites, and deletes files automatically** on
both sides, and the plugin is still experimental — in rare cases it could lose data. Conflict
handling keeps both copies rather than overwriting, but the service is provided **"as is"**, with no
guarantee that your data is preserved, intact, or recoverable (see the [User
Agreement](https://docli.ru/terms)). Back up your vault before you rely on it.

## Privacy & legal

Docli Connect syncs your vault to a docli.ru workspace, where your data is stored in Russia under
Federal Law No. 152-FZ — no foreign processors. Creating a docli account and an access token is
subject to:

- [Privacy Policy](https://docli.ru/privacy)
- [User Agreement](https://docli.ru/terms)

## Build from source

```bash
npm install
npm run build      # type-check + bundle → main.js
npm test           # unit tests
```

## License

[MIT](./LICENSE) © OOO Agitek
