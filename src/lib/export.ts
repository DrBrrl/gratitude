import type { Projection } from './domain';
import { colours } from './journal';
function escapeMarkdown(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}[\]()#+.!|~-]/g, '\\$&').replace(/\n/g, '  \n');
}
function localTimestamp(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
export function exportJournal(state: Projection, format: 'markdown' | 'json') {
  const entries = [...state.entries].reverse().map((entry) => ({ id: entry.id, createdAt: entry.recordedAt, prompt: entry.prompt, text: entry.text, colour: colours[entry.colour] }));
  if (format === 'json') return { name: 'gratitude-journal.json', type: 'application/json', content: JSON.stringify({ format: 'gratitude-journal', version: 1, throughSequence: state.cursor, entries }, null, 2) + '\n' };
  // Render in the exporting browser’s local timezone, including historical DST.
  const content = ['# Gratitude journal', ...entries.map((entry) =>
    `## ${localTimestamp(entry.createdAt)}\n\n**Prompt**: ${escapeMarkdown(entry.prompt)}\n\n**Reflection**: ${escapeMarkdown(entry.text)}`)].join('\n\n') + '\n';
  return { name: 'gratitude-journal.md', type: 'text/markdown', content };
}
