/**
 * =============================================
 * SCHEDULE.JS - Schedule Management
 * =============================================
 */

let schedules = {};

function initializeSchedules() {
    schedules = loadSchedules();
}

function getDateKey(date) {
    return date.toISOString().split('T')[0];
}

function getDayTypeInfo(dayType) {
    return DAY_TYPES[dayType] || { name: 'Unknown', color: '#8B8B8B' };
}

/**
 * Gets schedule for a specific date.
 * Uses pre-populated schedules from SPECIFIC_SCHEDULES if available.
 */
function getScheduleForDate(date) {
    const dateKey = getDateKey(date);
    
    // Check if we have a saved schedule with modifications
    if (schedules[dateKey]) {
        return schedules[dateKey];
    }
    
    // Check if we have a pre-populated schedule for this date
    if (SPECIFIC_SCHEDULES[dateKey]) {
        const template = SPECIFIC_SCHEDULES[dateKey];
        const events = template.events.map((event, index) => ({
            id: `${dateKey}-${index}`,
            title: event.title,
            category: event.category,
            start: event.start,
            end: event.end,
            notes: event.notes || '',
            completed: false
        }));
        
        schedules[dateKey] = {
            dayType: template.dayType,
            events: events
        };
        
        saveSchedules(schedules);
        return schedules[dateKey];
    }
    
    // Default empty schedule
    schedules[dateKey] = {
        dayType: 'nonWorkDay',
        events: []
    };
    
    return schedules[dateKey];
}

function addEvent(date, eventData) {
    const dateKey = getDateKey(date);
    const schedule = getScheduleForDate(date);
    
    const newEvent = {
        id: `${dateKey}-${Date.now()}`,
        title: eventData.title,
        category: eventData.category,
        start: eventData.start,
        end: eventData.end,
        notes: eventData.notes || '',
        completed: false
    };
    
    schedule.events.push(newEvent);
    schedule.events.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    saveSchedules(schedules);
    
    return newEvent;
}

function updateEvent(eventId, eventData) {
    const dateKey = eventId.split('-').slice(0, 3).join('-');
    const schedule = schedules[dateKey];
    if (!schedule) return null;
    
    const event = schedule.events.find(e => e.id === eventId);
    if (!event) return null;
    
    event.title = eventData.title;
    event.category = eventData.category;
    event.start = eventData.start;
    event.end = eventData.end;
    event.notes = eventData.notes || '';
    
    schedule.events.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    saveSchedules(schedules);
    
    return event;
}

function toggleEventComplete(eventId) {
    const dateKey = eventId.split('-').slice(0, 3).join('-');
    const schedule = schedules[dateKey];
    if (!schedule) return null;
    
    const event = schedule.events.find(e => e.id === eventId);
    if (!event) return null;
    
    event.completed = !event.completed;
    saveSchedules(schedules);
    
    return event.completed;
}

function deleteEvent(eventId) {
    const dateKey = eventId.split('-').slice(0, 3).join('-');
    const schedule = schedules[dateKey];
    if (!schedule) return false;
    
    const index = schedule.events.findIndex(e => e.id === eventId);
    if (index === -1) return false;
    
    schedule.events.splice(index, 1);
    saveSchedules(schedules);
    
    return true;
}

function getCurrentEvent(date) {
    const schedule = getScheduleForDate(date);
    const currentMinutes = getCurrentTimeMinutes();
    
    return schedule.events.find(event => {
        const startMinutes = timeToMinutes(event.start);
        const endMinutes = timeToMinutes(event.end);
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }) || null;
}

function getNextEvent(date) {
    const schedule = getScheduleForDate(date);
    const currentMinutes = getCurrentTimeMinutes();
    
    return schedule.events.find(event => {
        return timeToMinutes(event.start) > currentMinutes;
    }) || null;
}

function calculateStats(schedule) {
    const stats = { study: 0, jobHunting: 0, portfolio: 0 };
    
    schedule.events.forEach(event => {
        const duration = timeToMinutes(event.end) - timeToMinutes(event.start);
        if (event.category === 'study' || event.category === 'exam') stats.study += duration;
        else if (event.category === 'jobHunting') stats.jobHunting += duration;
        else if (event.category === 'portfolio') stats.portfolio += duration;
    });
    
    return stats;
}

// Time utilities
function timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}

function getCurrentTimeMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
}

function formatTime(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function formatTimeShort(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')}`;
}

function calculateDuration(startTime, endTime) {
    const duration = timeToMinutes(endTime) - timeToMinutes(startTime);
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
}

function formatMinutesAsTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
}

function formatDate(date) {
    return date.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });
}
