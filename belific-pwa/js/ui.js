/**
 * =============================================
 * UI.JS - User Interface Rendering
 * =============================================
 * 
 * Handles all UI rendering and updates:
 * - Today page (schedule list, current activity, stats)
 * - Calendar page (month grid, selected day)
 * - Add event modal
 * 
 * Each render function updates a specific part of the UI.
 * Call these when data changes to refresh the display.
 */

/**
 * Currently selected date in calendar.
 */
let selectedDate = new Date();

/**
 * Currently displayed month in calendar.
 */
let calendarMonth = new Date();

/**
 * Currently selected category in add event modal.
 */
let selectedCategory = 'personal';

// =============================================
// TODAY PAGE RENDERING
// =============================================

/**
 * Renders the entire Today page.
 * Call this when navigating to Today or when data changes.
 */
function renderTodayPage() {
    const today = new Date();
    const schedule = getScheduleForDate(today);
    
    // Render header (date and day type)
    renderTodayHeader(today, schedule);
    
    // Render current activity
    renderCurrentActivity(today);
    
    // Render next up
    renderNextActivity(today);
    
    // Render stats
    renderTodayStats(schedule);
    
    // Render full schedule
    renderScheduleList(schedule, today);
}

/**
 * Renders the Today page header with date and day type.
 * 
 * @param {Date} date - The date to display
 * @param {Object} schedule - The schedule object
 */
function renderTodayHeader(date, schedule) {
    // Update date display
    document.getElementById('todayDate').textContent = formatDate(date);
    
    // Update day type badge
    const dayTypeInfo = getDayTypeInfo(schedule.dayType);
    document.getElementById('dayTypeDot').style.backgroundColor = dayTypeInfo.color;
    document.getElementById('dayTypeText').textContent = dayTypeInfo.name;
}

/**
 * Renders the current activity card.
 * Shows the event that's happening right now, if any.
 * 
 * @param {Date} date - The date to check
 */
function renderCurrentActivity(date) {
    const currentEvent = getCurrentEvent(date);
    const card = document.getElementById('currentActivityCard');
    
    if (!currentEvent) {
        card.style.display = 'none';
        return;
    }
    
    card.style.display = 'block';
    
    const category = CATEGORIES[currentEvent.category] || CATEGORIES.personal;
    const currentMinutes = getCurrentTimeMinutes();
    const endMinutes = timeToMinutes(currentEvent.end);
    const remainingMinutes = endMinutes - currentMinutes;
    
    // Update icon
    const iconEl = document.getElementById('currentActivityIcon');
    iconEl.textContent = category.icon;
    iconEl.style.backgroundColor = category.color + '22'; // 22 = 13% opacity in hex
    
    // Update content
    document.getElementById('currentActivityTitle').textContent = currentEvent.title;
    document.getElementById('currentActivityTime').textContent = 
        `${formatTimeShort(currentEvent.start)} - ${formatTimeShort(currentEvent.end)}`;
    document.getElementById('currentTimeRemaining').textContent = 
        `${remainingMinutes}m remaining`;
    
    // Update check button
    const checkBtn = document.getElementById('currentCheckBtn');
    checkBtn.dataset.eventId = currentEvent.id;
    if (currentEvent.completed) {
        checkBtn.classList.add('checked');
    } else {
        checkBtn.classList.remove('checked');
    }
    
    // Update card accent color
    card.style.borderLeftColor = category.color;
}

/**
 * Renders the "next up" activity card.
 * Shows the next scheduled event.
 * 
 * @param {Date} date - The date to check
 */
function renderNextActivity(date) {
    const nextEvent = getNextEvent(date);
    const card = document.getElementById('nextUpCard');
    
    if (!nextEvent) {
        card.style.display = 'none';
        return;
    }
    
    card.style.display = 'block';
    
    const category = CATEGORIES[nextEvent.category] || CATEGORIES.personal;
    const currentMinutes = getCurrentTimeMinutes();
    const startMinutes = timeToMinutes(nextEvent.start);
    const minutesUntil = startMinutes - currentMinutes;
    
    // Update icon
    const iconEl = document.getElementById('nextActivityIcon');
    iconEl.textContent = category.icon;
    iconEl.style.backgroundColor = category.color + '22';
    
    // Update content
    document.getElementById('nextActivityTitle').textContent = nextEvent.title;
    
    // Format time until
    const hours = Math.floor(minutesUntil / 60);
    const mins = minutesUntil % 60;
    const timeUntilText = hours > 0 
        ? `Starts in ${hours}h ${mins}m` 
        : `Starts in ${mins}m`;
    document.getElementById('nextActivityStartsIn').textContent = timeUntilText;
}

