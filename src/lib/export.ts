import type { Projection } from './domain';
import { colours } from './journal';
function escapeMarkdown(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}[\]()#+.!|~-]/g, '\\$&').replace(/\n/g, '  \n');
}
export function exportJournal(state: Projection, format: 'markdown' | 'json') {
  const entries = [...state.entries].reverse().map((entry) => ({ id: entry.id, createdAt: entry.recordedAt, prompt: entry.prompt, text: entry.text, colour: colours[entry.colour] }));
  if (format === 'json') return { name: 'gratitude-journal.json', type: 'application/json', content: JSON.stringify({ format: 'gratitude-journal', version: 1, throughSequence: state.cursor, entries }, null, 2) + '\n' };
  const content = ['# Gratitude journal', `${entries.length} saved reflections · through event ${state.cursor}`, ...entries.map((entry) =>
    `## ${entry.createdAt}\n\n### Prompt\n\n${escapeMarkdown(entry.prompt)}\n\n### Reflection\n\n${escapeMarkdown(entry.text)}\n\nEntry: ${entry.id}  \nColour: ${entry.colour}`)].join('\n\n') + '\n';
  return { name: 'gratitude-journal.md', type: 'text/markdown', content };
}
