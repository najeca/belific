// Run with `npm test` from mobile/. Lists beside Brain Dump (phase 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveListKey, listCounts, listEmojiOf, listNameProblem, listOptionText, listTitle, liveLists, newList, nextSortOrder, resolveSelectedList, tasksInList } from './lists.ts';
import type { Task, TaskList } from './types.ts';

const NOW = '2026-10-16T10:00:00.000Z';
const list = (key: string, name: string, extra: Partial<TaskList> = {}): TaskList => ({ key, name, sortOrder: 0, createdAt: NOW, updatedAt: NOW, ...extra });
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: NOW, updatedAt: NOW, ...extra });

test('names: blank, too long, Brain Dump and duplicates are refused; the list itself may keep its name', () => {
  const lists = [list('a', 'Reading'), list('b', 'Old', { deletedAt: NOW })];
  assert.equal(listNameProblem(lists, 'Errands'), null);
  assert.equal(listNameProblem(lists, '   '), 'Enter a name');
  assert.equal(listNameProblem(lists, 'x'.repeat(41)), 'Use 40 characters or fewer');
  assert.equal(listNameProblem(lists, ' brain  dump '), 'Brain Dump is always there');
  assert.equal(listNameProblem(lists, 'READING'), 'Another list has that name');
  assert.equal(listNameProblem(lists, 'reading', 'a'), null, 'renaming a list to its own name with other case');
  assert.equal(listNameProblem(lists, 'Old'), null, 'a deleted list does not hold its name');
});

test('new lists are named tidily and sort after the others', () => {
  const lists = [list('a', 'A', { sortOrder: 2 }), list('b', 'B', { sortOrder: 7, deletedAt: NOW })];
  assert.equal(nextSortOrder(lists), 3);
  assert.equal(nextSortOrder([]), 0);
  const l = newList('k', '  Weekend   plans ', undefined, 3, NOW);
  assert.deepEqual(l, { key: 'k', name: 'Weekend plans', sortOrder: 3, createdAt: NOW, updatedAt: NOW });
  assert.equal(newList('k', 'X', 'E', 0, NOW).emoji, 'E');
  assert.deepEqual(liveLists([list('z', 'Z', { sortOrder: 1 }), list('a', 'A', { sortOrder: 1 }), list('d', 'D', { deletedAt: NOW }), list('f', 'F', { sortOrder: 0 })]).map((x) => x.key), ['f', 'a', 'z']);
});

test('a task whose list is gone reads as Brain Dump', () => {
  const lists = [list('a', 'Reading'), list('b', 'Gone', { deletedAt: NOW })];
  assert.equal(effectiveListKey(task('t', { listKey: 'a' }), lists), 'a');
  assert.equal(effectiveListKey(task('t', { listKey: 'b' }), lists), undefined);
  assert.equal(effectiveListKey(task('t', { listKey: 'unknown' }), lists), undefined);
  assert.equal(effectiveListKey(task('t'), lists), undefined);
});

test('a list holds its own tasks; Brain Dump holds the rest; deleted tasks are in none', () => {
  const lists = [list('a', 'Reading'), list('b', 'Gone', { deletedAt: NOW })];
  const tasks = [task('1'), task('2', { listKey: 'a' }), task('3', { listKey: 'b' }), task('4', { listKey: 'a', deletedAt: NOW })];
  assert.deepEqual(tasksInList(tasks, undefined, lists).map((t) => t.id), ['1', '3']);
  assert.deepEqual(tasksInList(tasks, 'a', lists).map((t) => t.id), ['2']);
});

test('counts: incomplete tasks per list (2.27.0: a named list counts its scheduled tasks too); Brain Dump, under the empty key, only those with no Day', () => {
  const lists = [list('a', 'Reading')];
  const tasks = [
    task('1'),
    task('2', { listKey: 'a' }),
    task('3', { listKey: 'a' }),
    task('4', { listKey: 'a', completed: true }),
    task('5', { listKey: 'a', dueDate: '2026-10-20' }),
    task('6', { deletedAt: NOW }),
    task('7', { listKey: 'ghost' }),
  ];
  const c = listCounts(tasks, lists);
  assert.equal(c.get(''), 2);
  assert.equal(c.get('a'), 3, 'task 5 has a Day and stays in its list');
  assert.equal(listCounts([task('8', { dueDate: '2026-10-20' })], lists).get(''), 0, 'a Day still takes a task off Brain Dump');
});

