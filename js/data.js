const APP_VERSION = '1.3.0';

const STORAGE_KEYS = {
    SCHEDULES: 'belific_schedules',
    POMODORO: 'belific_pomodoro',
    SETTINGS: 'belific_settings'
};

const CATEGORIES = {
    work:     { name: 'Work',        color: '#888780', icon: '💼' },
    routine:  { name: 'Routine',     color: '#B4B2A9', icon: '🔄' },
    hygiene:  { name: 'Hygiene',     color: '#7F77DD', icon: '🪥' },
    fitness:  { name: 'Fitness',     color: '#639922', icon: '🏃' },
    jobs:     { name: 'Jobs',        color: '#378ADD', icon: '🔍' },
    project:  { name: 'Project',     color: '#534AB7', icon: '💻' },
    cyber:    { name: 'Cyber',       color: '#1D9E75', icon: '🔐' },
    game:     { name: 'Game',        color: '#BA7517', icon: '🎮' },
    school:   { name: 'School run',  color: '#D85A30', icon: '🏫' },
    church:   { name: 'Church',      color: '#D4537E', icon: '⛪' },
    chore:    { name: 'Chore',       color: '#C47C2B', icon: '🧹' },
    winddown: { name: 'Wind down',   color: '#D3D1C7', icon: '🌙' },
    sleep:    { name: 'Sleep',       color: '#D3D1C7', icon: '😴' },
    free:     { name: 'Free',        color: '#B4B2A9', icon: '☕' },
};

const DAY_TYPES = {
    workDay:     { name: 'Work Day',  color: '#888780' },
    nonWorkDay:  { name: 'Off Work',  color: '#6B9B76' },
    examDay:     { name: 'Exam Day',  color: '#E74C3C' },
    birthdayDay: { name: 'Birthday',  color: '#FF69B4' }
};

