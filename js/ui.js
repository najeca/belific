/**
 * =============================================
 * UI.JS - User Interface Rendering
 * =============================================
 */

let selectedDate = new Date();
let calendarMonth = new Date();
let selectedCategory = 'personal';
let editingEventId = null;

// =============================================
// TODAY PAGE
// =============================================

function renderTodayPage() {
    const today = new Date();
    const schedule = getScheduleForDate(today);
    
    renderTodayHeader(today, schedule);
    renderCurrentActivity(today);
    renderNextActivity(today);
    renderTodayStats(schedule);
    renderScheduleList(schedule, today);
}

function renderTodayHeader(date, schedule) {
    document.getElementById('todayDate').textContent = formatDate(date);
    const dayTypeInfo = getDayTypeInfo(schedule.dayType);
    document.getElementById('dayTypeDot').style.backgroundColor = dayTypeInfo.color;
    document.getElementById('dayTypeText').textContent = dayTypeInfo.name;
}

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
    
    const iconEl = document.getElementById('currentActivityIcon');
    iconEl.textContent = category.icon;
    iconEl.style.backgroundColor = category.color + '22';
    
    document.getElementById('currentActivityTitle').textContent = currentEvent.title;
    document.getElementById('currentActivityTime').textContent = 
        `${formatTimeShort(currentEvent.start)} - ${formatTimeShort(currentEvent.end)}`;
    document.getElementById('currentTimeRemaining').textContent = `${remainingMinutes}m remaining`;
    
    const checkBtn = document.getElementById('currentCheckBtn');
    checkBtn.dataset.eventId = currentEvent.id;
    checkBtn.className = 'check-button' + (currentEvent.completed ? ' checked' : '');
    
    card.style.borderLeftColor = category.color;
}

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
    
    const iconEl = document.getElementById('nextActivityIcon');
    iconEl.textContent = category.icon;
    iconEl.style.backgroundColor = category.color + '22';
    
    document.getElementById('nextActivityTitle').textContent = nextEvent.title;
    const hours = Math.floor(minutesUntil / 60);
    const mins = minutesUntil % 60;
    document.getElementById('nextActivityStartsIn').textContent = 
        hours > 0 ? `Starts in ${hours}h ${mins}m` : `Starts in ${mins}m`;
}

function renderTodayStats(schedule) {
    const stats = calculateStats(schedule);
    document.getElementById('statStudy').textContent = formatMinutesAsTime(stats.study);
    document.getElementById('statJobs').textContent = formatMinutesAsTime(stats.jobHunting);
    document.getElementById('statPortfolio').textContent = formatMinutesAsTime(stats.portfolio);
}

