/**
 * =============================================
 * NOTIFICATIONS.JS - Notification Management
 * =============================================
 * 
 * Handles all notification functionality:
 * - In-app notification banners
 * - System notifications (where supported)
 * - Snooze functionality
 * - Scheduling notifications for events
 * 
 * LIMITATIONS ON iOS:
 * - PWAs have limited notification support
 * - Background notifications don't work reliably
 * - In-app banners work when app is in foreground
 */

/**
 * Current notification state.
 * Tracks the active notification and snooze count.
 */
let currentNotification = {
    event: null,       // The event being notified about
    snoozeCount: 0,    // Number of times snoozed
    snoozeTimer: null  // Timer ID for next snooze reminder
};

/**
 * Scheduled notification timers.
 * Maps event IDs to setTimeout IDs so we can cancel them.
 */
const scheduledNotifications = new Map();

/**
 * Requests permission for system notifications.
 * Call this early in app lifecycle.
 * 
 * On iOS Safari, this will prompt the user.
 * On desktop browsers, this shows a permission dialog.
 */
function requestNotificationPermission() {
    // Check if notifications are supported
    if (!('Notification' in window)) {
        console.log('This browser does not support notifications');
        return;
    }
    
    // Request permission if not already granted/denied
    if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            console.log('Notification permission:', permission);
        });
    }
}

/**
 * Shows an in-app notification banner.
 * This is the primary notification method as it works reliably.
 * 
 * @param {Object} event - The event to notify about
 * @param {string} event.title - Event title
 * @param {string} event.category - Category key
 * @param {string} event.start - Start time
 * @param {string} event.end - End time
 */
function showNotificationBanner(event) {
    // Store current notification state
    currentNotification.event = event;
    currentNotification.snoozeCount = 0;
    
    // Get category info for icon
    const category = CATEGORIES[event.category] || CATEGORIES.personal;
    
    // Update banner content
    document.getElementById('notificationIcon').textContent = category.icon;
    document.getElementById('notificationTitle').textContent = `Time to start: ${event.title}`;
    document.getElementById('notificationBody').textContent = 
        `${category.name} • ${calculateDuration(event.start, event.end)}`;
    document.getElementById('snoozeCount').textContent = '';
    
    // Show the banner
    document.getElementById('notificationBanner').classList.add('active');
    
    // Also send system notification if permitted
    sendSystemNotification(event);
    
    // Play a sound (if we had audio - browser limitations apply)
    playNotificationSound();
}

/**
 * Sends a system notification (browser notification).
 * This appears in the device's notification center.
 * 
 * @param {Object} event - The event to notify about
 */
function sendSystemNotification(event) {
    // Check if permitted
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        return;
    }
    
    const category = CATEGORIES[event.category] || CATEGORIES.personal;
    
    try {
        new Notification(`Time to start: ${event.title}`, {
            body: `${category.name} • ${calculateDuration(event.start, event.end)}`,
            icon: 'assets/icon-192.png',
            tag: event.id, // Prevents duplicate notifications
            requireInteraction: true // Keeps notification visible
        });
    } catch (error) {
        // System notifications may fail on some browsers
        console.log('System notification failed:', error);
    }
}

/**
 * Plays a notification sound.
 * Uses Web Audio API which works in most browsers.
 */
function playNotificationSound() {
    try {
        // Create a simple beep using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800; // Frequency in Hz
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        // Audio may be blocked by browser
        console.log('Audio notification failed:', error);
    }
}

/**
 * Handles the snooze button press.
 * Hides the banner and schedules a reminder in 10 minutes.
 */
function snoozeNotification() {
    if (!currentNotification.event) return;
    
    // Increment snooze count
    currentNotification.snoozeCount++;
    
    // Check if max snoozes reached
    if (currentNotification.snoozeCount >= NOTIFICATION_SETTINGS.maxSnoozes) {
        // Final reminder
        document.getElementById('notificationTitle').textContent = 'Final Reminder!';
        document.getElementById('notificationBody').textContent = 
            'You\'ve snoozed for 1 hour. Time to get started!';
        document.getElementById('snoozeCount').textContent = 'No more snoozes available';
        return;
    }
    
    // Hide the banner
    document.getElementById('notificationBanner').classList.remove('active');
    
    // Clear any existing snooze timer
    if (currentNotification.snoozeTimer) {
        clearTimeout(currentNotification.snoozeTimer);
    }
    
    // Schedule next reminder in 10 minutes
    const snoozeMs = NOTIFICATION_SETTINGS.snoozeInterval * 60 * 1000;
    
    currentNotification.snoozeTimer = setTimeout(() => {
        // Show reminder notification
        showSnoozeReminder();
    }, snoozeMs);
    
    console.log(`Snoozed. Reminder in ${NOTIFICATION_SETTINGS.snoozeInterval} minutes. ` +
                `Snooze ${currentNotification.snoozeCount}/${NOTIFICATION_SETTINGS.maxSnoozes}`);
}

