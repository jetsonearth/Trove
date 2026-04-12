/**
 * HTML to Markdown conversion — barrel re-export + orchestrator
 *
 * Internal modules:
 * - markdown-rules.ts      — Turndown engine (leaf, no internal deps)
 * - markdown-deep-research.ts — Citation → footnote pipeline
 * - markdown-formatting.ts — Message formatting templates
 */

import { formatMessage, formatToolContent } from './markdown-formatting';
import { convertDeepResearchContent } from './markdown-deep-research';
import { generateHash } from '../lib/hash';
import { MAX_FILENAME_BASE_LENGTH, FILENAME_ID_SUFFIX_LENGTH } from '../lib/constants';
import type {
  ConversationData,
  ObsidianNote,
  NoteFrontmatter,
  TemplateOptions,
} from '../lib/types';
import { formatDateWithTimezone } from '../lib/date-utils';

// Re-exports (preserve existing import paths)
export { htmlToMarkdown, escapeAngleBrackets } from './markdown-rules';
export { convertDeepResearchContent } from './markdown-deep-research';

/**
 * Generate sanitized filename from title and conversation date.
 *
 * Format: "M-D-YY Title.md" (e.g. "4-10-26 王兴创业失败的真相.md")
 * Preserves original casing and CJK characters. Uses the actual conversation
 * creation date if available (fetched from platform API), falling back to
 * the current date.
 */
export function generateFileName(title: string, _conversationId: string, date?: Date): string {
  const d = date ?? new Date();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear() % 100;
  const datePrefix = `${month}-${day}-${year.toString().padStart(2, '0')}`;

  const sanitized = title
    .replace(/[\\/:*?"<>|]/g, '') // Remove filesystem-unsafe chars only
    .trim()
    .substring(0, MAX_FILENAME_BASE_LENGTH);

  return `${datePrefix} ${sanitized || 'Untitled'}.md`;
}

/**
 * Generate content hash for deduplication
 */
export function generateContentHash(content: string): string {
  return generateHash(content);
}

/**
 * Convert conversation data to Obsidian note
 */
export function conversationToNote(data: ConversationData, options: TemplateOptions): ObsidianNote {
  const timezone = options.timezone ?? 'UTC';
  const now = formatDateWithTimezone(new Date(), timezone);

  // Generate frontmatter
  const frontmatter: NoteFrontmatter = {
    id: `${data.source}_${data.id}`,
    title: data.title,
    source: data.source,
    ...(data.type && { type: data.type }),
    url: data.url,
    created: formatDateWithTimezone(data.conversationDate ?? data.extractedAt, timezone),
    modified: now,
    tags:
      data.type === 'deep-research'
        ? ['ai-research', 'deep-research', data.source]
        : ['ai-conversation', data.source],
    message_count: data.messages.length,
  };

  // Generate body - different format for Deep Research vs normal conversation
  let body: string;

  if (data.type === 'deep-research') {
    // Deep Research: convert with links support (footnotes + References)
    if (data.messages.length === 0) {
      body = '';
    } else {
      body = convertDeepResearchContent(data.messages[0].content, data.links);
    }
  } else {
    // Normal conversation format (callout style)
    const bodyParts: string[] = [];

    for (const message of data.messages) {
      // Render tool content as separate collapsible callout before assistant message
      if (message.toolContent) {
        bodyParts.push(formatToolContent(message.toolContent, options));
      }
      const formatted = formatMessage(message.content, message.role, options, data.source);
      bodyParts.push(formatted);
    }

    body = bodyParts.join('\n\n');
  }

  // Generate filename and content hash - prefer real conversation date over extraction time
  const fileName = generateFileName(data.title, data.id, data.conversationDate ?? data.extractedAt);
  const contentHash = generateContentHash(body);

  return {
    fileName,
    frontmatter,
    body,
    contentHash,
  };
}
