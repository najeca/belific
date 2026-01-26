/**
 * =============================================
 * NOTIFICATIONS.JS - Notification Management
 * =============================================
 */

let currentNotification = {
    event: null,
    snoozeCount: 0,
    snoozeTimer: null
};

const scheduledNotifications = new Map();

function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function showNotificationBanner(event) {
    currentNotification.event = event;
    currentNotification.snoozeCount = 0;
    
    const category = CATEGORIES[event.category] || CATEGORIES.personal;
    
    document.getElementById('notificationIcon').textContent = category.icon;
    document.getElementById('notificationTitle').textContent = `Time to start: ${event.title}`;
    document.getElementById('notificationBody').textContent = `${category.name} • ${calculateDuration(event.start, event.end)}`;
    document.getElementById('snoozeCount').textContent = '';
    document.getElementById('notificationBanner').classList.add('active');
    
    playNotificationSound();
}

function playNotificationSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {}
}

function snoozeNotification() {
    if (!currentNotification.event) return;
    
    currentNotification.snoozeCount++;
    
    if (currentNotification.snoozeCount >= NOTIFICATION_SETTINGS.maxSnoozes) {
        document.getElementById('notificationTitle').textContent = 'Final Reminder!';
        document.getElementById('snoozeCount').textContent = 'No more snoozes';
        return;
    }
    
    document.getElementById('notificationBanner').classList.remove('active');
    
    if (currentNotification.snoozeTimer) clearTimeout(currentNotification.snoozeTimer);
    
    currentNotification.snoozeTimer = setTimeout(() => {
        showSnoozeReminder();
    }, NOTIFICATION_SETTINGS.snoozeInterval * 60 * 1000);
}

function showSnoozeReminder() {
    if (!currentNotification.event) return;
    
    const event = currentNotification.event;
    const category = CATEGORIES[event.category] || CATEGORIES.personal;
    
    document.getElementById('notificationIcon').textContent = category.icon;
    document.getElementById('notificationTitle').textContent = `Reminder: ${event.title}`;
    document.getElementById('snoozeCount').textContent = `${NOTIFICATION_SETTINGS.maxSnoozes - currentNotification.snoozeCount} snoozes left`;
    document.getElementById('notificationBanner').classList.add('active');
    
    playNotificationSound();
}

function dismissNotification() {
    document.getElementById('notificationBanner').classList.remove('active');
    if (currentNotification.snoozeTimer) {
        clearTimeout(currentNotification.snoozeTimer);
        currentNotification.snoozeTimer = null;
    }
    currentNotification.event = null;
    currentNotification.snoozeCount = 0;
}

function scheduleAllTodayNotifications() {
    const today = new Date();
    const schedule = getScheduleForDate(today);
    const currentMinutes = getCurrentTimeMinutes();
    
    scheduledNotifications.forEach((timerId) => clearTimeout(timerId));
    scheduledNotifications.clear();
    
    schedule.events.forEach(event => {
        const eventMinutes = timeToMinutes(event.start);
        if (eventMinutes > currentMinutes) {
            const delay = (eventMinutes - currentMinutes) * 60 * 1000;
            const timerId = setTimeout(() => {
                showNotificationBanner(event);
            }, delay);
            scheduledNotifications.set(event.id, timerId);
        }
    });
}

function showGenericNotification(title, body, icon = '🔔') {
    document.getElementById('notificationIcon').textContent = icon;
    document.getElementById('notificationTitle').textContent = title;
    document.getElementById('notificationBody').textContent = body;
    document.getElementById('snoozeCount').textContent = '';
    currentNotification.event = null;
    document.getElementById('notificationBanner').classList.add('active');
    
    setTimeout(() => {
        if (!currentNotification.event) {
            document.getElementById('notificationBanner').classList.remove('active');
        }
    }, 5000);
    
    playNotificationSound();
}
