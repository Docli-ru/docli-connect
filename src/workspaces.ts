// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import { requestUrl } from "obsidian";
import { normalizeServerUrl } from "./settings.js";
import { t } from "./i18n.js";

export interface WorkspaceRef {
  id: string;
  handle: string;
  name: string;
}

const QUERY = `query { viewer { workspaces { id handle name } } }`;

export async function fetchWorkspaces(serverUrl: string, pat: string): Promise<WorkspaceRef[]> {
  const resp = await requestUrl({
    url: normalizeServerUrl(serverUrl) + "/api/graphql",
    method: "POST",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${pat}` },
    body: JSON.stringify({ query: QUERY }),
    throw: false,
  });
  if (resp.status === 401 || resp.status === 403) {
    throw new Error(t("workspaces.tokenRejected"));
  }
  if (resp.status !== 200) {
    throw new Error(t("workspaces.serverReturned", { status: resp.status }));
  }
  let data: { data?: { viewer?: { workspaces?: WorkspaceRef[] } | null }; errors?: unknown };
  try {
    data = resp.json as typeof data;
  } catch {
    throw new Error(t("workspaces.malformed"));
  }
  const viewer = data.data?.viewer;
  if (!viewer) throw new Error(t("workspaces.noViewer"));
  return viewer.workspaces ?? [];
}
