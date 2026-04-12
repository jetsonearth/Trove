/**
 * Bulk sync module
 *
 * Runs in the background service worker on a schedule (chrome.alarms).
 * Fetches ALL conversations from the last N days from Claude and ChatGPT,
 * converts to markdown, and writes directly to the Obsidian vault via the
 * Local REST API. Each run does a full overwrite per file so the file always
 * reflects the complete conversation state.
 *
 * Auth: uses the user's Chrome session cookies (host_permissions grant access).
 * No cookie scraping, no external daemon, no TLS impersonation.
 */

import { ObsidianApiClient } from '../lib/obsidian-api';
import { validateObsidianUrl } from '../lib/validation';
import { getSettings } from '../lib/storage';
import { resolvePathTemplate } from '../lib/path-utils';
import { escapeYamlValue } from '../lib/yaml-utils';
import { formatDateWithTimezone } from '../lib/date-utils';
import type { AIPlatform } from '../lib/types';
import { MAX_FILENAME_BASE_LENGTH, PLATFORM_LABELS } from '../lib/constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateFileName(title: string, date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear() % 100;
  const datePrefix = `${month}-${day}-${year.toString().padStart(2, '0')}`;
  const sanitized = title
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .substring(0, MAX_FILENAME_BASE_LENGTH);
  return `${datePrefix} ${sanitized || 'Untitled'}.md`;
}

function isWithinLastDays(date: Date, days: number): boolean {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date >= cutoff;
}

function getAssistantLabel(source: AIPlatform): string {
  return PLATFORM_LABELS[source] ?? 'Assistant';
}

// ---------------------------------------------------------------------------
// Markdown generation - matches formatMessage() callout format exactly
// ---------------------------------------------------------------------------

interface SimpleMessage {
  role: 'user' | 'assistant';
  content: string;
}

function buildMarkdownFile(
  title: string,
  url: string,
  source: AIPlatform,
  createdDate: Date,
  messages: SimpleMessage[],
  timezone: string
): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`title: ${escapeYamlValue(title)}`);
  lines.push(`source: ${escapeYamlValue(source)}`);
  lines.push(`url: ${escapeYamlValue(url)}`);
  lines.push(`created: ${escapeYamlValue(formatDateWithTimezone(createdDate, timezone))}`);
  lines.push(`modified: ${escapeYamlValue(formatDateWithTimezone(new Date(), timezone))}`);
  lines.push('tags:');
  lines.push(`  - ${escapeYamlValue('ai-conversation')}`);
  lines.push(`  - ${escapeYamlValue(source)}`);
  lines.push(`message_count: ${messages.length}`);
  lines.push('---');
  lines.push('');

  // Messages in callout format - matches formatMessage('callout') output
  const assistantLabel = getAssistantLabel(source);
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const calloutType = msg.role === 'user' ? 'QUESTION' : 'NOTE';
    const label = msg.role === 'user' ? 'User' : assistantLabel;
    const contentLines = msg.content.split('\n');
    const formatted = contentLines.map((line, j) =>
      j === 0 ? `> [!${calloutType}] ${label}\n> ${line}` : `> ${line}`
    );
    lines.push(formatted.join('\n'));
    if (i < messages.length - 1) lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Obsidian write
// ---------------------------------------------------------------------------