/**
 * Renders the daily statistics.
 * 
 * @param {Object} schedule - The schedule object
 */
function renderTodayStats(schedule) {
    const stats = calculateStats(schedule);
    
    document.getElementById('statStudy').textContent = formatMinutesAsTime(stats.study);
    document.getElementById('statJobs').textContent = formatMinutesAsTime(stats.jobHunting);
    document.getElementById('statPortfolio').textContent = formatMinutesAsTime(stats.portfolio);
}

/**
 * Renders the full schedule list.
 * 
 * @param {Object} schedule - The schedule object
 * @param {Date} date - The date (to determine current event)
 */
function renderScheduleList(schedule, date) {
    const container = document.getElementById('scheduleList');
    const currentMinutes = getCurrentTimeMinutes();
    const isToday = date.toDateString() === new Date().toDateString();
    
    container.innerHTML = schedule.events.map(event => {
        const category = CATEGORIES[event.category] || CATEGORIES.personal;
        const startMinutes = timeToMinutes(event.start);
        const endMinutes = timeToMinutes(event.end);
        
        // Determine event state
        let stateClass = '';
        if (isToday) {
            if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
                stateClass = 'current';
            } else if (endMinutes < currentMinutes) {
                stateClass = 'past';
            }
        }
        if (event.completed) {
            stateClass += ' completed';
        }
        
        // Check if event has notes
        const hasNotes = event.notes && event.notes.trim().length > 0;
        const notesIndicator = hasNotes ? '<span class="notes-indicator" title="Has notes">📝</span>' : '';
        
        return `
            <div class="schedule-item ${stateClass}" onclick="handleEventClick('${event.id}')">
                <div class="schedule-time">
                    <div class="schedule-time-start">${formatTimeShort(event.start)}</div>
                    <div class="schedule-time-end">${formatTimeShort(event.end)}</div>
                </div>
                <div class="schedule-bar" style="background-color: ${category.color}"></div>
                <div class="schedule-content">
                    <span class="schedule-icon">${category.icon}</span>
                    <div class="schedule-info">
                        <div class="schedule-title">${event.title} ${notesIndicator}</div>
                        <div class="schedule-duration">${calculateDuration(event.start, event.end)}</div>
                    </div>
                </div>
                <button class="check-button ${event.completed ? 'checked' : ''}" 
                        onclick="event.stopPropagation(); toggleEventFromUI('${event.id}')">
                    <span class="check-icon">✓</span>
                </button>
            </div>
        `;
    }).join('');
}

// =============================================
// CALENDAR PAGE RENDERING
// =============================================

/**
 * Renders the calendar page.
 */
function renderCalendarPage() {
    renderCalendarHeader();
    renderCalendarGrid();
    renderSelectedDaySchedule();
}

/**
 * Renders the calendar month/year header.
 */
function renderCalendarHeader() {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    
    const monthName = months[calendarMonth.getMonth()];
    const year = calendarMonth.getFullYear();
    
    document.getElementById('calendarMonthTitle').textContent = `${monthName} ${year}`;
}

/**
 * Renders the calendar grid with all days of the month.
 */
