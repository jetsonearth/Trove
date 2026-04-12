/**
 * Background Service Worker
 * Handles HTTP communication with Obsidian REST API
 */

import { getErrorMessage } from '../lib/error-utils';
import { getSettings, migrateSettings } from '../lib/storage';
import { validateSender, validateMessageContent } from './validation';
import { handleSave, handleGetFile, handleTestConnection } from './obsidian-handlers';
import { handleMultiOutput } from './output-handlers';
import { runBulkSync } from './bulk-sync';
import type { BulkSyncResult } from './bulk-sync';
import type { ExtensionMessage, ContentScriptSettings, ExtensionSettings } from '../lib/types';

// Run settings migration on service worker startup (C-01)
// Note: top-level await not available in service workers, use .catch() for error handling
migrateSettings().catch(error => {
  console.error('[G2O Background] Settings migration failed:', error);
});

// ---------------------------------------------------------------------------
// Daily bulk sync via chrome.alarms
// ---------------------------------------------------------------------------

const BULK_SYNC_ALARM = 'g2o-daily-bulk-sync';
const BULK_SYNC_PERIOD_MINUTES = 240; // every 4 hours

/**
 * Register the recurring bulk sync alarm. Idempotent - chrome.alarms.create
 * replaces an existing alarm with the same name.
 */
function registerBulkSyncAlarm(): void {
  chrome.alarms.create(BULK_SYNC_ALARM, {
    delayInMinutes: 1, // first run shortly after install/startup
    periodInMinutes: BULK_SYNC_PERIOD_MINUTES,
  });
  console.info(
    `[G2O Background] Registered daily bulk sync alarm (every ${BULK_SYNC_PERIOD_MINUTES} min)`
  );
}

/**
 * Notify the user when bulk sync fails (auth expired, Obsidian closed, etc.)
 * so they don't discover a multi-day gap like they did with trove.
 */
function notifyOnFailure(result: BulkSyncResult): void {
  const problems: string[] = [];
  if (result.claudeAuthFailed) problems.push('Claude: not logged in');
  if (result.chatgptAuthFailed) problems.push('ChatGPT: not logged in');
  if (result.totalFailed > 0) problems.push(`${result.totalFailed} conversation(s) failed to save`);

  if (problems.length === 0) return;

  chrome.notifications.create('g2o-bulk-sync-failure', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'AI Chat Sync Problem',
    message: problems.join('. ') + '. Open the relevant site in Chrome to refresh your session.',
    priority: 2,
  });
}

// Expose manual bulk sync for console debugging / one-time backfills
// Usage from service worker console: bulkSyncNow(4) to sync last 4 days
(globalThis as Record<string, unknown>).bulkSyncNow = (days = 1) => {
  console.info(`[G2O Background] Manual bulk sync triggered (${days} days)`);
  runBulkSync(days).then(notifyOnFailure);
};

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== BULK_SYNC_ALARM) return;
  console.info('[G2O Background] Bulk sync alarm fired');
  runBulkSync(1)
    .then(notifyOnFailure)
    .catch(error => {
      console.error('[G2O Background] Bulk sync failed:', error);
      chrome.notifications.create('g2o-bulk-sync-error', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'AI Chat Sync Error',
        message: 'Bulk sync crashed unexpectedly. Check the service worker console.',
        priority: 2,
      });
    });
});

chrome.runtime.onInstalled.addListener(() => {
  registerBulkSyncAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  registerBulkSyncAlarm();
});

// Also register at module load time so existing installs pick up the alarm
// without needing a re-install. chrome.alarms.create is idempotent.
registerBulkSyncAlarm();

/**
 * Handle incoming messages from content script and popup
 */
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    // Ignore messages targeted at offscreen document
    // These are handled by the offscreen document's own listener
    if (
      message &&
      typeof message === 'object' &&
      'target' in message &&
      message.target === 'offscreen'
    ) {
      return false;
    }

    // Sender validation (M-02)
    if (!validateSender(sender)) {
      console.warn('[G2O Background] Rejected message from unauthorized sender');
      sendResponse({ success: false, error: 'Unauthorized' });
      return false;
    }

    // Message content validation (M-02)
    if (!validateMessageContent(message)) {
      console.warn('[G2O Background] Invalid message content');
      sendResponse({ success: false, error: 'Invalid message content' });
      return false;
    }

    handleMessage(message, sender)
      .then(response => {
        try {
          sendResponse(response);
        } catch {
          /* sender disconnected */
        }
      })
      .catch(error => {
        console.error('[G2O Background] Error handling message:', error);
        try {
          sendResponse({ success: false, error: getErrorMessage(error) });
        } catch {
          /* sender disconnected */
        }
      });
    return true; // Indicates async response
  }
);

/**
 * Check if sender is a content script (tab) vs extension page (popup)
 */
function isContentScriptSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.tab !== undefined;
}

/**
 * Redact sensitive settings for content scripts.
 * Content scripts only need to know IF an API key is configured, not the key itself.
 */
function redactSettingsForContentScript(settings: ExtensionSettings): ContentScriptSettings {
  const { obsidianApiKey, ...syncSettings } = settings;
  return {
    ...syncSettings,
    isApiKeyConfigured: obsidianApiKey.length > 0,
  };
}

/**
 * Route messages to appropriate handlers
 */
async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  const settings = await getSettings();

  switch (message.action) {
    case 'saveToObsidian':
      return handleSave(settings, message.data);

    case 'saveToOutputs':
      return handleMultiOutput(message.data, message.outputs, settings);

    case 'getExistingFile':
      return handleGetFile(settings, message.fileName, message.vaultPath);

    case 'testConnection':
      return handleTestConnection(settings);

    case 'getSettings':
      // Security: Redact API key for content scripts (they run on third-party pages)
      return isContentScriptSender(sender) ? redactSettingsForContentScript(settings) : settings;

    default:
      return { success: false, error: 'Unknown action' };
  }
}

// Log when service worker starts
console.info('[G2O Background] Service worker started');
