import { loadCustomEvents, loadTasksRaw } from './storage';
import { buildNotifyPayload } from './desktopNotifyCore';

// Desktop notifications (decision 017, checkpoint 7). Web/desktop only:
// nothing on iOS imports this file. The page only reports what is coming up;
// the Electron main process owns the timers, de-duplicates, cancels on change
// and shows the toast, so reminders keep working with the window closed to
// the tray. Notifiable: CustomEvent starts and placed tasks (both user set
// commitments), plus the planned-task count for the daily reminder
// (decision 020).

let timer: ReturnType<typeof setTimeout> | null = null;

// Reads local data and sends the payload. Debounced, so a burst of edits is one send.
export function sendNotifyPayload(): void {
  const bridge = globalThis.belificDesktop?.notify;
  if (!bridge) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = null;
    try {
      const [events, tasks] = await Promise.all([loadCustomEvents(), loadTasksRaw()]);
      await bridge.update(buildNotifyPayload(events, tasks, Date.now()));
    } catch {
      // A failed send is retried on the next change or tick.
    }
  }, 300);
}
