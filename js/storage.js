/**
 * =============================================
 * STORAGE.JS - Local Storage Operations
 * =============================================
 * 
 * Handles all data persistence using localStorage.
 * This is what makes the app work offline - all data
 * is stored in your browser, not on a server.
 * 
 * STORAGE KEYS:
 * - belific_schedules: All saved daily schedules
 * - belific_pomodoro: Pomodoro timer settings
 * 
 * DATA STRUCTURE:
 * Schedules are stored as an object keyed by date (YYYY-MM-DD).
 * Each date has a dayType and array of events.
 */

/**
 * Storage keys used throughout the app.
 * Centralized here to avoid typos and make changes easy.
 */
const STORAGE_KEYS = {
    SCHEDULES: 'belific_schedules',
    POMODORO: 'belific_pomodoro'
};

/**
 * Saves the schedules object to localStorage.
 * 
 * @param {Object} schedules - Object with date keys and schedule values
 * 
 * Example schedules object:
 * {
 *   "2025-01-02": {
 *     dayType: "workingWeekday",
 *     events: [{ id, title, category, start, end, completed }, ...]
 *   }
 * }
 */
function saveSchedules(schedules) {
    try {
        localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules));
    } catch (error) {
        // localStorage might be full or disabled
        console.error('Failed to save schedules:', error);
    }
}

/**
 * Loads all schedules from localStorage.
 * 
 * @returns {Object} The schedules object, or empty object if none saved
 */
function loadSchedules() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.SCHEDULES);
        return data ? JSON.parse(data) : {};
    } catch (error) {
        console.error('Failed to load schedules:', error);
        return {};
    }
}

/**
 * Saves Pomodoro settings to localStorage.
 * 
 * @param {Object} settings - Pomodoro configuration
 * @param {number} settings.focusDuration - Focus time in minutes
 * @param {number} settings.breakDuration - Short break in minutes
 * @param {number} settings.longBreakDuration - Long break in minutes
 * @param {number} settings.sessionsUntilLongBreak - Sessions before long break
 */
function savePomodoroSettings(settings) {
    try {
        localStorage.setItem(STORAGE_KEYS.POMODORO, JSON.stringify(settings));
    } catch (error) {
        console.error('Failed to save Pomodoro settings:', error);
    }
}

/**
 * Loads Pomodoro settings from localStorage.
 * Falls back to defaults if nothing saved.
 * 
 * @returns {Object} Pomodoro settings
 */
function loadPomodoroSettings() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.POMODORO);
        if (data) {
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Failed to load Pomodoro settings:', error);
    }
    
    // Return defaults if nothing saved or error occurred
    return { ...DEFAULT_POMODORO };
}

/**
 * Clears all app data from localStorage.
 * Used for the "Clear All Data" feature in settings.
 * 
 * WARNING: This is destructive and cannot be undone!
 */
function clearAllStorage() {
    try {
        localStorage.removeItem(STORAGE_KEYS.SCHEDULES);
        localStorage.removeItem(STORAGE_KEYS.POMODORO);
    } catch (error) {
        console.error('Failed to clear storage:', error);
    }
}

/**
 * Checks if localStorage is available.
 * Some browsers (Safari private mode) may block it.
 * 
 * @returns {boolean} True if localStorage is available
 */
function isStorageAvailable() {
    try {
        const test = '__storage_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
    } catch (e) {
        return false;
    }
}
