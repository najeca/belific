/**
 * =============================================
 * TIMER.JS - Pomodoro Timer
 * =============================================
 * 
 * Implements the Pomodoro Technique timer:
 * - Focus sessions (default 25 minutes)
 * - Short breaks (default 5 minutes)
 * - Long breaks (default 15 minutes after 4 sessions)
 * 
 * The timer uses setInterval for countdown, which works
 * when the app is in the foreground. Background timing
 * is limited on mobile devices.
 */

/**
 * Pomodoro settings.
 * Loaded from localStorage, with defaults as fallback.
 */
let pomodoroSettings = { ...DEFAULT_POMODORO };

/**
 * Timer state.
 */
let timerState = {
    seconds: 0,           // Remaining seconds
    isRunning: false,     // Is timer actively counting down
    isBreak: false,       // Is this a break (vs focus) session
    currentSession: 1,    // Current session number (1-4 typically)
    intervalId: null,     // setInterval ID for cleanup
    linkedEvent: null     // Event this timer is linked to (optional)
};

/**
 * Circumference of the timer ring SVG.
 * Used to calculate stroke-dashoffset for progress.
 * Formula: 2 * PI * radius (radius = 118 in our SVG)
 */
const TIMER_CIRCUMFERENCE = 2 * Math.PI * 118; // ≈ 741.416

/**
 * Initializes the Pomodoro timer.
 * Loads settings and sets initial state.
 */
function initializeTimer() {
    // Load saved settings
    pomodoroSettings = loadPomodoroSettings();
    
    // Set initial time to focus duration
    timerState.seconds = pomodoroSettings.focusDuration * 60;
    timerState.isBreak = false;
    timerState.currentSession = 1;
    
    // Update display
    updateTimerDisplay();
    updateSessionIndicators();
    updateSettingsDisplay();
}

/**
 * Starts or pauses the timer.
 * Called when user taps the play/pause button.
 */
