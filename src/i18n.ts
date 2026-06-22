// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import { getLanguage } from "obsidian";

const en = {

  "cmd.syncNow": "Sync now",

  "status.failedStart": "docli — failed to start (see the developer console)",
  "status.notConfigured": "docli — set the server URL, token, and workspace in settings",
  "status.notLocked": "docli — not syncing; pick a workspace and Lock it in settings to start",
  "status.upgradeRequired": "docli — update the plugin (the server needs a newer version); sync paused, notes unchanged",
  "status.error": "docli — couldn't sync (check the server URL / token); {last}",
  "status.syncing": "docli — syncing; {last}",
  "status.live": "docli — live (real-time); {last}",
  "status.pollingOrManual": "docli — {mode}; {last}",
  "status.mode.manual": "manual sync only",
  "status.mode.polling": "polling on a timer (live connection unavailable)",
  "status.last.synced": "last synced {time}",
  "status.last.never": "not synced yet",

  "notice.failedStart": "docli: failed to start — {msg}",
  "notice.noWorkspaces": "docli: the token has no workspaces.",
  "notice.foundWorkspaces": "docli: found {count} {noun}.",
  "notice.error": "docli: {msg}",
  "notice.unlocked": "docli: workspace unlocked — syncing paused.",
  "notice.pickWorkspace": "docli: pick a workspace first.",
  "notice.locked": "docli: workspace locked — syncing started.",
  "notice.notConfiguredManual": "docli: set the server URL, token, and workspace in settings first.",
  "notice.lockToSync": "docli: lock the workspace in settings to start syncing.",
  "notice.httpsRequired": "docli: mobile requires an https:// server URL.",
  "notice.syncFailed": "docli: sync failed — {msg}",
  "notice.conflictSaved": 'docli: "{original}" was taken — saved your copy as "{savedAs}".',
  "notice.moveOverridden": 'docli: "{localPath}" was moved to "{serverPath}" elsewhere — kept the server\'s location.',
  "notice.skippedAttachments": "docli: skipped {count} {noun}: {head}{ellipsis}",
  "notice.featuresNeedUpdate": "docli: update the plugin to use newer features ({features}). Sync still works.",

  "attach.tooLarge": "too large",
  "attach.unsupported": "unsupported type",

  "modal.lock.title": "Start syncing this vault?",
  "modal.lock.body1": 'Locking will sync THIS vault with the "@{handle}" space — both directions.',
  "modal.lock.body2":
    "Your local notes are pushed up, and the space's notes are pulled down into this vault; the two are merged. Overlapping edits keep BOTH copies (a “(conflict)” file), never a silent overwrite — but the vaults will be combined.",
  "modal.lock.body3":
    "Make sure this is the right space AND the right vault before you start. The wrong pairing mixes two note collections together.",
  "modal.lock.confirm": "Lock & start sync",

  "modal.massDelete.titleMany": "Delete many notes?",
  "modal.massDelete.titleOne": "Delete your last note everywhere?",
  "modal.massDelete.bodyMany": "This change would move {count} of {total} synced notes to trash on every device.",
  "modal.massDelete.bodyOne": "This change would move your only synced note to trash on every device.",
  "modal.massDelete.body2": "If you didn't mean to, cancel — nothing is deleted and your notes stay put.",
  "modal.massDelete.confirmMany": "Delete {count} {noun}",
  "modal.massDelete.confirmOne": "Delete note",

  "modal.cancel": "Cancel",
  "modal.upgrade.title": "Update Docli Connect",
  "modal.upgrade.accept": "Got it",

  "settings.warn.experimental.title": "⚠ Experimental — back up first",
  "settings.warn.experimental.body":
    "This plugin is experimental. In rare cases it could lose data (most likely it won't). Make a backup of your vault before you rely on it.",
  "settings.warn.syncedDisk.title": "⚠ Not for vaults on a synced disk",
  "settings.warn.syncedDisk.body":
    "Avoid using it on a vault stored inside a file-sync service (Yandex Disk, Google Drive, Dropbox, iCloud, OneDrive, etc.) unless you know what you're doing — two sync engines fighting over the same files can conflict and corrupt your notes.",
  "settings.notice.upgrade.title": "Update required",
  "settings.notice.upgrade.body":
    "The docli server speaks a newer sync protocol than this plugin version. Sync is paused until you update the plugin — your notes are safe and unchanged.",
  "settings.notice.outdated.body":
    "This plugin (version {clientVersion}) is older than the minimum the server requires ({minVersion}). Sync is paused until you update the plugin — your notes are safe and unchanged.",
  "settings.notice.features.title": "Some features need a newer plugin",
  "settings.notice.features.body":
    "The server offers features this plugin version can't use yet ({features}). Basic sync keeps working; update the plugin to enable them.",
  "settings.serverUrl.name": "Server URL",
  "settings.serverUrl.desc": "Your docli server, e.g. https://docli.ru. HTTPS is required on mobile.",
  "settings.pat.name": "Access token (PAT)",
  "settings.pat.desc": "A full-scope personal access token from docli → Account → Tokens.",
  "settings.connect.name": "Connect",
  "settings.connect.desc": "Verify the token and load your workspaces.",
  "settings.connect.button": "Connect",
  "settings.workspace.name": "Workspace",
  "settings.workspace.descLocked": "Locked — unlock below to pick a different space.",
  "settings.workspace.descUnlocked": "The space this vault will sync with. Pick it, then Lock it in to start syncing.",
  "settings.lock.nameLocked": "🔒 Workspace locked — syncing",
  "settings.lock.nameUnlocked": "🔓 Lock workspace to start syncing",
  "settings.lock.descLocked": "This vault is syncing with the locked space. Unlock to pause and choose a different one.",
  "settings.lock.descUnlocked": "Nothing syncs until you lock in a workspace. You'll confirm the consequences first.",
  "settings.lock.unlock": "Unlock",
  "settings.lock.lockAndSync": "Lock & sync",
  "settings.interval.name": "Auto-sync interval",
  "settings.interval.desc": "Seconds between foreground syncs (0 disables the timer; minimum 30s).",
  "settings.maxAttachment.name": "Max attachment size (MiB)",
  "settings.maxAttachment.desc":
    "Attachments larger than this are skipped. Files over 25 MiB upload in chunks up to this limit (the server allows up to 200 MiB).",
  "settings.folders.name": "Folders to sync",
  "settings.folders.desc":
    "One folder per line (vault-relative, e.g. Work or Projects/2026). Leave EMPTY to sync the whole vault. " +
    "Only the listed folders and their contents are mirrored; everything else stays untouched. " +
    "Changing this re-pulls from the server on the next sync — adding a folder downloads its notes, " +
    "removing one un-syncs (but never deletes) them.",
  "settings.syncNow.name": "Sync now",
  "settings.syncNow.button": "Sync now",
  "settings.syncNow.descUnlocked": "Lock the workspace above to start syncing.",
  "settings.syncNow.descLast": "Last synced: {time}",
  "settings.syncNow.descNever": "Not synced yet.",
  "settings.conflicts.title": "Conflicts",
  "settings.conflicts.titleCount": "Conflicts ({count})",
  "settings.conflicts.empty":
    "No conflict copies. When two sides edit the same note, the incoming copy is saved as a “(conflict)” file here — both are kept, nothing is overwritten.",
  "settings.open": "Open",
  "settings.moves.title": "Overridden moves",
  "settings.moves.titleCount": "Overridden moves ({count})",
  "settings.moves.empty":
    "None. If you move a note out of a synced folder while it was also moved elsewhere on the server, the server’s location wins and the override is listed here — no content is lost, only the folder changes.",
  "settings.moves.keptLocation": "Kept the server’s location · {time}",
  "settings.moves.clear": "Clear list",

  "workspaces.tokenRejected": "Token rejected — check the PAT and server URL.",
  "workspaces.serverReturned": "Server returned {status}.",
  "workspaces.malformed": "Malformed server response.",
  "workspaces.noViewer": "Token is not signed in (no viewer).",

  "noun.workspace.one": "workspace",
  "noun.workspace.few": "workspaces",
  "noun.workspace.many": "workspaces",
  "noun.note.one": "note",
  "noun.note.few": "notes",
  "noun.note.many": "notes",
  "noun.attachment.one": "attachment",
  "noun.attachment.few": "attachments",
  "noun.attachment.many": "attachments",
} as const;