/**
 * Shows a snooze reminder notification.
 * Called after the snooze interval has passed.
 */
function showSnoozeReminder() {
    if (!currentNotification.event) return;
    
    const event = currentNotification.event;
    const category = CATEGORIES[event.category] || CATEGORIES.personal;
    
    // Update banner for reminder
    document.getElementById('notificationIcon').textContent = category.icon;
    document.getElementById('notificationTitle').textContent = `Reminder: ${event.title}`;
    document.getElementById('notificationBody').textContent = 
        `Snooze ${currentNotification.snoozeCount}/${NOTIFICATION_SETTINGS.maxSnoozes} • Tap to start`;
    document.getElementById('snoozeCount').textContent = 
        `${NOTIFICATION_SETTINGS.maxSnoozes - currentNotification.snoozeCount} snoozes remaining`;
    
    // Show banner
    document.getElementById('notificationBanner').classList.add('active');
    
    // Play sound
    playNotificationSound();
    
    // Also try system notification
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(`Reminder: ${event.title}`, {
                body: `Snooze ${currentNotification.snoozeCount}/${NOTIFICATION_SETTINGS.maxSnoozes}`,
                icon: 'assets/icon-192.png',
                tag: `${event.id}-snooze`,
                requireInteraction: true
            });
        } catch (error) {
            console.log('Snooze system notification failed:', error);
        }
    }
}

/**
 * Dismisses the current notification.
 * Called when user taps "Start Activity".
 */
function dismissNotification() {
    // Hide the banner
    document.getElementById('notificationBanner').classList.remove('active');
    
    // Clear snooze timer
    if (currentNotification.snoozeTimer) {
        clearTimeout(currentNotification.snoozeTimer);
        currentNotification.snoozeTimer = null;
    }
    
    // Clear notification state
    currentNotification.event = null;
    currentNotification.snoozeCount = 0;
}

/**
 * Schedules a notification for an event.
 * The notification will fire at the event's start time.
 * 
 * @param {Object} event - The event to schedule notification for
 * @param {Date} date - The date of the event
 */
function scheduleEventNotification(event, date) {
    // Calculate when to fire
    const now = new Date();
    const eventDate = new Date(date);
    const [hours, mins] = event.start.split(':').map(Number);
    eventDate.setHours(hours, mins, 0, 0);
    
    const delay = eventDate.getTime() - now.getTime();
    
    // Only schedule if in the future
    if (delay <= 0) return;
    
    // Cancel any existing notification for this event
    cancelEventNotification(event.id);
    
    // Schedule the notification
    const timerId = setTimeout(() => {
        showNotificationBanner(event);
        scheduledNotifications.delete(event.id);
    }, delay);
    
    // Store timer ID so we can cancel if needed
    scheduledNotifications.set(event.id, timerId);
    
    console.log(`Scheduled notification for "${event.title}" in ${Math.round(delay / 60000)} minutes`);
}

/**
 * Cancels a scheduled notification.
 * 
 * @param {string} eventId - ID of the event to cancel
 */
function cancelEventNotification(eventId) {
    const timerId = scheduledNotifications.get(eventId);
    if (timerId) {
        clearTimeout(timerId);
        scheduledNotifications.delete(eventId);
    }
}

/**
 * Schedules notifications for all upcoming events today.
 * Call this when the app starts and when returning to foreground.
 */
function scheduleAllTodayNotifications() {
    const today = new Date();
    const schedule = getScheduleForDate(today);
    const currentMinutes = getCurrentTimeMinutes();
    
    // Cancel all existing scheduled notifications
    scheduledNotifications.forEach((timerId, eventId) => {
        clearTimeout(timerId);
    });
    scheduledNotifications.clear();
    
    // Schedule notifications for upcoming events
    schedule.events.forEach(event => {
        const eventMinutes = timeToMinutes(event.start);
        if (eventMinutes > currentMinutes) {
            scheduleEventNotification(event, today);
        }
    });
}

/**
 * Shows a generic notification (not tied to an event).
 * Used for timer completion, etc.
 * 
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {string} icon - Emoji icon to display
 */
function showGenericNotification(title, body, icon = '🔔') {
    // Update banner
    document.getElementById('notificationIcon').textContent = icon;
    document.getElementById('notificationTitle').textContent = title;
    document.getElementById('notificationBody').textContent = body;
    document.getElementById('snoozeCount').textContent = '';
    
    // Clear event reference (this is a generic notification)
    currentNotification.event = null;
    
    // Show banner
    document.getElementById('notificationBanner').classList.add('active');
    
    // Auto-hide after 5 seconds for generic notifications
    setTimeout(() => {
        if (!currentNotification.event) {
            document.getElementById('notificationBanner').classList.remove('active');
        }
    }, 5000);
    
    // Play sound
    playNotificationSound();
    
    // System notification
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(title, {
                body: body,
                icon: 'assets/icon-192.png'
            });
        } catch (error) {
            console.log('Generic system notification failed:', error);
        }
    }
}
