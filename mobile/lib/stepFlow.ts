// Phase 1 of PLAN_phone_stepflow (3.59.0): the phone's step by step add flow, opened by the round +. Pure: NO runtime
// imports; see stepFlow.test.ts. The screens are in components/phone/StepAdd.tsx; every write goes through the usual
// task save path (storage.addTask once, then taskOps patches with the shared detailsPatches), so nothing new is stored.
//
//   1 what   "What's on your mind?"      Next stores the task at once: a title, no Day (Anytime).
//   2 when   "When do you want it done by?"  Today, Tomorrow, Pick a date.
//   3 time   "What time?"                a time, a length, or Just a reminder (a quick reminder, 0 minutes, F6).
//   4 where  "Which list or label?"
//   5 more   "Anything else to add?"     notes, smaller tasks, Done.
//
// Rules:
//   * "What time?" needs a Day: with no Day it is passed over, going forward and going back.
//   * A repeating task (made by a phrase such as "every Monday") keeps its days: "When" is passed over.
//   * A quick add phrase on screen 1 ("tomorrow 3pm") answers its screens: they are passed over going forward (Back still
//     reaches them, to change the answer).
//   * Closing at any point keeps the task as it is. With no Day it is in Brain Dump (or its list) on the Tasks tab, and
//     the screen the + was on says so (closedNote), so a closed flow never looks like a lost task.
import type { Task } from './types.ts';

export type Step = 'what' | 'when' | 'time' | 'where' | 'more';

export const STEPS: readonly Step[] = ['what', 'when', 'time', 'where', 'more'];

export const STEP_QUESTION: Record<Step, string> = {
  what: "What's on your mind?",
  when: 'When do you want it done by?',
  time: 'What time?',
  where: 'Which list or label?',
  more: 'Anything else to add?',
};

// 1 to 5, for the dots and for VoiceOver ("Step 2 of 5").
export function stepNumber(step: Step): number {
  return STEPS.indexOf(step) + 1;
}

export function stepLabel(step: Step): string {
  return `Step ${stepNumber(step)} of ${STEPS.length}`;
}

type Shape = Pick<Task, 'dueDate' | 'recurrence'>;

// Whether a screen can be shown at all for the task as it is now.
export function applies(step: Step, task: Shape): boolean {
  if (step === 'time') return !!task.dueDate;
  if (step === 'when') return !task.recurrence;
  return true;
}

// The screens a phrase on screen 1 answered (its fields as quickParse.quickFields gives them).
export function answeredBy(fields: Partial<Pick<Task, 'dueDate' | 'startTime'>>): Set<Step> {
  const out = new Set<Step>();
  if (fields.dueDate) out.add('when');
  if (fields.startTime) out.add('time');
  return out;
}

// The screen after `step`, or null when the flow is finished (after "Anything else to add?").
export function nextStep(step: Step, task: Shape, answered: ReadonlySet<Step> = new Set()): Step | null {
  for (let i = STEPS.indexOf(step) + 1; i < STEPS.length; i++) {
    const s = STEPS[i];
    if (applies(s, task) && !answered.has(s)) return s;
  }
  return null;
}

// The screen before `step` (answered screens included, so an answer can be changed), or null on screen 1.
export function prevStep(step: Step, task: Shape): Step | null {
  for (let i = STEPS.indexOf(step) - 1; i >= 0; i--) {
    const s = STEPS[i];
    if (applies(s, task)) return s;
  }
  return null;
}

// What the screen under the flow says when it closes: a task with no Day is not on Today or the Calendar, so it says
// where it is. Null when the task has a Day (it is on Today or the Calendar) or nothing was stored.
export function closedNote(task: Pick<Task, 'title' | 'dueDate'> | null, listName: string | undefined): string | null {
  if (!task || !task.title.trim() || task.dueDate) return null;
  return `Saved in ${listName ?? 'Brain Dump'} on the Tasks tab: ${task.title.trim()}`;
}
