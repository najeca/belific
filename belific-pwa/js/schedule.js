/**
 * =============================================
 * SCHEDULE.JS - Schedule Management
 * =============================================
 * 
 * Handles all schedule-related logic:
 * - Determining day types from dates
 * - Getting/creating schedules for specific dates
 * - Managing events (add, toggle, delete)
 * - Calculating statistics
 * 
 * The schedule system uses templates (from data.js) to
 * automatically populate new days with your routine.
 */

/**
 * In-memory cache of all schedules.
 * Loaded from localStorage on app start.
 */
let schedules = {};

/**
 * Initializes the schedule system.
 * Loads saved schedules from localStorage.
 * Call this once when the app starts.
 */
function initializeSchedules() {
    schedules = loadSchedules();
}

/**
 * Determines the day type for a given date.
 * 
 * @param {Date} date - The date to check
 * @returns {string} Day type key: 'workingWeekday', 'nonWorkingWeekday', or 'workingWeekend'
 * 
 * Based on your configuration:
 * - Tuesday (2) & Thursday (4) → Working Weekday
 * - Monday (1), Wednesday (3), Friday (5) → Non-Working Weekday
 * - Saturday (6) & Sunday (0) → Working Weekend
 */
function getDayType(date) {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Check each day type's configured days
    for (const [typeName, typeConfig] of Object.entries(DAY_TYPES)) {
        if (typeConfig.days.includes(dayOfWeek)) {
            return typeName;
        }
    }
    
    // Fallback (shouldn't happen if DAY_TYPES covers all days)
    return 'nonWorkingWeekday';
}

/**
 * Gets the display info for a day type.
 * 
 * @param {string} dayType - Day type key
 * @returns {Object} Object with name and color properties
 */
function getDayTypeInfo(dayType) {
    return DAY_TYPES[dayType] || { name: 'Unknown', color: '#8B8B8B' };
}

/**
 * Converts a Date to a storage key string.
 * Format: YYYY-MM-DD
 * 
 * @param {Date} date - The date to convert
 * @returns {string} Date key string
 */
function getDateKey(date) {
    return date.toISOString().split('T')[0];
}

/**
 * Gets or creates the schedule for a specific date.
 * If no schedule exists for that date, creates one from the template.
 * 
 * @param {Date} date - The date to get schedule for
 * @returns {Object} Schedule object with dayType and events array
 */
function getScheduleForDate(date) {
    const dateKey = getDateKey(date);
    
    // Check if we already have a schedule for this date
    if (schedules[dateKey]) {
        return schedules[dateKey];
    }
    
    // Create new schedule from template
    const dayType = getDayType(date);
    const template = SCHEDULE_TEMPLATES[dayType] || [];
    
    // Create events from template with unique IDs
    const events = template.map((templateEvent, index) => ({
        id: `${dateKey}-${index}`,
        title: templateEvent.title,
        category: templateEvent.category,
        start: templateEvent.start,
        end: templateEvent.end,
        notes: templateEvent.notes || '',
        completed: false
    }));
    
    // Save the new schedule
    schedules[dateKey] = {
        dayType: dayType,
        events: events
    };
    
    saveSchedules(schedules);
    
    return schedules[dateKey];
}

/**
 * Adds a new event to a specific date's schedule.
 * 
 * @param {Date} date - The date to add event to
 * @param {Object} eventData - Event data (title, category, start, end, notes)
 * @returns {Object} The created event with ID
 */
function addEvent(date, eventData) {
    const dateKey = getDateKey(date);
    const schedule = getScheduleForDate(date);
    
    // Create new event with unique ID
    const newEvent = {
        id: `${dateKey}-${Date.now()}`,
        title: eventData.title,
        category: eventData.category,
        start: eventData.start,
        end: eventData.end,
        notes: eventData.notes || '',
        completed: false
    };
    
    // Add to events array
    schedule.events.push(newEvent);
    
    // Sort events by start time
    schedule.events.sort((a, b) => {
        return timeToMinutes(a.start) - timeToMinutes(b.start);
    });
    
    // Save changes
    saveSchedules(schedules);
    
    return newEvent;
}

/**
 * Toggles the completed status of an event.
 * 
 * @param {string} eventId - The event ID to toggle
 * @returns {boolean} The new completed status, or null if event not found
 */
function toggleEventComplete(eventId) {
    // Extract date key from event ID (format: YYYY-MM-DD-index)
    const dateKey = eventId.split('-').slice(0, 3).join('-');
    const schedule = schedules[dateKey];
    
    if (!schedule) return null;
    
    // Find the event
    const event = schedule.events.find(e => e.id === eventId);
    if (!event) return null;
    
    // Toggle completed status
    event.completed = !event.completed;
    
    // Save changes
    saveSchedules(schedules);
    
    return event.completed;
}

/**
 * Updates an existing event with new data.
 * 
 * @param {string} eventId - The event ID to update
 * @param {Object} eventData - New event data (title, category, start, end, notes)
 * @returns {Object|null} The updated event, or null if not found
 */