function toggleTimer() {
    if (timerState.isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
}

/**
 * Starts the timer countdown.
 */
function startTimer() {
    if (timerState.isRunning) return;
    
    timerState.isRunning = true;
    
    // Update button to show pause icon
    document.getElementById('timerPlayBtn').textContent = '⏸';
    
    // Start interval - tick every second
    timerState.intervalId = setInterval(() => {
        if (timerState.seconds > 0) {
            timerState.seconds--;
            updateTimerDisplay();
        } else {
            // Timer completed
            completeSession();
        }
    }, 1000);
}

/**
 * Pauses the timer.
 */
function pauseTimer() {
    if (!timerState.isRunning) return;
    
    timerState.isRunning = false;
    
    // Update button to show play icon
    document.getElementById('timerPlayBtn').textContent = '▶';
    
    // Clear interval
    if (timerState.intervalId) {
        clearInterval(timerState.intervalId);
        timerState.intervalId = null;
    }
}

/**
 * Resets the timer to the start of current session type.
 */
function resetTimer() {
    pauseTimer();
    
    // Reset to start of current session type
    if (timerState.isBreak) {
        timerState.seconds = getBreakDuration() * 60;
    } else {
        timerState.seconds = pomodoroSettings.focusDuration * 60;
    }
    
    updateTimerDisplay();
}

/**
 * Skips to the next session.
 * Useful if you finish early or want to skip a break.
 */
function skipSession() {
    pauseTimer();
    completeSession();
}

/**
 * Handles session completion.
 * Switches between focus and break, handles long breaks.
 */
function completeSession() {
    pauseTimer();
    
    // Send completion notification
    if (timerState.isBreak) {
        showGenericNotification(
            'Break Over!',
            'Time to focus again. You\'ve got this!',
            '💪'
        );
    } else {
        const isLongBreak = timerState.currentSession % pomodoroSettings.sessionsUntilLongBreak === 0;
        showGenericNotification(
            'Focus Session Complete!',
            `Great work! Take a ${isLongBreak ? 'long' : 'short'} break.`,
            '🎉'
        );
    }
    
    // Toggle between focus and break
    if (timerState.isBreak) {
        // Break finished - start new focus session
        timerState.isBreak = false;
        timerState.seconds = pomodoroSettings.focusDuration * 60;
    } else {
        // Focus finished - start break
        timerState.isBreak = true;
        timerState.currentSession++;
        timerState.seconds = getBreakDuration() * 60;
    }
    
    // Update UI
    updateTimerDisplay();
    updateSessionIndicators();
    updateTimerStatus();
}

/**
 * Gets the current break duration based on session number.
 * Every N sessions (default 4), take a long break.
 * 
 * @returns {number} Break duration in minutes
 */
function getBreakDuration() {
    // Check if it's time for a long break
    // We use (currentSession - 1) because we increment after completing focus
    const sessionsCompleted = timerState.currentSession - 1;
    const isLongBreak = sessionsCompleted > 0 && 
                        sessionsCompleted % pomodoroSettings.sessionsUntilLongBreak === 0;
    
    return isLongBreak ? pomodoroSettings.longBreakDuration : pomodoroSettings.breakDuration;
}

/**
 * Updates the timer display (time and progress ring).
 */
function updateTimerDisplay() {
    // Format time as MM:SS
    const minutes = Math.floor(timerState.seconds / 60);
    const seconds = timerState.seconds % 60;
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    document.getElementById('timerTime').textContent = timeString;
    document.getElementById('timerLabel').textContent = `Session ${timerState.currentSession}`;
    
    // Calculate progress
    const totalSeconds = timerState.isBreak 
        ? getBreakDuration() * 60 
        : pomodoroSettings.focusDuration * 60;
    const progress = (totalSeconds - timerState.seconds) / totalSeconds;
    
    // Update ring progress
    const offset = TIMER_CIRCUMFERENCE * (1 - progress);
    const progressRing = document.getElementById('timerProgress');
    progressRing.style.strokeDashoffset = offset;
    
    // Update ring color based on mode
    if (timerState.isBreak) {
        progressRing.classList.add('break');
    } else {
        progressRing.classList.remove('break');
    }
    
    // Update play button color
    const playBtn = document.getElementById('timerPlayBtn');
    if (timerState.isBreak) {
        playBtn.classList.add('break');
    } else {
        playBtn.classList.remove('break');
    }
}

/**
 * Updates the timer status text.
 */
function updateTimerStatus() {
    const statusEl = document.getElementById('timerStatus');
    statusEl.textContent = timerState.isBreak ? 'Break Time' : 'Focus Time';
    
    if (timerState.isBreak) {
        statusEl.classList.add('break');
    } else {
        statusEl.classList.remove('break');
    }
}

/**
 * Updates the session indicator dots.
 * Shows which session we're on out of the total before long break.
 */
function updateSessionIndicators() {
    const container = document.getElementById('sessionIndicators');
    const totalSessions = pomodoroSettings.sessionsUntilLongBreak;
    
    let html = '';
    for (let i = 1; i <= totalSessions; i++) {
        let className = 'session-dot';
        if (i < timerState.currentSession) {
            className += ' complete';
        } else if (i === timerState.currentSession) {
            className += ' active';
        }
        html += `<div class="${className}"></div>`;
    }
    
    container.innerHTML = html;
}

/**
 * Updates the settings display in the Settings page.
 */
function updateSettingsDisplay() {
    document.getElementById('settingFocusDuration').textContent = 
        `${pomodoroSettings.focusDuration} min`;
    document.getElementById('settingBreakDuration').textContent = 
        `${pomodoroSettings.breakDuration} min`;
    document.getElementById('settingLongBreak').textContent = 
        `${pomodoroSettings.longBreakDuration} min`;
    document.getElementById('settingSessions').textContent = 
        pomodoroSettings.sessionsUntilLongBreak;
}

/**
 * Opens the Pomodoro settings modal.
 */
function openPomodoroSettings() {
    // Populate inputs with current values
    document.getElementById('pomodoroFocusInput').value = pomodoroSettings.focusDuration;
    document.getElementById('pomodoroBreakInput').value = pomodoroSettings.breakDuration;
    document.getElementById('pomodoroLongBreakInput').value = pomodoroSettings.longBreakDuration;
    document.getElementById('pomodoroSessionsInput').value = pomodoroSettings.sessionsUntilLongBreak;
    
    // Show modal
    document.getElementById('pomodoroSettingsModal').classList.add('active');
}

/**
 * Closes the Pomodoro settings modal without saving.
 */
function closePomodoroSettings() {
    document.getElementById('pomodoroSettingsModal').classList.remove('active');
}

/**
 * Saves Pomodoro settings from the modal.
 */
function savePomodoroSettings() {
    // Get values from inputs
    const focusDuration = parseInt(document.getElementById('pomodoroFocusInput').value) || 25;
    const breakDuration = parseInt(document.getElementById('pomodoroBreakInput').value) || 5;
    const longBreakDuration = parseInt(document.getElementById('pomodoroLongBreakInput').value) || 15;
    const sessionsUntilLongBreak = parseInt(document.getElementById('pomodoroSessionsInput').value) || 4;
    
    // Validate ranges
    pomodoroSettings = {
        focusDuration: Math.max(1, Math.min(60, focusDuration)),
        breakDuration: Math.max(1, Math.min(30, breakDuration)),
        longBreakDuration: Math.max(1, Math.min(60, longBreakDuration)),
        sessionsUntilLongBreak: Math.max(2, Math.min(10, sessionsUntilLongBreak))
    };
    
    // Save to localStorage
    savePomodoroSettingsToStorage(pomodoroSettings);
    
    // Reset timer with new settings
    resetTimer();
    updateSessionIndicators();
    updateSettingsDisplay();
    
    // Close modal
    closePomodoroSettings();
}

/**
 * Wrapper to save Pomodoro settings (uses storage.js function name).
 */
function savePomodoroSettingsToStorage(settings) {
    try {
        localStorage.setItem(STORAGE_KEYS.POMODORO, JSON.stringify(settings));
    } catch (error) {
        console.error('Failed to save Pomodoro settings:', error);
    }
}

/**
 * Links the timer to a specific event.
 * Shows the event info on the Focus page.
 * 
 * @param {Object} event - The event to link to
 */
function linkTimerToEvent(event) {
    timerState.linkedEvent = event;
    
    if (event) {
        const category = CATEGORIES[event.category] || CATEGORIES.personal;
        document.getElementById('linkedActivityIcon').textContent = category.icon;
        document.getElementById('linkedActivityIcon').style.backgroundColor = category.color + '22';
        document.getElementById('linkedActivityTitle').textContent = event.title;
        document.getElementById('linkedActivityCard').classList.add('visible');
    } else {
        document.getElementById('linkedActivityCard').classList.remove('visible');
    }
}