function renderCalendarGrid() {
    const container = document.getElementById('calendarGrid');
    const today = new Date();
    
    // Get first and last day of month
    const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const lastDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    
    // Get starting day of week (0 = Sunday)
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    
    let html = '';
    
    // Previous month days (empty placeholders or actual days)
    const prevMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 0);
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
        const day = prevMonth.getDate() - i;
        html += `<button class="calendar-day other-month" disabled>${day}</button>`;
    }
    
    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
        const isToday = date.toDateString() === today.toDateString();
        const isSelected = date.toDateString() === selectedDate.toDateString();
        const dayType = getDayType(date);
        const dayTypeInfo = getDayTypeInfo(dayType);
        
        let className = 'calendar-day';
        if (isToday) className += ' today';
        if (isSelected) className += ' selected';
        
        html += `
            <button class="${className}" onclick="selectCalendarDate(${date.getTime()})">
                ${day}
                <div class="calendar-day-dot" style="background-color: ${dayTypeInfo.color}"></div>
            </button>
        `;
    }
    
    // Next month days (fill remaining grid)
    const totalCells = startDayOfWeek + daysInMonth;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remainingCells; day++) {
        html += `<button class="calendar-day other-month" disabled>${day}</button>`;
    }
    
    container.innerHTML = html;
}

/**
 * Renders the selected day's schedule in the calendar view.
 */
