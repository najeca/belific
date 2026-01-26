/**
 * =============================================
 * STORAGE.JS - Local Storage Operations
 * =============================================
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

function saveSchedules(schedules) {
    try {
        localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules));
        return true;
    } catch (error) {
        console.error('Failed to save schedules:', error);
        return false;
    }
}

function loadSchedules() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.SCHEDULES);
        return data ? JSON.parse(data) : {};
    } catch (error) {
        console.error('Failed to load schedules:', error);
        return {};
    }
}

function loadPomodoroSettings() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.POMODORO);
        return data ? JSON.parse(data) : { ...DEFAULT_POMODORO };
    } catch (error) {
        return { ...DEFAULT_POMODORO };
    }
}

function savePomodoroSettingsToStorage(settings) {
    try {
        localStorage.setItem(STORAGE_KEYS.POMODORO, JSON.stringify(settings));
    } catch (error) {
        console.error('Failed to save Pomodoro settings:', error);
    }
}

function clearAllStorage() {
    try {
        localStorage.removeItem(STORAGE_KEYS.SCHEDULES);
        localStorage.removeItem(STORAGE_KEYS.POMODORO);
        localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    } catch (error) {
        console.error('Failed to clear storage:', error);
    }
}
