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

1. Download `main.js`, `manifest.json`, and `versions.json` from the
   [latest release](https://github.com/Docli-ru/docli-connect/releases/latest).
2. Copy them into `<your vault>/.obsidian/plugins/docli-connect/`.
3. Reload Obsidian (or **Settings → Community plugins → Reload**) and enable **Docli Connect**.

## Set up sync

Open **Settings → Docli Connect**:

1. **Server URL** — `https://docli.ru` (or your own docli server). HTTPS is required on mobile.
2. **Access token** — create a personal access token in docli under **Account → Tokens** and paste it.
3. **Connect** — verifies the token and lists your workspaces.
4. **Workspace** — pick the space this vault should sync with. *Picking does not start syncing.*
5. **Lock & sync** — confirm the prompt to pair this vault with the chosen workspace and start syncing
   both ways. This step exists so you can't merge a vault into the wrong space by accident.

To stop, **Unlock** — that pauses syncing and lets you choose a different workspace. The status bar
shows a small indicator: 🟢 live, 🟡 polling, 🔴 error, ⏸️ paused (unlocked).

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
- **Attachments** (images, PDF, audio, video) sync as files. Large ones transfer in chunks; files
  above your size limit are skipped with a notice.
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

## Build from source

```bash
npm install
npm run build      # type-check + bundle → main.js
npm test           # unit tests
```

## License

[MIT](./LICENSE) © OOO Agitek