function renderSelectedDaySchedule() {
    const schedule = getScheduleForDate(selectedDate);
    const isToday = selectedDate.toDateString() === new Date().toDateString();
    
    // Update title
    const title = isToday ? 'TODAY' : formatDate(selectedDate).toUpperCase();
    document.getElementById('selectedDayTitle').textContent = title;
    
    // Render schedule list (reuse the function but target different container)
    const container = document.getElementById('selectedDaySchedule');
    const currentMinutes = getCurrentTimeMinutes();
    
    container.innerHTML = schedule.events.map(event => {
        const category = CATEGORIES[event.category] || CATEGORIES.personal;
        const startMinutes = timeToMinutes(event.start);
        const endMinutes = timeToMinutes(event.end);
        
        let stateClass = '';
        if (isToday) {
            if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
                stateClass = 'current';
            } else if (endMinutes < currentMinutes) {
                stateClass = 'past';
            }
        }
        if (event.completed) stateClass += ' completed';
        
        return `
            <div class="schedule-item ${stateClass}" onclick="toggleEventFromUI('${event.id}')">
                <div class="schedule-time">
                    <div class="schedule-time-start">${formatTimeShort(event.start)}</div>
                    <div class="schedule-time-end">${formatTimeShort(event.end)}</div>
                </div>
                <div class="schedule-bar" style="background-color: ${category.color}"></div>
                <div class="schedule-content">
                    <span class="schedule-icon">${category.icon}</span>
                    <div class="schedule-info">
                        <div class="schedule-title">${event.title}</div>
                        <div class="schedule-duration">${calculateDuration(event.start, event.end)}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Selects a date in the calendar.
 * 
 * @param {number} timestamp - Date timestamp
 */
function selectCalendarDate(timestamp) {
    selectedDate = new Date(timestamp);
    renderCalendarGrid();
    renderSelectedDaySchedule();
}

/**
 * Navigates to previous/next month.
 * 
 * @param {number} direction - -1 for previous, 1 for next
 */
function navigateMonth(direction) {
    calendarMonth.setMonth(calendarMonth.getMonth() + direction);
    renderCalendarPage();
}

// =============================================
// ADD EVENT MODAL
// =============================================

/**
 * Opens the add event modal.
 */
function openAddEventModal() {
    // Reset form
    document.getElementById('eventTitleInput').value = '';
    document.getElementById('eventNotesInput').value = '';
    selectedCategory = 'personal';
    
    // Set default times (current time rounded to nearest 30 min)
    const now = new Date();
    const minutes = Math.ceil(now.getMinutes() / 30) * 30;
    now.setMinutes(minutes);
    
    const startTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    now.setHours(now.getHours() + 1);
    const endTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    document.getElementById('eventStartInput').value = startTime;
    document.getElementById('eventEndInput').value = endTime;
    
    // Render category grid
    renderCategoryGrid();
    updateDurationDisplay();
    
    // Show modal
    document.getElementById('addEventModal').classList.add('active');
}

/**
 * Closes the add event modal.
 */
function closeAddEventModal() {
    document.getElementById('addEventModal').classList.remove('active');
}

/**
 * Renders the category selection grid.
 */
function renderCategoryGrid() {
    const container = document.getElementById('categoryGrid');
    
    container.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => {
        const isSelected = selectedCategory === key;
        const style = isSelected ? `background-color: ${cat.color}` : '';
        
        return `
            <button class="category-btn ${isSelected ? 'selected' : ''}" 
                    style="${style}"
                    onclick="selectCategory('${key}')">
                <span>${cat.icon}</span>
                <small>${cat.name}</small>
            </button>
        `;
    }).join('');
}

/**
 * Selects a category in the add event modal.
 * 
 * @param {string} categoryKey - The category key to select
 */
function selectCategory(categoryKey) {
    selectedCategory = categoryKey;
    renderCategoryGrid();
}

/**
 * Handles quick add button click.
 * Pre-fills the form with common event types.
 * 
 * @param {string} title - Event title
 * @param {string} category - Category key
 */
function quickAddEvent(title, category) {
    document.getElementById('eventTitleInput').value = title;
    selectedCategory = category;
    renderCategoryGrid();
}

/**
 * Updates the duration display in the add event modal.
 */
function updateDurationDisplay() {
    const start = document.getElementById('eventStartInput').value;
    const end = document.getElementById('eventEndInput').value;
    
    if (start && end) {
        const duration = calculateDuration(start, end);
        document.getElementById('durationDisplay').textContent = `Duration: ${duration}`;
    } else {
        document.getElementById('durationDisplay').textContent = 'Duration: --';
    }
}

/**
 * Saves a new event from the modal.
 */
function saveNewEvent() {
    const title = document.getElementById('eventTitleInput').value.trim();
    const start = document.getElementById('eventStartInput').value;
    const end = document.getElementById('eventEndInput').value;
    const notes = document.getElementById('eventNotesInput').value.trim();
    
    // Validate
    if (!title) {
        alert('Please enter an event title');
        return;
    }
    if (!start || !end) {
        alert('Please set start and end times');
        return;
    }
    if (timeToMinutes(start) >= timeToMinutes(end)) {
        alert('End time must be after start time');
        return;
    }
    
    // Add event
    const newEvent = addEvent(selectedDate, {
        title,
        category: selectedCategory,
        start,
        end,
        notes
    });
    
    // Schedule notification for the new event
    scheduleEventNotification(newEvent, selectedDate);
    
    // Close modal and refresh
    closeAddEventModal();
    
    // Refresh current page
    if (document.getElementById('todayPage').classList.contains('active')) {
        renderTodayPage();
    } else if (document.getElementById('calendarPage').classList.contains('active')) {
        renderCalendarPage();
    }
}

// =============================================
// EVENT HANDLERS
// =============================================

/**
 * Currently editing event ID.
 */
let editingEventId = null;

/**
 * Handles clicking on an event in the schedule list.
 * Opens the edit modal for that event.
 * 
 * @param {string} eventId - The event ID
 */
function handleEventClick(eventId) {
    openEditEventModal(eventId);
}

/**
 * Opens the edit event modal for a specific event.
 * 
 * @param {string} eventId - The event ID to edit
 */
function openEditEventModal(eventId) {
    // Find the event
    const dateKey = eventId.split('-').slice(0, 3).join('-');
    const schedule = schedules[dateKey];
    if (!schedule) return;
    
    const event = schedule.events.find(e => e.id === eventId);
    if (!event) return;
    
    // Store the event ID we're editing
    editingEventId = eventId;
    
    // Populate form fields
    document.getElementById('editEventTitleInput').value = event.title;
    document.getElementById('editEventStartInput').value = event.start;
    document.getElementById('editEventEndInput').value = event.end;
    document.getElementById('editEventNotesInput').value = event.notes || '';
    selectedCategory = event.category;
    
    // Render category grid
    renderEditCategoryGrid();
    updateEditDurationDisplay();
    
    // Show modal
    document.getElementById('editEventModal').classList.add('active');
}

/**
 * Closes the edit event modal.
 */
function closeEditEventModal() {
    document.getElementById('editEventModal').classList.remove('active');
    editingEventId = null;
}

/**
 * Renders the category selection grid for edit modal.
 */
function renderEditCategoryGrid() {
    const container = document.getElementById('editCategoryGrid');
    
    container.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => {
        const isSelected = selectedCategory === key;
        const style = isSelected ? `background-color: ${cat.color}` : '';
        
        return `
            <button class="category-btn ${isSelected ? 'selected' : ''}" 
                    style="${style}"
                    onclick="selectCategoryForEdit('${key}')">
                <span>${cat.icon}</span>
                <small>${cat.name}</small>
            </button>
        `;
    }).join('');
}

/**
 * Selects a category in the edit event modal.
 * 
 * @param {string} categoryKey - The category key to select
 */
function selectCategoryForEdit(categoryKey) {
    selectedCategory = categoryKey;
    renderEditCategoryGrid();
}

/**
 * Updates the duration display in the edit event modal.
 */
function updateEditDurationDisplay() {
    const start = document.getElementById('editEventStartInput').value;
    const end = document.getElementById('editEventEndInput').value;
    
    if (start && end) {
        const duration = calculateDuration(start, end);
        document.getElementById('editDurationDisplay').textContent = `Duration: ${duration}`;
    } else {
        document.getElementById('editDurationDisplay').textContent = 'Duration: --';
    }
}

/**
 * Saves the edited event.
 */
function saveEditedEvent() {
    if (!editingEventId) return;
    
    const title = document.getElementById('editEventTitleInput').value.trim();
    const start = document.getElementById('editEventStartInput').value;
    const end = document.getElementById('editEventEndInput').value;
    const notes = document.getElementById('editEventNotesInput').value.trim();
    
    // Validate
    if (!title) {
        alert('Please enter an event title');
        return;
    }
    if (!start || !end) {
        alert('Please set start and end times');
        return;
    }
    if (timeToMinutes(start) >= timeToMinutes(end)) {
        alert('End time must be after start time');
        return;
    }
    
    // Update the event
    updateEvent(editingEventId, {
        title,
        category: selectedCategory,
        start,
        end,
        notes
    });
    
    // Close modal and refresh
    closeEditEventModal();
    
    // Refresh current page
    if (document.getElementById('todayPage').classList.contains('active')) {
        renderTodayPage();
    } else if (document.getElementById('calendarPage').classList.contains('active')) {
        renderCalendarPage();
    }
}

/**
 * Deletes the currently editing event.
 */
function deleteCurrentEvent() {
    if (!editingEventId) return;
    
    if (confirm('Delete this event?')) {
        deleteEvent(editingEventId);
        closeEditEventModal();
        
        // Refresh current page
        if (document.getElementById('todayPage').classList.contains('active')) {
            renderTodayPage();
        } else if (document.getElementById('calendarPage').classList.contains('active')) {
            renderCalendarPage();
        }
    }
}

/**
 * Toggles event completion from UI and refreshes display.
 * 
 * @param {string} eventId - The event ID to toggle
 */
function toggleEventFromUI(eventId) {
    toggleEventComplete(eventId);
    
    // Refresh appropriate page
    if (document.getElementById('todayPage').classList.contains('active')) {
        renderTodayPage();
    } else if (document.getElementById('calendarPage').classList.contains('active')) {
        renderSelectedDaySchedule();
    }
}

/**
 * Toggles the current event completion from Today page.
 */
function toggleCurrentEventComplete() {
    const checkBtn = document.getElementById('currentCheckBtn');
    const eventId = checkBtn.dataset.eventId;
    if (eventId) {
        toggleEventFromUI(eventId);
    }
}

/**
 * Refreshes today's schedule display.
 */
function refreshTodaySchedule() {
    renderTodayPage();
    scheduleAllTodayNotifications();
}

/**
 * Resets today's schedule to template.
 */
function resetTodaySchedule() {
    if (confirm('Reset today\'s schedule to the default template? Any changes will be lost.')) {
        resetScheduleForDate(new Date());
        renderTodayPage();
        scheduleAllTodayNotifications();
    }
}

/**
 * Clears all app data.
 */
function clearAllData() {
    if (confirm('Clear ALL app data? This cannot be undone.')) {
        clearAllStorage();
        schedules = {};
        location.reload();
    }
}