test('titles and the remembered selection', () => {
  assert.equal(listTitle(undefined), '🧠 Brain Dump');
  assert.equal(listTitle(list('a', 'Reading', { emoji: '📚' })), '📚 Reading');
  assert.equal(listTitle(list('a', 'Reading')), '📋 Reading');
  const lists = [list('a', 'Reading'), list('b', 'Gone', { deletedAt: NOW })];
  assert.equal(resolveSelectedList('a', lists), 'a');
  assert.equal(resolveSelectedList('b', lists), undefined);
  assert.equal(resolveSelectedList(null, lists), undefined);
  assert.equal(resolveSelectedList('nope', lists), undefined);
});

test('list emoji on a card (2.27.1): only a live named list with an emoji', () => {
  const lists = [list('g', 'Games', { emoji: '🎮' }), list('p', 'Plain'), list('d', 'Gone', { emoji: '🗑️', deletedAt: NOW })];
  assert.equal(listEmojiOf(task('a', { listKey: 'g' }), lists), '🎮');
  assert.equal(listEmojiOf(task('b', { listKey: 'p' }), lists), undefined, 'a list with no emoji shows nothing (not the default)');
  assert.equal(listEmojiOf(task('c'), lists), undefined, 'Brain Dump shows nothing');
  assert.equal(listEmojiOf(task('d', { listKey: 'd' }), lists), undefined, 'a deleted list shows nothing');
  assert.equal(listEmojiOf(task('e', { listKey: 'missing' }), lists), undefined);
  assert.equal(listOptionText(lists[0]), '🎮 Games');
  assert.equal(listOptionText(lists[1]), 'Plain');
});

test('listNameOf gives the name of a live list only (the tooltip of a block\'s list emoji)', async () => {
  const { listNameOf } = await import('./lists.ts');
  const lists = [{ key: 'g', name: 'Gaming', deletedAt: undefined }, { key: 'd', name: 'Gone', deletedAt: '2026-10-01T00:00:00.000Z' }];
  assert.equal(listNameOf({ listKey: 'g' }, lists), 'Gaming');
  assert.equal(listNameOf({}, lists), undefined, 'Brain Dump');
  assert.equal(listNameOf({ listKey: 'd' }, lists), undefined, 'a deleted list');
  assert.equal(listNameOf({ listKey: 'missing' }, lists), undefined);
});

test('3.12.0: the Create list button is off for an empty, a long, Brain Dump\'s or a duplicate name, and says why', async () => {
  const { createListState, CREATE_NEEDS_NAME } = await import('./lists.ts');
  const lists = [list('g', 'Games'), list('d', 'Gone', { deletedAt: NOW })];
  assert.deepEqual(createListState(lists, ''), { enabled: false, why: CREATE_NEEDS_NAME });
  assert.deepEqual(createListState(lists, '   '), { enabled: false, why: CREATE_NEEDS_NAME });
  assert.deepEqual(createListState(lists, 'games'), { enabled: false, why: 'Another list has that name' });
  assert.deepEqual(createListState(lists, '  GAMES  '), { enabled: false, why: 'Another list has that name' });
  assert.deepEqual(createListState(lists, 'brain dump'), { enabled: false, why: 'Brain Dump is always there' });
  assert.equal(createListState(lists, 'x'.repeat(41)).enabled, false);
  assert.deepEqual(createListState(lists, 'Gone'), { enabled: true, why: null }, 'a deleted list\'s name is free');
  assert.deepEqual(createListState(lists, 'Reading'), { enabled: true, why: null });
});

// ---- 3.14.0: one emoji per list ----
const withEmoji = (key: string, name: string, emoji?: string, extra: Partial<TaskList> = {}) => list(key, name, { ...(emoji ? { emoji } : {}), ...extra });

test('3.14.0: takenEmojis has every live list\'s emoji and Brain Dump\'s brain, with or without the text style selector', async () => {
  const { takenEmojis } = await import('./lists.ts');
  const lists = [withEmoji('a', 'Games', '🎮'), withEmoji('b', 'Home', '❤️'), withEmoji('c', 'None'), withEmoji('d', 'Gone', '🏆', { deletedAt: NOW })];
  const taken = takenEmojis(lists);
  assert.equal(taken.get('🎮'), 'Games');
  assert.equal(taken.get('❤'), 'Home', 'keyed without U+FE0F');
  assert.equal(taken.get('🧠'), 'Brain Dump');
  assert.equal(taken.has('🏆'), false, 'a deleted list gives its emoji back');
  assert.equal(takenEmojis(lists, 'a').has('🎮'), false, 'the list being edited is not counted against itself');
});

