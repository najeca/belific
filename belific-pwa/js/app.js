/**
 * =============================================
 * APP.JS - Application Entry Point
 * =============================================
 * 
 * This is the main application file that:
 * - Initializes all components on startup
 * - Handles navigation between pages
 * - Registers the service worker for offline support
 * - Sets up event listeners
 * 
 * STARTUP SEQUENCE:
 * 1. Register service worker (for offline support)
 * 2. Initialize schedules from storage
 * 3. Initialize timer
 * 4. Request notification permissions
 * 5. Render initial page (Today)
 * 6. Schedule notifications for today's events
 * 7. Start auto-refresh interval
 */

/**
 * Currently active page.
 * Possible values: 'today', 'calendar', 'focus', 'settings'
 */
let currentPage = 'today';

/**
 * Main initialization function.
 * Called when the DOM is fully loaded.
 */
function initializeApp() {
    console.log('🚀 Belific starting up...');
    
    // Check if storage is available
    if (!isStorageAvailable()) {
        console.warn('localStorage is not available. Data will not persist.');
    }
    
    // Initialize components
    initializeSchedules();   // Load saved schedules
    initializeTimer();       // Load Pomodoro settings
    
    // Request notification permission (shows prompt to user)
    requestNotificationPermission();
    
    // Render the initial page
    renderTodayPage();
    
    // Schedule notifications for today's events
    scheduleAllTodayNotifications();
    
    // Set up auto-refresh every minute to update current/next events
    setInterval(() => {
        if (currentPage === 'today') {
            renderCurrentActivity(new Date());
            renderNextActivity(new Date());
        }
    }, 60000); // Every 60 seconds
    
    // Set up time input change listeners for duration display
    setupTimeInputListeners();
    
    // Register service worker for offline support
    registerServiceWorker();
    
    console.log('✅ Belific ready!');
}

/**
 * Navigates to a different page.
 * 
 * @param {string} pageName - The page to navigate to
 *                           ('today', 'calendar', 'focus', 'settings')
 */
function navigateToPage(pageName) {
    // Update current page tracker
    currentPage = pageName;
    
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    document.getElementById(`${pageName}Page`).classList.add('active');
    
    // Update tab bar
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.page === pageName) {
            tab.classList.add('active');
        }
    });
    
    // Render page content
    switch (pageName) {
        case 'today':
            renderTodayPage();
            break;
        case 'calendar':
            renderCalendarPage();
            break;
        case 'focus':
            updateTimerDisplay();
            updateSessionIndicators();
            updateTimerStatus();
            // Link timer to current activity if any
            const currentEvent = getCurrentEvent(new Date());
            linkTimerToEvent(currentEvent);
            break;
        case 'settings':
            updateSettingsDisplay();
            break;
    }
    
    // Hide FAB on focus page
    const fab = document.querySelector('.fab');
    if (pageName === 'focus') {
        fab.style.display = 'none';
    } else {
        fab.style.display = 'flex';
    }
}

/**
 * Sets up event listeners for time input changes.
 * Updates duration display when times are changed.
 */
function setupTimeInputListeners() {
    const startInput = document.getElementById('eventStartInput');
    const endInput = document.getElementById('eventEndInput');
    const editStartInput = document.getElementById('editEventStartInput');
    const editEndInput = document.getElementById('editEventEndInput');
    
    if (startInput) {
        startInput.addEventListener('change', updateDurationDisplay);
    }
    if (endInput) {
        endInput.addEventListener('change', updateDurationDisplay);
    }
    if (editStartInput) {
        editStartInput.addEventListener('change', updateEditDurationDisplay);
    }
    if (editEndInput) {
        editEndInput.addEventListener('change', updateEditDurationDisplay);
    }
}

/**
 * Registers the service worker for offline functionality.
 * The service worker caches app files so it works without internet.
 */
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('📦 Service Worker registered:', registration.scope);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    } else {
        console.log('Service Workers not supported in this browser');
    }
}

/**
 * Handles visibility changes (app going to background/foreground).
 * On iOS, when returning to foreground, we refresh data and notifications.
 */
function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        console.log('App returned to foreground');
        
        // Refresh current page
        if (currentPage === 'today') {
            renderTodayPage();
        } else if (currentPage === 'calendar') {
            renderCalendarPage();
        }
        
        // Re-schedule notifications (in case time has passed)
        scheduleAllTodayNotifications();
    }
}

// =============================================
// EVENT LISTENERS
// =============================================

/**
 * Initialize app when DOM is ready.
 */
document.addEventListener('DOMContentLoaded', initializeApp);

/**
 * Handle app visibility changes (background/foreground).
 */
document.addEventListener('visibilitychange', handleVisibilityChange);

/**
 * Handle clicks outside modals to close them.
 */
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        // Only close if clicking the overlay itself, not the modal content
        if (e.target === overlay) {
            overlay.classList.remove('active');
        }
    });
});

/**
 * Prevent pull-to-refresh on iOS (can interfere with scrolling).
 */
document.body.addEventListener('touchmove', (e) => {
    // Allow scrolling in scrollable containers
    let target = e.target;
    while (target !== document.body) {
        const overflow = window.getComputedStyle(target).overflowY;
        if (overflow === 'auto' || overflow === 'scroll') {
            return; // Allow scroll
        }
        target = target.parentElement;
        if (!target) break;
    }
}, { passive: false });

// =============================================
// GLOBAL ERROR HANDLING
// =============================================

/**
 * Catch and log any uncaught errors.
 */
window.onerror = function(message, source, lineno, colno, error) {
    console.error('Error:', message, 'at', source, lineno, colno);
    return false;
};

/**
 * Catch unhandled promise rejections.
 */
window.onunhandledrejection = function(event) {
    console.error('Unhandled promise rejection:', event.reason);
};