export type I18nKey = keyof typeof en;

const ru: Record<I18nKey, string> = {
  "cmd.syncNow": "Синхронизировать сейчас",

  "status.failedStart": "docli — не удалось запустить (см. консоль разработчика)",
  "status.notConfigured": "docli — укажите адрес сервера, токен и пространство в настройках",
  "status.notLocked": "docli — синхронизация выключена; выберите пространство и заблокируйте его в настройках",
  "status.upgradeRequired": "docli — обновите плагин (серверу нужна более новая версия); синхронизация на паузе, заметки не изменены",
  "status.error": "docli — не удалось синхронизировать (проверьте адрес сервера и токен); {last}",
  "status.syncing": "docli — синхронизация; {last}",
  "status.live": "docli — на связи (в реальном времени); {last}",
  "status.pollingOrManual": "docli — {mode}; {last}",
  "status.mode.manual": "только ручная синхронизация",
  "status.mode.polling": "опрос по таймеру (живое соединение недоступно)",
  "status.last.synced": "посл. синхронизация в {time}",
  "status.last.never": "ещё не синхронизировано",

  "notice.failedStart": "docli: не удалось запустить — {msg}",
  "notice.noWorkspaces": "docli: у токена нет доступных пространств.",
  "notice.foundWorkspaces": "docli: найдено {count} {noun}.",
  "notice.error": "docli: {msg}",
  "notice.unlocked": "docli: пространство разблокировано — синхронизация приостановлена.",
  "notice.pickWorkspace": "docli: сначала выберите пространство.",
  "notice.locked": "docli: пространство заблокировано — синхронизация запущена.",
  "notice.notConfiguredManual": "docli: сначала укажите адрес сервера, токен и пространство в настройках.",
  "notice.lockToSync": "docli: заблокируйте пространство в настройках, чтобы начать синхронизацию.",
  "notice.httpsRequired": "docli: на мобильных устройствах нужен адрес сервера через https://.",
  "notice.syncFailed": "docli: сбой синхронизации — {msg}",
  "notice.conflictSaved": "docli: «{original}» уже занято — ваша копия сохранена как «{savedAs}».",
  "notice.moveOverridden":
    "docli: «{localPath}» перемещено в «{serverPath}» на другом устройстве — оставлено расположение с сервера.",
  "notice.skippedAttachments": "docli: пропущено {count} {noun}: {head}{ellipsis}",
  "notice.featuresNeedUpdate": "docli: обновите плагин, чтобы использовать новые возможности ({features}). Синхронизация продолжает работать.",

  "attach.tooLarge": "слишком большой",
  "attach.unsupported": "неподдерживаемый тип",

  "modal.lock.title": "Начать синхронизацию этого хранилища?",
  "modal.lock.body1": "Блокировка синхронизирует ЭТО хранилище с пространством «@{handle}» — в обе стороны.",
  "modal.lock.body2":
    "Ваши локальные заметки отправляются на сервер, а заметки пространства загружаются в это хранилище; они объединяются. Пересекающиеся правки сохраняют ОБЕ копии (файл «(conflict)»), без молчаливой перезаписи — но содержимое хранилищ будет объединено.",
  "modal.lock.body3":
    "Убедитесь, что это нужное пространство И нужное хранилище, прежде чем начинать. Неверная пара смешает две коллекции заметок.",
  "modal.lock.confirm": "Заблокировать и начать",

  "modal.massDelete.titleMany": "Удалить много заметок?",
  "modal.massDelete.titleOne": "Удалить вашу последнюю заметку везде?",
  "modal.massDelete.bodyMany":
    "Это переместит {count} из {total} синхронизированных заметок в корзину на всех устройствах.",
  "modal.massDelete.bodyOne":
    "Это переместит вашу единственную синхронизированную заметку в корзину на всех устройствах.",
  "modal.massDelete.body2": "Если вы этого не хотели, нажмите «Отмена» — ничего не удалится и заметки останутся на месте.",
  "modal.massDelete.confirmMany": "Удалить {count} {noun}",
  "modal.massDelete.confirmOne": "Удалить заметку",

  "modal.cancel": "Отмена",
  "modal.upgrade.title": "Обновите Docli Connect",
  "modal.upgrade.accept": "Понятно",

  "settings.warn.experimental.title": "⚠ Экспериментальный плагин — сделайте резервную копию",
  "settings.warn.experimental.body":
    "Этот плагин экспериментальный. В редких случаях он может привести к потере данных (скорее всего нет). Сделайте резервную копию хранилища, прежде чем полагаться на него.",
  "settings.warn.syncedDisk.title": "⚠ Не для хранилищ на синхронизируемом диске",
  "settings.warn.syncedDisk.body":
    "Не используйте его для хранилища внутри сервиса синхронизации файлов (Яндекс Диск, Google Диск, Dropbox, iCloud, OneDrive и т. п.), если только вы не понимаете, что делаете — два движка синхронизации, борющиеся за одни и те же файлы, могут конфликтовать и повредить ваши заметки.",
  "settings.notice.upgrade.title": "Требуется обновление",
  "settings.notice.upgrade.body":
    "Сервер docli использует более новый протокол синхронизации, чем эта версия плагина. Синхронизация приостановлена до обновления плагина — ваши заметки в безопасности и не изменены.",
  "settings.notice.outdated.body":
    "Эта версия плагина ({clientVersion}) старее минимально требуемой сервером ({minVersion}). Синхронизация приостановлена до обновления плагина — ваши заметки в безопасности и не изменены.",
  "settings.notice.features.title": "Некоторым возможностям нужен более новый плагин",
  "settings.notice.features.body":
    "Сервер предлагает возможности, которые эта версия плагина пока не поддерживает ({features}). Базовая синхронизация работает; обновите плагин, чтобы включить их.",
  "settings.serverUrl.name": "Адрес сервера",
  "settings.serverUrl.desc": "Ваш сервер docli, например https://docli.ru. На мобильных устройствах обязателен HTTPS.",
  "settings.pat.name": "Токен доступа (PAT)",
  "settings.pat.desc": "Персональный токен доступа с полными правами: docli → Аккаунт → Токены.",
  "settings.connect.name": "Подключиться",
  "settings.connect.desc": "Проверить токен и загрузить ваши пространства.",
  "settings.connect.button": "Подключиться",
  "settings.workspace.name": "Пространство",
  "settings.workspace.descLocked": "Заблокировано — разблокируйте ниже, чтобы выбрать другое пространство.",
  "settings.workspace.descUnlocked":
    "Пространство, с которым будет синхронизироваться это хранилище. Выберите его и заблокируйте, чтобы начать синхронизацию.",
  "settings.lock.nameLocked": "🔒 Пространство заблокировано — синхронизация идёт",
  "settings.lock.nameUnlocked": "🔓 Заблокируйте пространство, чтобы начать синхронизацию",
  "settings.lock.descLocked":
    "Это хранилище синхронизируется с заблокированным пространством. Разблокируйте, чтобы приостановить и выбрать другое.",
  "settings.lock.descUnlocked":
    "Ничего не синхронизируется, пока вы не заблокируете пространство. Сначала потребуется подтверждение.",
  "settings.lock.unlock": "Разблокировать",
  "settings.lock.lockAndSync": "Заблокировать и синхронизировать",
  "settings.interval.name": "Интервал автосинхронизации",
  "settings.interval.desc": "Секунд между синхронизациями (0 отключает таймер; минимум 30 с).",
  "settings.maxAttachment.name": "Макс. размер вложения (МиБ)",
  "settings.maxAttachment.desc":
    "Вложения больше этого размера пропускаются. Файлы свыше 25 МиБ загружаются частями до этого предела (сервер допускает до 200 МиБ).",
  "settings.folders.name": "Папки для синхронизации",
  "settings.folders.desc":
    "По одной папке на строку (относительно хранилища, например Work или Projects/2026). Оставьте ПУСТЫМ, чтобы синхронизировать всё хранилище. " +
    "Зеркалируются только перечисленные папки и их содержимое; остальное не затрагивается. " +
    "Изменение этого списка заново загружает данные с сервера при следующей синхронизации — добавление папки скачивает её заметки, " +
    "удаление прекращает синхронизацию (но никогда не удаляет) их.",
  "settings.syncNow.name": "Синхронизировать сейчас",
  "settings.syncNow.button": "Синхронизировать сейчас",
  "settings.syncNow.descUnlocked": "Заблокируйте пространство выше, чтобы начать синхронизацию.",
  "settings.syncNow.descLast": "Посл. синхронизация: {time}",
  "settings.syncNow.descNever": "Ещё не синхронизировано.",
  "settings.conflicts.title": "Конфликты",
  "settings.conflicts.titleCount": "Конфликты ({count})",
  "settings.conflicts.empty":
    "Копий-конфликтов нет. Когда обе стороны правят одну заметку, входящая копия сохраняется здесь как файл «(conflict)» — сохраняются обе, ничего не перезаписывается.",
  "settings.open": "Открыть",
  "settings.moves.title": "Переопределённые перемещения",
  "settings.moves.titleCount": "Переопределённые перемещения ({count})",
  "settings.moves.empty":
    "Нет. Если вы переместите заметку из синхронизируемой папки, а её также переместили в другом месте на сервере, побеждает расположение с сервера, и переопределение появится здесь — содержимое не теряется, меняется только папка.",
  "settings.moves.keptLocation": "Оставлено расположение с сервера · {time}",
  "settings.moves.clear": "Очистить список",

  "workspaces.tokenRejected": "Токен отклонён — проверьте PAT и адрес сервера.",
  "workspaces.serverReturned": "Сервер вернул {status}.",
  "workspaces.malformed": "Некорректный ответ сервера.",
  "workspaces.noViewer": "Токен не авторизован (нет пользователя).",

  "noun.workspace.one": "пространство",
  "noun.workspace.few": "пространства",
  "noun.workspace.many": "пространств",
  "noun.note.one": "заметку",
  "noun.note.few": "заметки",
  "noun.note.many": "заметок",
  "noun.attachment.one": "вложение",
  "noun.attachment.few": "вложения",
  "noun.attachment.many": "вложений",
};

const dicts: Record<string, Partial<Record<I18nKey, string>>> = { en, ru };

export const _catalogs = { en, ru } as const;

export function currentLang(): "en" | "ru" {
  try {
    return getLanguage().toLowerCase().startsWith("ru") ? "ru" : "en";
  } catch {
    return "en";
  }
}

export function t(key: I18nKey, vars?: Record<string, string | number>): string {
  let s = dicts[currentLang()]?.[key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function plural(base: "noun.workspace" | "noun.note" | "noun.attachment", n: number): string {
  let form: "one" | "few" | "many";
  if (currentLang() === "ru") {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) form = "one";
    else if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) form = "few";
    else form = "many";
  } else {
    form = n === 1 ? "one" : "many";
  }
  return t(`${base}.${form}` as I18nKey);
}