test('3.14.0: a list cannot take another list\'s emoji, or Brain Dump\'s; its own and free ones are fine', async () => {
  const { listEmojiProblem } = await import('./lists.ts');
  const lists = [withEmoji('a', 'Games', '🎮'), withEmoji('b', 'Home', '❤️'), withEmoji('c', 'None')];
  assert.equal(listEmojiProblem(lists, '🎮'), '🎮 is already used by Games');
  assert.equal(listEmojiProblem(lists, '❤'), '❤ is already used by Home', 'with or without the selector');
  assert.equal(listEmojiProblem(lists, '🧠'), '🧠 is Brain Dump\'s emoji');
  assert.equal(listEmojiProblem(lists, '🎮', 'c'), '🎮 is already used by Games', 'editing another list');
  assert.equal(listEmojiProblem(lists, '🎮', 'a'), null, 'its own');
  assert.equal(listEmojiProblem(lists, '📚'), null);
  assert.equal(listEmojiProblem(lists, undefined), null, 'no emoji is always fine');
  assert.equal(listEmojiProblem(lists, 'abc'), null, 'text that is not an emoji is no emoji');
  assert.equal(listEmojiProblem(lists, '🎮 and more'), '🎮 is already used by Games', 'the first emoji of the text counts (as the command keeps it)');
});

test('3.14.0: existing duplicates are not changed: a list keeps its shared emoji and can still be renamed; the edit box notes it', async () => {
  const { editedList, listEmojiProblem, sharedEmojiNote } = await import('./lists.ts');
  const lists = [withEmoji('a', 'Games', '🎮'), withEmoji('b', 'Arcade', '🎮'), withEmoji('c', 'Brainy', '🧠')];
  assert.equal(listEmojiProblem(lists, '🎮', 'b'), null, 'keeping the emoji it already has');
  const renamed = editedList(lists, 'b', 'Arcade games', '🎮');
  assert.ok('list' in renamed && renamed.list.emoji === '🎮', 'a rename keeps the duplicate');
  assert.deepEqual(editedList(lists, 'b', 'Arcade', '🧠'), { problem: '🧠 is Brain Dump\'s emoji' }, 'changing to a taken one is refused');
  const r = editedList([withEmoji('a', 'Games', '🎮'), withEmoji('b', 'Home', '🏠')], 'b', 'Home', '🎮');
  assert.deepEqual(r, { problem: '🎮 is already used by Games' });
  assert.equal(sharedEmojiNote(lists, 'b'), '🎮 is also used by Games. It stays as it is; choose another emoji if you like.');
  assert.equal(sharedEmojiNote(lists, 'a'), '🎮 is also used by Arcade. It stays as it is; choose another emoji if you like.');
  assert.equal(sharedEmojiNote(lists, 'c'), '🧠 is also used by Brain Dump. It stays as it is; choose another emoji if you like.');
  assert.equal(sharedEmojiNote([withEmoji('a', 'Games', '🎮'), withEmoji('b', 'Home', '🏠')], 'a'), null, 'no note when it is its own');
  assert.equal(sharedEmojiNote(lists, 'zzz'), null);
});

test('3.14.0: the command layer enforces it (createList, editList through editedList, setListEmoji)', async () => {
  const src = (await import('node:fs')).readFileSync((await import('node:path')).resolve(import.meta.dirname, 'taskCommands.ts'), 'utf8');
  const create = src.slice(src.indexOf('export async function createList'), src.indexOf('export async function editList'));
  assert.match(create, /listEmojiProblem\(all, emojiText\)/, 'createList checks the emoji');
  const edit = src.slice(src.indexOf('export async function editList'), src.indexOf('export async function renameList'));
  assert.match(edit, /editedList\(/, 'editList goes through editedList, which checks it');
  const set = src.slice(src.indexOf('export async function setListEmoji'), src.indexOf('export async function removeList'));
  assert.match(set, /listEmojiProblem\(all, emojiText, key\)/, 'setListEmoji checks the emoji');
});

test('3.14.0: the list being edited is not greyed for the emoji it has, even a shared one', async () => {
  const { takenEmojis } = await import('./lists.ts');
  const lists = [withEmoji('a', 'Games', '🎮'), withEmoji('b', 'Arcade', '🎮')];
  assert.equal(takenEmojis(lists, 'b').has('🎮'), false);
  assert.equal(takenEmojis(lists).get('🎮'), 'Arcade', 'the first in list order (same sort order: by name)');
});