async function writeToVault(
  fileName: string,
  content: string,
  source: AIPlatform
): Promise<boolean> {
  const settings = await getSettings();
  if (!settings.obsidianApiKey) {
    console.warn('[G2O Bulk] No Obsidian API key configured');
    return false;
  }

  try {
    validateObsidianUrl(settings.obsidianUrl);
  } catch {
    console.warn('[G2O Bulk] Invalid Obsidian URL');
    return false;
  }

  const client = new ObsidianApiClient(settings.obsidianUrl, settings.obsidianApiKey);
  const platformLabel = PLATFORM_LABELS[source] ?? source;
  const resolvedPath = resolvePathTemplate(settings.vaultPath, { platform: platformLabel });
  const fullPath = resolvedPath ? `${resolvedPath}/${fileName}` : fileName;

  try {
    await client.putFile(fullPath, content);
    return true;
  } catch (error) {
    console.warn(`[G2O Bulk] Failed to write ${fullPath}:`, error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Claude bulk fetcher
// ---------------------------------------------------------------------------

interface ClaudeChatListItem {
  uuid: string;
  name: string;
  created_at: string;
}

interface ClaudeMessage {
  sender: 'human' | 'assistant';
  text: string;
}

interface ClaudeChatDetail {
  uuid: string;
  name: string;
  created_at: string;
  chat_messages: ClaudeMessage[];
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T | null> {
  try {
    const resp = await fetch(url, { credentials: 'include', ...opts });
    if (!resp.ok) {
      console.warn(`[G2O Bulk] ${url} -> HTTP ${resp.status}`);
      return null;
    }
    return (await resp.json()) as T;
  } catch (error) {
    console.warn(`[G2O Bulk] fetch failed for ${url}:`, error);
    return null;
  }
}

async function bulkSyncClaude(
  daysBack: number,
  timezone: string
): Promise<{ saved: number; failed: number; authFailed: boolean }> {
  let saved = 0;
  let failed = 0;

  const orgs = await apiFetch<{ uuid: string }[]>('https://claude.ai/api/organizations');
  if (!orgs || orgs.length === 0) {
    console.warn('[G2O Bulk] Claude: not logged in');
    return { saved, failed, authFailed: true };
  }
  const orgId = orgs[0].uuid;

  const list = await apiFetch<ClaudeChatListItem[]>(
    `https://claude.ai/api/organizations/${orgId}/chat_conversations`
  );
  if (!list) return { saved, failed, authFailed: true };

  const recent = list.filter(c => isWithinLastDays(new Date(c.created_at), daysBack));
  console.info(`[G2O Bulk] Claude: ${recent.length} conversation(s) in last ${daysBack} day(s)`);

  for (const item of recent) {
    const detail = await apiFetch<ClaudeChatDetail>(
      `https://claude.ai/api/organizations/${orgId}/chat_conversations/${item.uuid}`
    );
    if (!detail || !detail.chat_messages?.length) { failed++; continue; }

    const messages: SimpleMessage[] = detail.chat_messages
      .filter(m => m.text)
      .map(m => ({
        role: m.sender === 'human' ? 'user' as const : 'assistant' as const,
        content: m.text,
      }));

    if (messages.length === 0) continue;

    const createdDate = new Date(detail.created_at);
    const title = detail.name || 'Untitled Claude Conversation';
    const fileName = generateFileName(title, createdDate);
    const url = `https://claude.ai/chat/${detail.uuid}`;
    const content = buildMarkdownFile(title, url, 'claude', createdDate, messages, timezone);

    if (await writeToVault(fileName, content, 'claude')) {
      saved++;
      console.info(`[G2O Bulk] Claude: ${fileName}`);
    } else {
      failed++;
    }
  }

  return { saved, failed, authFailed: false };
}

// ---------------------------------------------------------------------------
// ChatGPT bulk fetcher
// ---------------------------------------------------------------------------

interface ChatGPTMessageNode {
  id: string;
  message?: {
    author?: { role: string };
    content?: { parts?: unknown[] };
  };
  parent?: string | null;
}

interface ChatGPTConversationDetail {
  title: string;
  create_time: number;
  current_node: string;
  mapping: Record<string, ChatGPTMessageNode>;
}

function chatgptWalkTree(detail: ChatGPTConversationDetail): SimpleMessage[] {
  const path: ChatGPTMessageNode[] = [];
  let nodeId: string | null | undefined = detail.current_node;
  while (nodeId) {
    const node: ChatGPTMessageNode | undefined = detail.mapping[nodeId];
    if (!node) break;
    path.push(node);
    nodeId = node.parent;
  }
  path.reverse();

  const messages: SimpleMessage[] = [];
  for (const node of path) {
    const msg = node.message;
    if (!msg) continue;
    const role = msg.author?.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const parts = msg.content?.parts ?? [];
    const text = parts
      .filter((p): p is string => typeof p === 'string')
      .join('\n')
      .trim();
    if (!text) continue;
    messages.push({ role, content: text });
  }
  return messages;
}

async function bulkSyncChatGPT(
  daysBack: number,
  timezone: string
): Promise<{ saved: number; failed: number; authFailed: boolean }> {
  let saved = 0;
  let failed = 0;

  const session = await apiFetch<{ accessToken?: string }>('https://chatgpt.com/api/auth/session');
  if (!session?.accessToken) {
    console.warn('[G2O Bulk] ChatGPT: not logged in');
    return { saved, failed, authFailed: true };
  }
  const token = session.accessToken;
  const headers = { Authorization: `Bearer ${token}` };

  const list = await apiFetch<{ items: { id: string; title: string; create_time: number }[] }>(
    'https://chatgpt.com/backend-api/conversations?offset=0&limit=100',
    { headers }
  );
  if (!list?.items) return { saved, failed, authFailed: true };

  const recent = list.items.filter(c =>
    isWithinLastDays(new Date(c.create_time * 1000), daysBack)
  );
  console.info(`[G2O Bulk] ChatGPT: ${recent.length} conversation(s) in last ${daysBack} day(s)`);

  for (const item of recent) {
    const detail = await apiFetch<ChatGPTConversationDetail>(
      `https://chatgpt.com/backend-api/conversation/${item.id}`,
      { headers }
    );
    if (!detail) { failed++; continue; }

    const messages = chatgptWalkTree(detail);
    if (messages.length === 0) continue;

    const createdDate = new Date(detail.create_time * 1000);
    const title = detail.title || 'Untitled ChatGPT Conversation';
    const fileName = generateFileName(title, createdDate);
    const url = `https://chatgpt.com/c/${item.id}`;
    const content = buildMarkdownFile(title, url, 'chatgpt', createdDate, messages, timezone);

    if (await writeToVault(fileName, content, 'chatgpt')) {
      saved++;
      console.info(`[G2O Bulk] ChatGPT: ${fileName}`);
    } else {
      failed++;
    }
  }

  return { saved, failed, authFailed: false };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface BulkSyncResult {
  totalSaved: number;
  totalFailed: number;
  claudeAuthFailed: boolean;
  chatgptAuthFailed: boolean;
}

/**
 * Run a bulk sync across all configured platforms.
 *
 * @param daysBack How many days of history to fetch (default 1 = today only).
 */
export async function runBulkSync(daysBack = 1): Promise<BulkSyncResult> {
  const startedAt = new Date();
  console.info(
    `[G2O Bulk] Starting bulk sync (last ${daysBack} day(s)) at ${startedAt.toISOString()}`
  );

  const settings = await getSettings();
  const timezone = settings.templateOptions.timezone ?? 'UTC';

  const [claude, chatgpt] = await Promise.all([
    bulkSyncClaude(daysBack, timezone).catch(e => {
      console.error('[G2O Bulk] Claude error:', e);
      return { saved: 0, failed: 0, authFailed: true };
    }),
    bulkSyncChatGPT(daysBack, timezone).catch(e => {
      console.error('[G2O Bulk] ChatGPT error:', e);
      return { saved: 0, failed: 0, authFailed: true };
    }),
  ]);

  const totalSaved = claude.saved + chatgpt.saved;
  const totalFailed = claude.failed + chatgpt.failed;
  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);

  console.info(
    `[G2O Bulk] Done in ${elapsed}s. ` +
      `Saved ${totalSaved} (${claude.saved} Claude, ${chatgpt.saved} ChatGPT). ` +
      `Failed ${totalFailed}.`
  );

  return {
    totalSaved,
    totalFailed,
    claudeAuthFailed: claude.authFailed,
    chatgptAuthFailed: chatgpt.authFailed,
  };
}
