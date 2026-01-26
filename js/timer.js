/**
 * =============================================
 * TIMER.JS - Pomodoro Timer
 * =============================================
 */

let pomodoroSettings = { ...DEFAULT_POMODORO };

let timerState = {
    seconds: 0,
    isRunning: false,
    isBreak: false,
    currentSession: 1,
    intervalId: null,
    linkedEvent: null
};

const TIMER_CIRCUMFERENCE = 2 * Math.PI * 118;

function initializeTimer() {
    pomodoroSettings = loadPomodoroSettings();
    timerState.seconds = pomodoroSettings.focusDuration * 60;
    timerState.isBreak = false;
    timerState.currentSession = 1;
    updateTimerDisplay();
    updateSessionIndicators();
    updateSettingsDisplay();
}

function toggleTimer() {
    if (timerState.isRunning) pauseTimer();
    else startTimer();
}

function startTimer() {
    if (timerState.isRunning) return;
    timerState.isRunning = true;
    document.getElementById('timerPlayBtn').textContent = '⏸';
    
    timerState.intervalId = setInterval(() => {
        if (timerState.seconds > 0) {
            timerState.seconds--;
            updateTimerDisplay();
        } else {
            completeSession();
        }
    }, 1000);
}

function pauseTimer() {
    if (!timerState.isRunning) return;
    timerState.isRunning = false;
    document.getElementById('timerPlayBtn').textContent = '▶';
    if (timerState.intervalId) {
        clearInterval(timerState.intervalId);
        timerState.intervalId = null;
    }
}

function resetTimer() {
    pauseTimer();
    timerState.seconds = timerState.isBreak 
        ? getBreakDuration() * 60 
        : pomodoroSettings.focusDuration * 60;
    updateTimerDisplay();
}

function skipSession() {
    pauseTimer();
    completeSession();
}

function completeSession() {
    pauseTimer();
    
    if (timerState.isBreak) {
        showGenericNotification('Break Over!', 'Time to focus!', '💪');
    } else {
        const isLongBreak = timerState.currentSession % pomodoroSettings.sessionsUntilLongBreak === 0;
        showGenericNotification('Focus Complete!', `Take a ${isLongBreak ? 'long' : 'short'} break.`, '🎉');
    }
    
    if (timerState.isBreak) {
        timerState.isBreak = false;
        timerState.seconds = pomodoroSettings.focusDuration * 60;
    } else {
        timerState.isBreak = true;
        timerState.currentSession++;
        timerState.seconds = getBreakDuration() * 60;
    }
    
    updateTimerDisplay();
    updateSessionIndicators();
    updateTimerStatus();
}

function getBreakDuration() {
    const sessionsCompleted = timerState.currentSession - 1;
    const isLongBreak = sessionsCompleted > 0 && sessionsCompleted % pomodoroSettings.sessionsUntilLongBreak === 0;
    return isLongBreak ? pomodoroSettings.longBreakDuration : pomodoroSettings.breakDuration;
}

function updateTimerDisplay() {
    const minutes = Math.floor(timerState.seconds / 60);
    const seconds = timerState.seconds % 60;
    document.getElementById('timerTime').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('timerLabel').textContent = `Session ${timerState.currentSession}`;
    
    const totalSeconds = timerState.isBreak ? getBreakDuration() * 60 : pomodoroSettings.focusDuration * 60;
    const progress = (totalSeconds - timerState.seconds) / totalSeconds;
    const offset = TIMER_CIRCUMFERENCE * (1 - progress);
    
    const progressRing = document.getElementById('timerProgress');
    progressRing.style.strokeDashoffset = offset;
    
    if (timerState.isBreak) {
        progressRing.classList.add('break');
        document.getElementById('timerPlayBtn').classList.add('break');
    } else {
        progressRing.classList.remove('break');
        document.getElementById('timerPlayBtn').classList.remove('break');
    }
}

function updateTimerStatus() {
    const statusEl = document.getElementById('timerStatus');
    statusEl.textContent = timerState.isBreak ? 'Break Time' : 'Focus Time';
    if (timerState.isBreak) statusEl.classList.add('break');
    else statusEl.classList.remove('break');
}

function updateSessionIndicators() {
    const container = document.getElementById('sessionIndicators');
    const total = pomodoroSettings.sessionsUntilLongBreak;
    
    let html = '';
    for (let i = 1; i <= total; i++) {
        let className = 'session-dot';
        if (i < timerState.currentSession) className += ' complete';
        else if (i === timerState.currentSession) className += ' active';
        html += `<div class="${className}"></div>`;
    }
    container.innerHTML = html;
}

function updateSettingsDisplay() {
    document.getElementById('settingFocusDuration').textContent = `${pomodoroSettings.focusDuration} min`;
    document.getElementById('settingBreakDuration').textContent = `${pomodoroSettings.breakDuration} min`;
    document.getElementById('settingLongBreak').textContent = `${pomodoroSettings.longBreakDuration} min`;
    document.getElementById('settingSessions').textContent = pomodoroSettings.sessionsUntilLongBreak;
}

function openPomodoroSettings() {
    document.getElementById('pomodoroFocusInput').value = pomodoroSettings.focusDuration;
    document.getElementById('pomodoroBreakInput').value = pomodoroSettings.breakDuration;
    document.getElementById('pomodoroLongBreakInput').value = pomodoroSettings.longBreakDuration;
    document.getElementById('pomodoroSessionsInput').value = pomodoroSettings.sessionsUntilLongBreak;
    document.getElementById('pomodoroSettingsModal').classList.add('active');
}

function closePomodoroSettings() {
    document.getElementById('pomodoroSettingsModal').classList.remove('active');
}

function savePomodoroSettings() {
    pomodoroSettings = {
        focusDuration: Math.max(1, Math.min(60, parseInt(document.getElementById('pomodoroFocusInput').value) || 25)),
        breakDuration: Math.max(1, Math.min(30, parseInt(document.getElementById('pomodoroBreakInput').value) || 5)),
        longBreakDuration: Math.max(1, Math.min(60, parseInt(document.getElementById('pomodoroLongBreakInput').value) || 15)),
        sessionsUntilLongBreak: Math.max(2, Math.min(10, parseInt(document.getElementById('pomodoroSessionsInput').value) || 4))
    };
    
    savePomodoroSettingsToStorage(pomodoroSettings);
    resetTimer();
    updateSessionIndicators();
    updateSettingsDisplay();
    closePomodoroSettings();
}

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