function updateEvent(eventId, eventData) {
    // Extract date key from event ID
    const dateKey = eventId.split('-').slice(0, 3).join('-');
    const schedule = schedules[dateKey];
    
    if (!schedule) return null;
    
    // Find the event
    const event = schedule.events.find(e => e.id === eventId);
    if (!event) return null;
    
    // Update fields
    event.title = eventData.title;
    event.category = eventData.category;
    event.start = eventData.start;
    event.end = eventData.end;
    event.notes = eventData.notes || '';
    
    // Re-sort events by start time
    schedule.events.sort((a, b) => {
        return timeToMinutes(a.start) - timeToMinutes(b.start);
    });
    
    // Save changes
    saveSchedules(schedules);
    
    return event;
}

/**
 * Deletes an event from a schedule.
 * 
 * @param {string} eventId - The event ID to delete
 * @returns {boolean} True if deleted, false if not found
 */
function deleteEvent(eventId) {
    // Extract date key from event ID
    const dateKey = eventId.split('-').slice(0, 3).join('-');
    const schedule = schedules[dateKey];
    
    if (!schedule) return false;
    
    // Find and remove the event
    const index = schedule.events.findIndex(e => e.id === eventId);
    if (index === -1) return false;
    
    schedule.events.splice(index, 1);
    
    // Save changes
    saveSchedules(schedules);
    
    return true;
}

/**
 * Resets a specific date's schedule back to template.
 * 
 * @param {Date} date - The date to reset
 */
function resetScheduleForDate(date) {
    const dateKey = getDateKey(date);
    
    // Remove existing schedule
    delete schedules[dateKey];
    
    // Save (this removes it from storage)
    saveSchedules(schedules);
    
    // Getting the schedule will recreate it from template
    return getScheduleForDate(date);
}

/**
 * Finds the currently active event based on current time.
 * 
 * @param {Date} date - The date to check
 * @returns {Object|null} The current event, or null if none active
 */
function getCurrentEvent(date) {
    const schedule = getScheduleForDate(date);
    const currentMinutes = getCurrentTimeMinutes();
    
    return schedule.events.find(event => {
        const startMinutes = timeToMinutes(event.start);
        const endMinutes = timeToMinutes(event.end);
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }) || null;
}

/**
 * Finds the next upcoming event.
 * 
 * @param {Date} date - The date to check
 * @returns {Object|null} The next event, or null if none upcoming
 */
function getNextEvent(date) {
    const schedule = getScheduleForDate(date);
    const currentMinutes = getCurrentTimeMinutes();
    
    return schedule.events.find(event => {
        const startMinutes = timeToMinutes(event.start);
        return startMinutes > currentMinutes;
    }) || null;
}

/**
 * Calculates time statistics for a schedule.
 * 
 * @param {Object} schedule - Schedule object
 * @returns {Object} Object with study, jobHunting, portfolio minutes
 */
function calculateStats(schedule) {
    const stats = {
        study: 0,
        jobHunting: 0,
        portfolio: 0
    };
    
    schedule.events.forEach(event => {
        const duration = timeToMinutes(event.end) - timeToMinutes(event.start);
        
        if (event.category === 'study') {
            stats.study += duration;
        } else if (event.category === 'jobHunting') {
            stats.jobHunting += duration;
        } else if (event.category === 'portfolio') {
            stats.portfolio += duration;
        }
    });
    
    return stats;
}

// =============================================
// TIME UTILITY FUNCTIONS
// =============================================

/**
 * Converts a time string to minutes since midnight.
 * 
 * @param {string} timeString - Time in HH:MM format
 * @returns {number} Minutes since midnight
 * 
 * Example: "14:30" → 870 (14 * 60 + 30)
 */
function timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Gets current time as minutes since midnight.
 * 
 * @returns {number} Current minutes since midnight
 */
function getCurrentTimeMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
}

/**
 * Formats a time string for display (12-hour format).
 * 
 * @param {string} timeString - Time in HH:MM format
 * @returns {string} Formatted time (e.g., "2:30 PM")
 */
function formatTime(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Formats a time string without AM/PM (shorter format).
 * 
 * @param {string} timeString - Time in HH:MM format
 * @returns {string} Formatted time (e.g., "2:30")
 */
function formatTimeShort(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Calculates duration between two time strings.
 * 
 * @param {string} startTime - Start time in HH:MM format
 * @param {string} endTime - End time in HH:MM format
 * @returns {string} Formatted duration (e.g., "1h 30m")
 */
function calculateDuration(startTime, endTime) {
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    const duration = endMinutes - startMinutes;
    
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    
    if (hours > 0 && minutes > 0) {
        return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h`;
    } else {
        return `${minutes}m`;
    }
}

/**
 * Formats minutes as hours and minutes string.
 * 
 * @param {number} totalMinutes - Total minutes
 * @returns {string} Formatted string (e.g., "2h 30m")
 */
function formatMinutesAsTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0 && minutes > 0) {
        return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h`;
    } else {
        return `${minutes}m`;
    }
}

/**
 * Formats a Date object for display.
 * 
 * @param {Date} date - Date to format
 * @returns {string} Formatted date (e.g., "Thursday, 2 January")
 */
function formatDate(date) {
    return date.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });
}
