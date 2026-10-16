import {
  loadBrainDumpItemsRaw,
  loadCustomCategoriesRaw,
  loadCustomEventsRaw,
  loadListsRaw,
  loadProjectsRaw,
  loadRoutineCompletions,
  loadRoutinesRaw,
  loadTasksRaw,
  loadUserSettingsRaw,
} from './storage';
import { buildExport, type ExportResult } from './dataExport';

// Reads the app's own tables from this computer (never the network, never a
// sign in session) and builds the export (dataExport.ts).
export async function exportMyData(appVersion: string): Promise<ExportResult> {
  const [tasks, labels, lists, settings, events, categories, routines, routineCompletions, brainDumpItems] = await Promise.all([
    loadTasksRaw(),
    loadProjectsRaw(),
    loadListsRaw(),
    loadUserSettingsRaw(),
    loadCustomEventsRaw(),
    loadCustomCategoriesRaw(),
    loadRoutinesRaw(),
    loadRoutineCompletions(),
    loadBrainDumpItemsRaw(),
  ]);
  return buildExport({ tasks, labels, lists, settings, events, categories, routines, routineCompletions, brainDumpItems }, appVersion, new Date().toISOString());
}
