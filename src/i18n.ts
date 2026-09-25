// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import { getLanguage } from "obsidian";

const en = {
  "ux.actionFailed": "Could not complete this action. Check your connection and try again.",
  "ux.waiting": "Finish signing in in your browser, then return here. Nothing syncs until you choose a workspace.",
  "ux.signedIn": "Signed in. Your local files stay on this device when you sign out.",
  "ux.signInHelp": "Connect this vault to docli. You will choose a workspace before anything syncs.",
  "ux.beforeSync": "Before syncing",
  "ux.safety": "Back up your vault. This plugin is experimental. Do not use it alongside iCloud, Dropbox or another tool syncing the same vault.",
  "ux.loading": "Loading your workspaces…",
  "ux.loadFailed": "Could not load workspaces. Check your connection and retry.",
  "ux.chooseHelp": "Choose where this vault will sync. Nothing starts automatically.",
  "ux.choose": "Choose a workspace…",
  "ux.retry": "Try again",
  "ux.syncOptions": "Sync preferences",
  "ux.syncOptionsHelp": "Folders, attachment size, schedule and conflict details.",
  "ux.connectionOptions": "Server and access token",
  "ux.connectionOptionsHelp": "Use a custom server or a personal access token instead of browser sign-in.",
  "ux.hide": "Hide",
  "ux.change": "Show",
  "cmd.openSettings": "Open sync settings",
  "status.finishSetup": "docli · Finish setup",
  "status.signInAgain": "docli · Sign in again",
  "status.setupHelp": "Signed in, but sync is off. Choose a workspace in Settings → Docli Connect to finish setup.",
  "ux.syncStatus": "Sync status",
  "sync.auth.title": "Sign in again to sync",
  "sync.auth.desc": "Your connection needs authorization. Sign in again and choose a workspace; local files remain on this device.",
  "sync.live.title": "Real-time sync is on",
  "sync.live.desc": "Changes sync automatically while Obsidian is open. Check now is optional.",
  "sync.syncing.title": "Syncing changes…",
  "sync.syncing.desc": "Checking this vault and your workspace for changes.",
  "sync.polling.title": "Automatic sync is on",
  "sync.polling.desc": "The live connection is unavailable. Checking for changes every {seconds} seconds while Obsidian is open.",
  "sync.disconnected.title": "Live connection unavailable",
  "sync.disconnected.desc": "Timed checks are off. Use Check now to fetch changes, or review your connection settings.",
  "sync.paused.title": "Sync is paused",
  "sync.paused.desc": "Finish setup or resume syncing to exchange changes.",
  "sync.update.title": "Update required to sync",
  "sync.update.desc": "Update Docli Connect to resume syncing.",
  "sync.error.title": "Could not complete sync",
  "sync.error.desc": "Changes may not be up to date. Check your connection and try again.",
  "sync.attention.title": "Some files need attention",
  "sync.attention.desc": "Sync completed with files set aside. Review the sync notices before assuming everything is up to date.",
  "setupReminder.title": "Finish connecting this vault",
  "setupReminder.body": "You are signed in, but no workspace is selected. Your notes are not syncing yet.",
  "setupReminder.choose": "Choose workspace",
  "reauthReminder.title": "Sign in again to keep syncing",
  "reauthReminder.body": "Your docli connection expired. Sign in again and choose your workspace; local files remain on this device.",
  "reauthReminder.signIn": "Sign in again",
  "setupReminder.stop": "Don’t remind me again",
  "setupReminder.setting": "Connection reminders",
  "setupReminder.help": "When setup or sign-in needs attention, remind me at most every 10 minutes while Obsidian is active.",
  "auth.failed": "Sign in to docli again.",
  "auth.selectWorkspace": "Signed in. Choose a workspace, then select Start syncing.",
  "auth.offlineRevoke": "Signed out locally. To revoke the offline connection, open Account → Connections in docli.",
  "auth.signIn": "Sign in to docli",
  "auth.token": "Use an access token",
  "auth.signOut": "Sign out",
  "auth.cancel": "Cancel sign-in",
  "auth.connected": "Connected",
  "auth.expired": "Sign-in required",
  "auth.offline": "Offline — retry later",
  "auth.save": "Apply",
  "auth.method": "Connection",
  "auth.secret": "OAuth credentials are stored in Obsidian SecretStorage for this vault. Other plugins can access this storage.",
  "auth.resetCap": "Reset to 50 MiB",

  "cmd.syncNow": "Sync now",

  "status.failedStart": "docli — failed to start (see the developer console)",
  "status.notConfigured": "docli — sign in and select a workspace in settings",
  "status.notLocked": "docli — syncing paused; choose a workspace and start syncing in settings",
  "status.upgradeRequired": "docli — update the plugin (the server needs a newer version); sync paused, notes unchanged",
  "status.error": "docli — couldn't sync (check the connection); {last}",
  "status.syncing": "docli — syncing; {last}",
  "status.live": "docli — live (real-time); {last}",
  "status.pollingOrManual": "docli — {mode}; {last}",
  "status.mode.manual": "manual sync only",
  "status.mode.polling": "polling on a timer (live connection unavailable)",
  "status.last.synced": "last synced {time}",
  "status.last.never": "not synced yet",

  "notice.failedStart": "docli: failed to start — {msg}",
  "notice.noWorkspaces": "docli: the connection has no workspaces.",
  "notice.foundWorkspaces": "docli: found {count} {noun}.",
  "notice.error": "docli: {msg}",
  "notice.unlocked": "docli: syncing paused.",
  "notice.pickWorkspace": "docli: pick a workspace first.",
  "notice.locked": "docli: syncing started.",
  "notice.notConfiguredManual": "docli: sign in and select a workspace in settings first.",
  "notice.lockToSync": "docli: choose a workspace and start syncing in settings.",
  "notice.httpsRequired": "docli: mobile requires an https:// server URL.",
  "notice.syncFailed": "docli: sync failed — {msg}",
  "notice.conflictSaved": 'docli: "{original}" was taken — saved your copy as "{savedAs}".',
  "notice.moveOverridden": 'docli: "{localPath}" was moved to "{serverPath}" elsewhere — kept the server\'s location.',
  "notice.skippedAttachments": "docli: skipped {count} {noun}: {head}{ellipsis}",
  "notice.attachmentsFailed": "docli: {count} {noun} failed to transfer: {head}{ellipsis} — will retry.",
  "status.quarantined": "docli: syncing, but {count} item(s) could not be applied locally: {head}{ellipsis} — retrying. {last}",
  "notice.featuresNeedUpdate": "docli: update the plugin to use newer features ({features}). Sync still works.",

  "attach.tooLarge": "too large",

  "modal.lock.title": "Start syncing this vault?",
  "modal.lock.body1": "This vault will sync with the \"@{handle}\" workspace in both directions.",
  "modal.lock.body2":
    "Your local notes are pushed up, and the space's notes are pulled down into this vault; the two are merged. Overlapping edits keep BOTH copies (a “(conflict)” file), never a silent overwrite — but the vaults will be combined.",
  "modal.lock.body3":
    "Make sure this is the right space AND the right vault before you start. The wrong pairing mixes two note collections together.",
  "modal.lock.confirm": "Start syncing",

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
  "settings.connect.desc": "Check the connection and load your workspaces.",
  "settings.connect.button": "Connect",
  "settings.workspace.name": "Workspace",
  "settings.workspace.descLocked": "This vault is paired with this workspace.",
  "settings.workspace.descUnlocked": "Choose a workspace.",
  "settings.lock.nameLocked": "Sync is enabled",
  "settings.lock.nameUnlocked": "Ready to sync",
  "settings.lock.descLocked": "Pause syncing before choosing another workspace.",
  "settings.lock.descUnlocked": "Review the first-sync confirmation before starting.",
  "settings.lock.unlock": "Pause and change workspace",
  "settings.lock.lockAndSync": "Start syncing",
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
  "settings.mirror.name": "Mirror docli custom order in the file explorer",
  "settings.mirror.desc":
    "Show your docli manual order in the file explorer, and (on desktop) drag rows to reorder — " +
    "the new order is pushed back to docli. May break when Obsidian updates its explorer internals; " +
    "if it does, the explorer falls back to its native sort — sync itself is never affected.",
  "settings.mirror.descPartial":
    "Unavailable while “Folders to sync” is set — the order mirror needs the whole vault synced " +
    "(a partially-synced explorer interleaves local-only files the server can't order).",
  "notice.mirrorDisabledPartial":
    "docli: custom-order mirror turned off — it needs the whole vault synced.",
  "settings.syncNow.name": "Sync now",
  "settings.syncNow.button": "Check now",
  "settings.syncNow.descUnlocked": "Choose a workspace and start syncing first.",
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

  "workspaces.tokenRejected": "Connection rejected — sign in again or check the access token.",
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
  "ux.actionFailed": "Не удалось выполнить действие. Проверьте соединение и повторите попытку.",
  "ux.waiting": "Завершите вход в браузере и вернитесь сюда. Синхронизация начнётся только после выбора пространства.",
  "ux.signedIn": "Вы вошли. При выходе локальные файлы останутся на устройстве.",
  "ux.signInHelp": "Подключите это хранилище к докли. Перед синхронизацией вы выберете пространство.",
  "ux.beforeSync": "Перед синхронизацией",
  "ux.safety": "Сделайте резервную копию: плагин экспериментальный. Не используйте его вместе с iCloud, Dropbox или другой синхронизацией этого же хранилища.",
  "ux.loading": "Загружаем ваши пространства…",
  "ux.loadFailed": "Не удалось загрузить пространства. Проверьте соединение и повторите попытку.",
  "ux.chooseHelp": "Выберите пространство для этого хранилища. Синхронизация не начнётся автоматически.",
  "ux.choose": "Выберите пространство…",
  "ux.retry": "Повторить",
  "ux.syncOptions": "Параметры синхронизации",
  "ux.syncOptionsHelp": "Папки, размер вложений, расписание и сведения о конфликтах.",
  "ux.connectionOptions": "Сервер и токен доступа",
  "ux.connectionOptionsHelp": "Другой сервер или персональный токен вместо входа через браузер.",
  "ux.hide": "Скрыть",
  "ux.change": "Показать",
  "cmd.openSettings": "Открыть настройки синхронизации",
  "status.finishSetup": "docli · Завершить настройку",
  "status.signInAgain": "docli · Войти снова",
  "status.setupHelp": "Вы вошли, но синхронизация выключена. Выберите пространство в Настройки → Docli Connect.",
  "ux.syncStatus": "Состояние синхронизации",
  "sync.auth.title": "Для синхронизации нужно войти снова",
  "sync.auth.desc": "Подключению нужен новый вход. Войдите и выберите пространство; локальные файлы останутся на устройстве.",
  "sync.live.title": "Синхронизация в реальном времени включена",
  "sync.live.desc": "Изменения синхронизируются автоматически, пока Obsidian открыт. Проверять вручную необязательно.",
  "sync.syncing.title": "Синхронизируем изменения…",
  "sync.syncing.desc": "Проверяем изменения в хранилище и пространстве.",
  "sync.polling.title": "Автоматическая синхронизация включена",
  "sync.polling.desc": "Нет постоянного соединения. Проверяем изменения каждые {seconds} секунд, пока Obsidian открыт.",
  "sync.disconnected.title": "Нет соединения для мгновенной синхронизации",
  "sync.disconnected.desc": "Проверки по таймеру выключены. Нажмите «Проверить сейчас» для обмена изменениями или проверьте настройки подключения.",
  "sync.paused.title": "Синхронизация приостановлена",
  "sync.paused.desc": "Завершите настройку или возобновите синхронизацию для обмена изменениями.",
  "sync.update.title": "Для синхронизации нужно обновление",
  "sync.update.desc": "Обновите Docli Connect, чтобы возобновить синхронизацию.",
  "sync.error.title": "Не удалось завершить синхронизацию",
  "sync.error.desc": "Не все изменения могли передаться. Проверьте соединение и повторите попытку.",
  "sync.attention.title": "Некоторые файлы требуют внимания",
  "sync.attention.desc": "Синхронизация завершилась, но некоторые файлы отложены. Проверьте уведомления о синхронизации.",
  "setupReminder.title": "Завершите подключение хранилища",
  "setupReminder.body": "Вы вошли, но ещё не выбрали пространство. Заметки пока не синхронизируются.",
  "setupReminder.choose": "Выбрать пространство",
  "reauthReminder.title": "Войдите снова для синхронизации",
  "reauthReminder.body": "Срок действия подключения к докли истёк. Войдите и выберите пространство; локальные файлы останутся на устройстве.",
  "reauthReminder.signIn": "Войти снова",
  "setupReminder.stop": "Больше не напоминать",
  "setupReminder.setting": "Напоминания о подключении",
  "setupReminder.help": "Если нужно завершить настройку или войти снова, напоминать не чаще раза в 10 минут, когда Obsidian активен.",
  "auth.failed": "Войдите в докли заново.",
  "auth.selectWorkspace": "Вы вошли. Выберите пространство и нажмите «Начать синхронизацию».",
  "auth.offlineRevoke": "Вы вышли на этом устройстве. Для отзыва подключения откройте Аккаунт → Подключения в докли.",
  "auth.signIn": "Войти в докли",
  "auth.token": "Использовать токен доступа",
  "auth.signOut": "Выйти",
  "auth.cancel": "Отменить вход",
  "auth.connected": "Подключено",
  "auth.expired": "Нужно войти",
  "auth.offline": "Нет связи — повторите позже",
  "auth.save": "Применить",
  "auth.method": "Подключение",
  "auth.secret": "Данные OAuth хранятся в Obsidian SecretStorage этого хранилища. Другие плагины могут обращаться к этому хранилищу секретов.",
  "auth.resetCap": "Сбросить до 50 МиБ",

  "cmd.syncNow": "Синхронизировать сейчас",

  "status.failedStart": "docli — не удалось запустить (см. консоль разработчика)",
  "status.notConfigured": "docli — укажите адрес сервера, токен и пространство в настройках",
  "status.notLocked": "docli — синхронизация приостановлена; выберите пространство и начните синхронизацию в настройках",
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
  "notice.unlocked": "docli: синхронизация приостановлена.",
  "notice.pickWorkspace": "docli: сначала выберите пространство.",
  "notice.locked": "docli: синхронизация запущена.",
  "notice.notConfiguredManual": "docli: сначала укажите адрес сервера, токен и пространство в настройках.",
  "notice.lockToSync": "docli: выберите пространство и начните синхронизацию в настройках.",
  "notice.httpsRequired": "docli: на мобильных устройствах нужен адрес сервера через https://.",
  "notice.syncFailed": "docli: сбой синхронизации — {msg}",
  "notice.conflictSaved": "docli: «{original}» уже занято — ваша копия сохранена как «{savedAs}».",
  "notice.moveOverridden":
    "docli: «{localPath}» перемещено в «{serverPath}» на другом устройстве — оставлено расположение с сервера.",
  "notice.skippedAttachments": "docli: пропущено {count} {noun}: {head}{ellipsis}",
  "notice.attachmentsFailed": "docli: не удалось передать {count} {noun}: {head}{ellipsis} — повторим позже.",
  "status.quarantined": "docli: синхронизация идёт, но не удалось применить локально ({count}): {head}{ellipsis} — повторяем. {last}",
  "notice.featuresNeedUpdate": "docli: обновите плагин, чтобы использовать новые возможности ({features}). Синхронизация продолжает работать.",

  "attach.tooLarge": "слишком большой",

  "modal.lock.title": "Начать синхронизацию этого хранилища?",
  "modal.lock.body1": "Это хранилище будет синхронизироваться с пространством «@{handle}» в обе стороны.",
  "modal.lock.body2":
    "Ваши локальные заметки отправляются на сервер, а заметки пространства загружаются в это хранилище; они объединяются. Пересекающиеся правки сохраняют ОБЕ копии (файл «(conflict)»), без молчаливой перезаписи — но содержимое хранилищ будет объединено.",
  "modal.lock.body3":
    "Убедитесь, что это нужное пространство И нужное хранилище, прежде чем начинать. Неверная пара смешает две коллекции заметок.",
  "modal.lock.confirm": "Начать синхронизацию",

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
  "settings.connect.desc": "Загрузить доступные этому подключению пространства.",
  "settings.connect.button": "Подключиться",
  "settings.workspace.name": "Пространство",
  "settings.workspace.descLocked": "Это хранилище связано с выбранным пространством.",
  "settings.workspace.descUnlocked":
    "Выберите пространство.",
  "settings.lock.nameLocked": "Синхронизация включена",
  "settings.lock.nameUnlocked": "Всё готово к синхронизации",
  "settings.lock.descLocked":
    "Приостановите синхронизацию, чтобы выбрать другое пространство.",
  "settings.lock.descUnlocked":
    "Перед началом вы увидите, как пройдёт первая синхронизация.",
  "settings.lock.unlock": "Приостановить и сменить пространство",
  "settings.lock.lockAndSync": "Начать синхронизацию",
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
  "settings.mirror.name": "Отражать порядок докли в проводнике файлов",
  "settings.mirror.desc":
    "Показывать ваш ручной порядок из докли в проводнике файлов и (на компьютере) перетаскивать " +
    "строки для изменения порядка — новый порядок отправляется в докли. Может перестать работать " +
    "после обновления Obsidian; тогда проводник вернётся к обычной сортировке — сама синхронизация " +
    "никогда не затрагивается.",
  "settings.mirror.descPartial":
    "Недоступно, пока задан список «Папки для синхронизации» — зеркалу порядка нужна синхронизация " +
    "всего хранилища (при частичной синхронизации проводник перемешивает локальные файлы, " +
    "которые сервер не может упорядочить).",
  "notice.mirrorDisabledPartial":
    "докли: зеркало порядка выключено — ему нужна синхронизация всего хранилища.",
  "settings.syncNow.name": "Синхронизировать сейчас",
  "settings.syncNow.button": "Проверить сейчас",
  "settings.syncNow.descUnlocked": "Сначала выберите пространство и начните синхронизацию.",
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

  "workspaces.tokenRejected": "Подключение отклонено — войдите заново или проверьте токен доступа.",
  "workspaces.serverReturned": "Сервер вернул {status}.",
  "workspaces.malformed": "Некорректный ответ сервера.",
  "workspaces.noViewer": "Подключение не авторизовано (нет пользователя).",

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