function renderScheduleList(schedule, date) {
    const container = document.getElementById('scheduleList');
    const currentMinutes = getCurrentTimeMinutes();
    const isToday = date.toDateString() === new Date().toDateString();
    
    if (schedule.events.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No events scheduled. Tap + to add one.</p>';
        return;
    }
    
    container.innerHTML = schedule.events.map(event => {
        const category = CATEGORIES[event.category] || CATEGORIES.personal;
        const startMinutes = timeToMinutes(event.start);
        const endMinutes = timeToMinutes(event.end);
        
        let stateClass = '';
        if (isToday) {
            if (currentMinutes >= startMinutes && currentMinutes < endMinutes) stateClass = 'current';
            else if (endMinutes < currentMinutes) stateClass = 'past';
        }
        if (event.completed) stateClass += ' completed';
        
        const hasNotes = event.notes && event.notes.trim().length > 0;
        const notesIndicator = hasNotes ? '<span class="notes-indicator">📝</span>' : '';
        
        return `
            <div class="schedule-item ${stateClass}" onclick="openEditModal('${event.id}')">
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
// CALENDAR PAGE
// =============================================

function renderCalendarPage() {
    renderCalendarHeader();
    renderCalendarGrid();
    renderSelectedDaySchedule();
}

function renderCalendarHeader() {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('calendarMonthTitle').textContent = 
        `${months[calendarMonth.getMonth()]} ${calendarMonth.getFullYear()}`;
}

function renderCalendarGrid() {
    const container = document.getElementById('calendarGrid');
    const today = new Date();
    
    const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const lastDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    
    let html = '';
    
    // Previous month days
    const prevMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 0);
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
        html += `<button class="calendar-day other-month" disabled>${prevMonth.getDate() - i}</button>`;
    }
    
    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
        const dateKey = getDateKey(date);
        const isToday = date.toDateString() === today.toDateString();
        const isSelected = date.toDateString() === selectedDate.toDateString();
        
        // Check for pre-populated or saved schedule
        const hasSchedule = SPECIFIC_SCHEDULES[dateKey] || schedules[dateKey];
        let dotColor = '#8B8B8B';
        if (hasSchedule) {
            const dayType = hasSchedule.dayType || 'nonWorkDay';
            dotColor = DAY_TYPES[dayType]?.color || '#8B8B8B';
        }
        
        let className = 'calendar-day';
        if (isToday) className += ' today';
        if (isSelected) className += ' selected';
        
        html += `
            <button class="${className}" onclick="selectCalendarDate(${date.getTime()})">
                ${day}
                <div class="calendar-day-dot" style="background-color: ${dotColor}"></div>
            </button>
        `;
    }
    
    // Next month days
    const totalCells = startDayOfWeek + daysInMonth;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remainingCells; day++) {
        html += `<button class="calendar-day other-month" disabled>${day}</button>`;
    }
    
    container.innerHTML = html;
}

function renderSelectedDaySchedule() {
    const schedule = getScheduleForDate(selectedDate);
    const isToday = selectedDate.toDateString() === new Date().toDateString();
    
    document.getElementById('selectedDayTitle').textContent = 
        isToday ? 'TODAY' : formatDate(selectedDate).toUpperCase();
    
    const container = document.getElementById('selectedDaySchedule');
    const currentMinutes = getCurrentTimeMinutes();
    
    if (schedule.events.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 1rem;">No events</p>';
        return;
    }
    
    container.innerHTML = schedule.events.map(event => {
        const category = CATEGORIES[event.category] || CATEGORIES.personal;
        const startMinutes = timeToMinutes(event.start);
        const endMinutes = timeToMinutes(event.end);
        
        let stateClass = '';
        if (isToday) {
            if (currentMinutes >= startMinutes && currentMinutes < endMinutes) stateClass = 'current';
            else if (endMinutes < currentMinutes) stateClass = 'past';
        }
        if (event.completed) stateClass += ' completed';
        
        return `
            <div class="schedule-item ${stateClass}" onclick="openEditModal('${event.id}')">
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

function selectCalendarDate(timestamp) {
    selectedDate = new Date(timestamp);
    renderCalendarGrid();
    renderSelectedDaySchedule();
}

function navigateMonth(direction) {
    calendarMonth.setMonth(calendarMonth.getMonth() + direction);
    renderCalendarPage();
}

// =============================================
// ADD EVENT MODAL
// =============================================

function openAddEventModal() {
    document.getElementById('eventTitleInput').value = '';
    document.getElementById('eventNotesInput').value = '';
    selectedCategory = 'personal';
    
    const now = new Date();
    const minutes = Math.ceil(now.getMinutes() / 30) * 30;
    now.setMinutes(minutes);
    
    document.getElementById('eventStartInput').value = 
        `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    now.setHours(now.getHours() + 1);
    document.getElementById('eventEndInput').value = 
        `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    renderCategoryGrid();
    updateDurationDisplay();
    document.getElementById('addEventModal').classList.add('active');
}

function closeAddEventModal() {
    document.getElementById('addEventModal').classList.remove('active');
}

function renderCategoryGrid() {
    const container = document.getElementById('categoryGrid');
    container.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => {
        const isSelected = selectedCategory === key;
        return `
            <button class="category-btn ${isSelected ? 'selected' : ''}" 
                    style="${isSelected ? `background-color: ${cat.color}` : ''}"
                    onclick="selectCategory('${key}')">
                <span>${cat.icon}</span>
                <small>${cat.name}</small>
            </button>
        `;
    }).join('');
}

function selectCategory(categoryKey) {
    selectedCategory = categoryKey;
    renderCategoryGrid();
}

function quickAddEvent(title, category) {
    document.getElementById('eventTitleInput').value = title;
    selectedCategory = category;
    renderCategoryGrid();
}

function updateDurationDisplay() {
    const start = document.getElementById('eventStartInput').value;
    const end = document.getElementById('eventEndInput').value;
    document.getElementById('durationDisplay').textContent = 
        (start && end) ? `Duration: ${calculateDuration(start, end)}` : 'Duration: --';
}

function saveNewEvent() {
    const title = document.getElementById('eventTitleInput').value.trim();
    const start = document.getElementById('eventStartInput').value;
    const end = document.getElementById('eventEndInput').value;
    const notes = document.getElementById('eventNotesInput').value.trim();
    
    if (!title) { alert('Please enter an event title'); return; }
    if (!start || !end) { alert('Please set start and end times'); return; }
    if (timeToMinutes(start) >= timeToMinutes(end)) { alert('End time must be after start time'); return; }
    
    addEvent(selectedDate, { title, category: selectedCategory, start, end, notes });
    closeAddEventModal();
    refreshCurrentPage();
}

// =============================================
// EDIT EVENT MODAL
// =============================================

function openEditModal(eventId) {
    const dateKey = eventId.split('-').slice(0, 3).join('-');
    const schedule = schedules[dateKey];
    if (!schedule) return;
    
    const event = schedule.events.find(e => e.id === eventId);
    if (!event) return;
    
    editingEventId = eventId;
    
    document.getElementById('editEventTitleInput').value = event.title;
    document.getElementById('editEventStartInput').value = event.start;
    document.getElementById('editEventEndInput').value = event.end;
    document.getElementById('editEventNotesInput').value = event.notes || '';
    selectedCategory = event.category;
    
    renderEditCategoryGrid();
    updateEditDurationDisplay();
    document.getElementById('editEventModal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('editEventModal').classList.remove('active');
    editingEventId = null;
}

function renderEditCategoryGrid() {
    const container = document.getElementById('editCategoryGrid');
    container.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => {
        const isSelected = selectedCategory === key;
        return `
            <button class="category-btn ${isSelected ? 'selected' : ''}" 
                    style="${isSelected ? `background-color: ${cat.color}` : ''}"
                    onclick="selectEditCategory('${key}')">
                <span>${cat.icon}</span>
                <small>${cat.name}</small>
            </button>
        `;
    }).join('');
}

function selectEditCategory(categoryKey) {
    selectedCategory = categoryKey;
    renderEditCategoryGrid();
}

function updateEditDurationDisplay() {
    const start = document.getElementById('editEventStartInput').value;
    const end = document.getElementById('editEventEndInput').value;
    document.getElementById('editDurationDisplay').textContent = 
        (start && end) ? `Duration: ${calculateDuration(start, end)}` : 'Duration: --';
}

function saveEditedEvent() {
    if (!editingEventId) return;
    
    const title = document.getElementById('editEventTitleInput').value.trim();
    const start = document.getElementById('editEventStartInput').value;
    const end = document.getElementById('editEventEndInput').value;
    const notes = document.getElementById('editEventNotesInput').value.trim();
    
    if (!title) { alert('Please enter an event title'); return; }
    if (!start || !end) { alert('Please set start and end times'); return; }
    if (timeToMinutes(start) >= timeToMinutes(end)) { alert('End time must be after start time'); return; }
    
    updateEvent(editingEventId, { title, category: selectedCategory, start, end, notes });
    closeEditModal();
    refreshCurrentPage();
}

function deleteCurrentEvent() {
    if (!editingEventId) return;
    
    if (confirm('Delete this event?')) {
        deleteEvent(editingEventId);
        closeEditModal();
        refreshCurrentPage();
    }
}

// =============================================
// EVENT HANDLERS
// =============================================

function toggleEventFromUI(eventId) {
    toggleEventComplete(eventId);
    refreshCurrentPage();
}

function toggleCurrentEventComplete() {
    const checkBtn = document.getElementById('currentCheckBtn');
    const eventId = checkBtn.dataset.eventId;
    if (eventId) toggleEventFromUI(eventId);
}

function refreshCurrentPage() {
    if (document.getElementById('todayPage').classList.contains('active')) {
        renderTodayPage();
    } else if (document.getElementById('calendarPage').classList.contains('active')) {
        renderCalendarPage();
    }
}

function clearAllData() {
    if (confirm('Clear ALL app data? This cannot be undone.')) {
        clearAllStorage();
        schedules = {};
        location.reload();
    }
}
