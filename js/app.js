/**
 * =============================================
 * APP.JS - Application Entry Point
 * =============================================
 */

let currentPage = 'today';

function initializeApp() {
    console.log('🚀 Belific starting up...');
    
    initializeSchedules();
    initializeTimer();
    requestNotificationPermission();
    
    renderTodayPage();
    scheduleAllTodayNotifications();
    
    // Auto-refresh every minute
    setInterval(() => {
        if (currentPage === 'today') {
            renderCurrentActivity(new Date());
            renderNextActivity(new Date());
        }
    }, 60000);
    
    setupTimeInputListeners();
    registerServiceWorker();
    
    console.log('✅ Belific ready!');
}

function navigateToPage(pageName) {
    currentPage = pageName;
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`${pageName}Page`).classList.add('active');
    
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.page === pageName) tab.classList.add('active');
    });
    
    switch (pageName) {
        case 'today': renderTodayPage(); break;
        case 'calendar': renderCalendarPage(); break;
        case 'focus':
            updateTimerDisplay();
            updateSessionIndicators();
            updateTimerStatus();
            linkTimerToEvent(getCurrentEvent(new Date()));
            break;
        case 'settings': updateSettingsDisplay(); break;
    }
    
    const fab = document.querySelector('.fab');
    fab.style.display = pageName === 'focus' ? 'none' : 'flex';
}

function setupTimeInputListeners() {
    ['eventStartInput', 'eventEndInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateDurationDisplay);
    });
    ['editEventStartInput', 'editEventEndInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateEditDurationDisplay);
    });
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(r => console.log('📦 Service Worker registered'))
            .catch(e => console.log('SW registration failed:', e));
    }
}

function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        if (currentPage === 'today') renderTodayPage();
        else if (currentPage === 'calendar') renderCalendarPage();
        scheduleAllTodayNotifications();
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);
document.addEventListener('visibilitychange', handleVisibilityChange);