// Weekly repeating schedule — keyed Mon–Sun.
// getScheduleForDate() in schedule.js falls back to this when no date override exists.
const WEEKLY_SCHEDULE = {
    Mon: {
        dayType: 'nonWorkDay',
        label: 'Monday — off work · Zone 2 run · laundry day · school run 3–4pm',
        events: [
            { title: 'Brush teeth — before eating', category: 'hygiene', start: '07:00', end: '07:03', notes: '' },
            { title: 'Start laundry machine — runs while you train', category: 'chore', start: '07:03', end: '07:10', notes: '' },
            { title: 'Overnight oats + peppermint tea + morning supplements', category: 'routine', start: '07:10', end: '07:30', notes: '' },
            { title: 'Job applications × 6', category: 'jobs', start: '07:30', end: '09:00', notes: '' },
            { title: 'Zone 2 run — 2 hours', category: 'fitness', start: '09:00', end: '11:00', notes: '' },
            { title: 'Move laundry to dryer', category: 'chore', start: '11:00', end: '11:10', notes: '' },
            { title: 'Shower & recovery', category: 'routine', start: '11:10', end: '11:30', notes: '' },
            { title: 'Project building — deep work', category: 'project', start: '11:30', end: '13:00', notes: '' },
            { title: 'Lunch + turmeric citrus ginger or moringa tea · rinse mouth after', category: 'free', start: '13:00', end: '14:00', notes: '' },
            { title: 'TryHackMe — Pre-Security path', category: 'cyber', start: '14:00', end: '15:00', notes: '' },
            { title: 'School run', category: 'school', start: '15:00', end: '16:00', notes: '' },
            { title: 'Fold & put away laundry', category: 'chore', start: '16:00', end: '16:30', notes: '' },
            { title: 'Project building', category: 'project', start: '16:30', end: '18:00', notes: '' },
            { title: 'Turmeric ginger tea · rinse mouth after', category: 'free', start: '17:30', end: '18:00', notes: '' },
            { title: 'Dinner & free time', category: 'free', start: '18:00', end: '19:00', notes: '' },
            { title: 'Umamusume', category: 'game', start: '19:00', end: '20:00', notes: '' },
            { title: 'Prep tomorrow — lay out clothes, pack gym bag, make overnight oats', category: 'routine', start: '20:00', end: '20:10', notes: '' },
            { title: 'Skincare — CeraVe', category: 'hygiene', start: '20:10', end: '20:15', notes: '' },
            { title: 'Stretching & mobility', category: 'fitness', start: '20:15', end: '20:30', notes: '' },
            { title: 'Dark chocolate (85%)', category: 'free', start: '20:30', end: '20:35', notes: '' },
            { title: 'Chamomile or turmeric ashwagandha tea · read / journal / pray · rinse mouth after', category: 'winddown', start: '20:35', end: '20:55', notes: '' },
            { title: 'Brush teeth', category: 'hygiene', start: '20:55', end: '21:00', notes: '' },
            { title: 'Sleep', category: 'sleep', start: '21:00', end: '23:59', notes: '' },
        ]
    },
    Tue: {
        dayType: 'workDay',
        label: 'Tuesday — work 6–10am · straight to gym · Push day · school run 3–4pm',
        events: [
            { title: 'Wake up · brush teeth — before eating', category: 'hygiene', start: '05:15', end: '05:18', notes: '' },
            { title: 'Overnight oats + peppermint tea + supplements · pack gym bag', category: 'routine', start: '05:18', end: '05:45', notes: '' },
            { title: 'Home Bargains shift · banana at 9:45am', category: 'work', start: '06:00', end: '10:00', notes: '' },
            { title: 'Drive to gym · creatine in 500ml bottle', category: 'routine', start: '10:00', end: '10:15', notes: '' },
            { title: 'Gym — Push day', category: 'fitness', start: '10:15', end: '12:15', notes: '' },
            { title: 'Drive home · shower', category: 'routine', start: '12:15', end: '13:00', notes: '' },
            { title: 'Lunch + job applications × 2', category: 'jobs', start: '13:00', end: '13:30', notes: '' },
            { title: 'Turmeric citrus ginger or moringa tea · rinse mouth after', category: 'free', start: '13:30', end: '14:00', notes: '' },
            { title: 'Project building or TryHackMe', category: 'project', start: '14:00', end: '15:00', notes: '' },
            { title: 'School run', category: 'school', start: '15:00', end: '16:00', notes: '' },
            { title: 'Project building', category: 'project', start: '16:00', end: '18:00', notes: '' },
            { title: 'Turmeric ginger tea · rinse mouth after', category: 'free', start: '17:30', end: '18:00', notes: '' },
            { title: 'Dinner · iron or fold laundry if needed', category: 'free', start: '18:00', end: '19:00', notes: '' },
            { title: 'Umamusume · iron/fold laundry alongside', category: 'game', start: '19:00', end: '20:00', notes: '' },
            { title: 'Prep tomorrow — lay out clothes, pack gym bag, make overnight oats', category: 'routine', start: '20:00', end: '20:10', notes: '' },
            { title: 'Skincare — CeraVe', category: 'hygiene', start: '20:10', end: '20:15', notes: '' },
            { title: 'Stretching & mobility', category: 'fitness', start: '20:15', end: '20:30', notes: '' },
            { title: 'Dark chocolate (85%)', category: 'free', start: '20:30', end: '20:35', notes: '' },
            { title: 'Chamomile or turmeric ashwagandha tea · read / journal / pray · rinse mouth after', category: 'winddown', start: '20:35', end: '20:55', notes: '' },
            { title: 'Brush teeth', category: 'hygiene', start: '20:55', end: '21:00', notes: '' },
            { title: 'Sleep', category: 'sleep', start: '21:00', end: '23:59', notes: '' },
        ]
    },
    Wed: {
        dayType: 'nonWorkDay',
        label: 'Wednesday — off work · Tempo run · room clean · school run 3–4pm · cyber focus',
        events: [
            { title: 'Brush teeth — before eating', category: 'hygiene', start: '07:00', end: '07:03', notes: '' },
            { title: 'Start laundry if needed', category: 'chore', start: '07:03', end: '07:10', notes: '' },
            { title: 'Overnight oats + peppermint tea + morning supplements', category: 'routine', start: '07:10', end: '07:30', notes: '' },
            { title: 'Job applications × 6', category: 'jobs', start: '07:30', end: '09:00', notes: '' },
            { title: 'Tempo run — 2 hours', category: 'fitness', start: '09:00', end: '11:00', notes: '' },
            { title: 'Shower & recovery · move laundry if running', category: 'routine', start: '11:00', end: '11:30', notes: '' },
            { title: 'TryHackMe — dedicated cyber block', category: 'cyber', start: '11:30', end: '13:00', notes: '' },
            { title: 'Lunch + turmeric citrus ginger or moringa tea · rinse mouth after', category: 'free', start: '13:00', end: '14:00', notes: '' },
            { title: 'Project building', category: 'project', start: '14:00', end: '15:00', notes: '' },
            { title: 'School run', category: 'school', start: '15:00', end: '16:00', notes: '' },
            { title: 'Clean room — hoover, surfaces, tidy', category: 'chore', start: '16:00', end: '16:45', notes: '' },
            { title: 'Project building', category: 'project', start: '16:45', end: '18:00', notes: '' },
            { title: 'Turmeric ginger tea · rinse mouth after', category: 'free', start: '17:30', end: '18:00', notes: '' },
            { title: 'Dinner & free time', category: 'free', start: '18:00', end: '19:00', notes: '' },
            { title: 'Umamusume', category: 'game', start: '19:00', end: '20:00', notes: '' },
            { title: 'Prep tomorrow — lay out clothes, make overnight oats', category: 'routine', start: '20:00', end: '20:10', notes: '' },
            { title: 'Skincare — CeraVe · Nizoral on applicable nights', category: 'hygiene', start: '20:10', end: '20:15', notes: '' },
            { title: 'Stretching & mobility', category: 'fitness', start: '20:15', end: '20:30', notes: '' },
            { title: 'Dark chocolate (85%)', category: 'free', start: '20:30', end: '20:35', notes: '' },
            { title: 'Chamomile or turmeric ashwagandha tea · read / journal / pray · rinse mouth after', category: 'winddown', start: '20:35', end: '20:55', notes: '' },
            { title: 'Brush teeth', category: 'hygiene', start: '20:55', end: '21:00', notes: '' },
            { title: 'Sleep', category: 'sleep', start: '21:00', end: '23:59', notes: '' },
        ]
    },
    Thu: {
        dayType: 'workDay',
        label: 'Thursday — work 6–10am · straight to gym · Pull day · school run 3–4pm',
        events: [
            { title: 'Wake up · brush teeth — before eating', category: 'hygiene', start: '05:15', end: '05:18', notes: '' },
            { title: 'Overnight oats + peppermint tea + supplements · pack gym bag', category: 'routine', start: '05:18', end: '05:45', notes: '' },
            { title: 'Home Bargains shift · banana at 9:45am', category: 'work', start: '06:00', end: '10:00', notes: '' },
            { title: 'Drive to gym · creatine in 500ml bottle', category: 'routine', start: '10:00', end: '10:15', notes: '' },
            { title: 'Gym — Pull day', category: 'fitness', start: '10:15', end: '12:15', notes: '' },
            { title: 'Drive home · shower', category: 'routine', start: '12:15', end: '13:00', notes: '' },
            { title: 'Lunch + job applications × 2', category: 'jobs', start: '13:00', end: '13:30', notes: '' },
            { title: 'Turmeric citrus ginger or moringa tea · rinse mouth after', category: 'free', start: '13:30', end: '14:00', notes: '' },
            { title: 'Project building or TryHackMe', category: 'project', start: '14:00', end: '15:00', notes: '' },
            { title: 'School run', category: 'school', start: '15:00', end: '16:00', notes: '' },
            { title: 'Project building', category: 'project', start: '16:00', end: '18:00', notes: '' },
            { title: 'Turmeric ginger tea · rinse mouth after', category: 'free', start: '17:30', end: '18:00', notes: '' },
            { title: 'Dinner', category: 'free', start: '18:00', end: '19:00', notes: '' },
            { title: 'Umamusume', category: 'game', start: '19:00', end: '20:00', notes: '' },
            { title: 'Prep tomorrow — lay out clothes, make overnight oats', category: 'routine', start: '20:00', end: '20:10', notes: '' },
            { title: 'Skincare — CeraVe · Nizoral on applicable nights', category: 'hygiene', start: '20:10', end: '20:15', notes: '' },
            { title: 'Stretching & mobility', category: 'fitness', start: '20:15', end: '20:30', notes: '' },
            { title: 'Dark chocolate (85%)', category: 'free', start: '20:30', end: '20:35', notes: '' },
            { title: 'Chamomile or turmeric ashwagandha tea · read / journal / pray · rinse mouth after', category: 'winddown', start: '20:35', end: '20:55', notes: '' },
            { title: 'Brush teeth', category: 'hygiene', start: '20:55', end: '21:00', notes: '' },
            { title: 'Sleep', category: 'sleep', start: '21:00', end: '23:59', notes: '' },
        ]
    },
    Fri: {
        dayType: 'nonWorkDay',
        label: 'Friday — off work · Zone 2 run · room tidy + ironing · school run 3–4pm · weekly review',
        events: [
            { title: 'Brush teeth — before eating', category: 'hygiene', start: '07:00', end: '07:03', notes: '' },
            { title: 'Overnight oats + peppermint tea + morning supplements', category: 'routine', start: '07:03', end: '07:30', notes: '' },
            { title: 'Job applications × 6', category: 'jobs', start: '07:30', end: '09:00', notes: '' },
            { title: 'Zone 2 run — 2 hours', category: 'fitness', start: '09:00', end: '11:00', notes: '' },
            { title: 'Shower & recovery', category: 'routine', start: '11:00', end: '11:30', notes: '' },
            { title: 'Project building — deep work', category: 'project', start: '11:30', end: '13:00', notes: '' },
            { title: 'Lunch + turmeric citrus ginger or moringa tea · rinse mouth after', category: 'free', start: '13:00', end: '14:00', notes: '' },
            { title: 'TryHackMe — Pre-Security path', category: 'cyber', start: '14:00', end: '15:00', notes: '' },
            { title: 'School run', category: 'school', start: '15:00', end: '16:00', notes: '' },
            { title: 'Weekly review & plan next week', category: 'project', start: '16:00', end: '16:30', notes: '' },
            { title: 'Ironing — low-cognitive, clears the pile', category: 'chore', start: '16:30', end: '17:15', notes: '' },
            { title: 'Light project / admin', category: 'project', start: '17:15', end: '18:00', notes: '' },
            { title: 'Turmeric ginger tea · rinse mouth after', category: 'free', start: '17:30', end: '18:00', notes: '' },
            { title: 'Dinner & free time', category: 'free', start: '18:00', end: '19:00', notes: '' },
            { title: 'Umamusume', category: 'game', start: '19:00', end: '20:00', notes: '' },
            { title: 'Prep tomorrow — lay out clothes, make overnight oats', category: 'routine', start: '20:00', end: '20:10', notes: '' },
            { title: 'Skincare — CeraVe · Nizoral on applicable nights', category: 'hygiene', start: '20:10', end: '20:15', notes: '' },
            { title: 'Stretching & mobility', category: 'fitness', start: '20:15', end: '20:30', notes: '' },
            { title: 'Dark chocolate (85%)', category: 'free', start: '20:30', end: '20:35', notes: '' },
            { title: 'Chamomile or turmeric ashwagandha tea · read / journal / pray · rinse mouth after', category: 'winddown', start: '20:35', end: '20:55', notes: '' },
            { title: 'Brush teeth', category: 'hygiene', start: '20:55', end: '21:00', notes: '' },
            { title: 'Sleep', category: 'sleep', start: '21:00', end: '23:59', notes: '' },
        ]
    },
    Sat: {
        dayType: 'workDay',
        label: 'Saturday — work 6–10am · straight to gym · Legs day · car clean · no school run',
        events: [
            { title: 'Wake up · brush teeth — before eating', category: 'hygiene', start: '05:15', end: '05:18', notes: '' },
            { title: 'Overnight oats + peppermint tea + supplements · pack gym bag', category: 'routine', start: '05:18', end: '05:45', notes: '' },
            { title: 'Home Bargains shift · banana at 9:45am', category: 'work', start: '06:00', end: '10:00', notes: '' },
            { title: 'Drive to gym · creatine in 500ml bottle', category: 'routine', start: '10:00', end: '10:15', notes: '' },
            { title: 'Gym — Legs day', category: 'fitness', start: '10:15', end: '12:15', notes: '' },
            { title: 'Drive home · shower', category: 'routine', start: '12:15', end: '13:00', notes: '' },
            { title: 'Lunch + job applications × 2', category: 'jobs', start: '13:00', end: '13:30', notes: '' },
            { title: 'Turmeric citrus ginger or moringa tea · rinse mouth after', category: 'free', start: '13:30', end: '14:00', notes: '' },
            { title: 'Project building', category: 'project', start: '14:00', end: '16:00', notes: '' },
            { title: 'Clean inside of car — fortnightly task', category: 'chore', start: '16:00', end: '16:45', notes: '' },
            { title: 'Rest & free time', category: 'free', start: '16:45', end: '17:30', notes: '' },
            { title: 'Turmeric ginger tea · rinse mouth after', category: 'free', start: '17:00', end: '17:30', notes: '' },
            { title: 'Dinner', category: 'free', start: '17:30', end: '18:30', notes: '' },
            { title: 'Umamusume', category: 'game', start: '18:30', end: '19:30', notes: '' },
            { title: 'Prep tomorrow — lay out clothes, pack gym bag, make overnight oats', category: 'routine', start: '19:30', end: '19:40', notes: '' },
            { title: 'Skincare — CeraVe · Nizoral on applicable nights', category: 'hygiene', start: '19:40', end: '19:45', notes: '' },
            { title: 'Stretching & mobility — after legs day', category: 'fitness', start: '19:45', end: '20:00', notes: '' },
            { title: 'Dark chocolate (85%)', category: 'free', start: '20:00', end: '20:05', notes: '' },
            { title: 'Chamomile or turmeric ashwagandha tea · read / journal · rinse mouth after', category: 'winddown', start: '20:05', end: '20:25', notes: '' },
            { title: 'Brush teeth', category: 'hygiene', start: '20:25', end: '20:30', notes: '' },
            { title: 'Sleep (early — 5:15am wake Sunday)', category: 'sleep', start: '20:30', end: '23:59', notes: '' },
        ]
    },
    Sun: {
        dayType: 'workDay',
        label: 'Sunday — work 6–10am · Church · rest day · weekly planning',
        events: [
            { title: 'Wake up · brush teeth — before eating', category: 'hygiene', start: '05:15', end: '05:18', notes: '' },
            { title: 'Overnight oats + peppermint tea + supplements', category: 'routine', start: '05:18', end: '05:45', notes: '' },
            { title: 'Home Bargains shift', category: 'work', start: '06:00', end: '10:00', notes: '' },
            { title: 'Return home & prep for church', category: 'routine', start: '10:00', end: '11:00', notes: '' },
            { title: 'Church', category: 'church', start: '11:00', end: '13:00', notes: '' },
            { title: 'Lunch + turmeric citrus ginger tea · rinse mouth after', category: 'free', start: '13:00', end: '14:00', notes: '' },
            { title: 'Job applications × 2', category: 'jobs', start: '14:00', end: '15:00', notes: '' },
            { title: 'Rest & free time — unstructured recovery', category: 'free', start: '15:00', end: '17:00', notes: '' },
            { title: 'Weekly planning — prep for Monday', category: 'project', start: '17:00', end: '18:00', notes: '' },
            { title: 'Turmeric ginger tea · rinse mouth after', category: 'free', start: '17:30', end: '18:00', notes: '' },
            { title: 'Dinner', category: 'free', start: '18:00', end: '19:00', notes: '' },
            { title: 'Umamusume', category: 'game', start: '19:00', end: '20:00', notes: '' },
            { title: 'Prep tomorrow — lay out clothes, make overnight oats', category: 'routine', start: '20:00', end: '20:10', notes: '' },
            { title: 'Skincare — CeraVe · Nizoral on applicable nights', category: 'hygiene', start: '20:10', end: '20:15', notes: '' },
            { title: 'Stretching & mobility', category: 'fitness', start: '20:15', end: '20:30', notes: '' },
            { title: 'Dark chocolate (85%)', category: 'free', start: '20:30', end: '20:35', notes: '' },
            { title: 'Chamomile or turmeric ashwagandha tea · read / journal / pray · rinse mouth after', category: 'winddown', start: '20:35', end: '20:55', notes: '' },
            { title: 'Brush teeth', category: 'hygiene', start: '20:55', end: '21:00', notes: '' },
            { title: 'Sleep', category: 'sleep', start: '21:00', end: '23:59', notes: '' },
        ]
    }
};

// Date-specific overrides — add entries here for one-off days (holidays, exam days, etc.)
const SPECIFIC_SCHEDULES = {};

const DEFAULT_POMODORO = {
    focusDuration: 25,
    breakDuration: 5,
    longBreakDuration: 15,
    sessionsUntilLongBreak: 4
};

const NOTIFICATION_SETTINGS = {
    snoozeInterval: 10,
    maxSnoozes: 6
};
