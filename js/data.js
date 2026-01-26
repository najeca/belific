/**
 * =============================================
 * DATA.JS - Application Constants & Schedules
 * =============================================
 * 
 * Contains all configuration data for the Belific app.
 * Updated for Security+ exam prep: Jan 27 - Feb 9, 2026
 */

const APP_VERSION = '1.2.0';

const STORAGE_KEYS = {
    SCHEDULES: 'belific_schedules',
    POMODORO: 'belific_pomodoro',
    SETTINGS: 'belific_settings'
};

/**
 * EVENT CATEGORIES
 */
const CATEGORIES = {
    work: { name: 'Work', color: '#5B8CB8', icon: '💼' },
    exercise: { name: 'Exercise', color: '#6B9B76', icon: '🏃' },
    study: { name: 'Study', color: '#D4915D', icon: '📚' },
    jobHunting: { name: 'Job Hunting', color: '#8B7BB8', icon: '🔍' },
    portfolio: { name: 'Portfolio', color: '#C76B8F', icon: '💻' },
    meal: { name: 'Meal', color: '#C9A857', icon: '🍽️' },
    personal: { name: 'Personal', color: '#5BA3A3', icon: '✨' },
    rest: { name: 'Rest', color: '#7B82AA', icon: '😴' },
    routine: { name: 'Routine', color: '#8B8B8B', icon: '🔄' },
    exam: { name: 'Exam', color: '#E74C3C', icon: '📝' },
    birthday: { name: 'Birthday', color: '#FF69B4', icon: '🎂' }
};

/**
 * DAY TYPES
 */
const DAY_TYPES = {
    workDay: { name: 'Work Day', color: '#5B8CB8' },
    nonWorkDay: { name: 'Non-Work Day', color: '#6B9B76' },
    examDay: { name: 'Exam Day', color: '#E74C3C' },
    birthdayDay: { name: 'Birthday', color: '#FF69B4' }
};

/**
 * PRE-POPULATED SCHEDULES - Security+ Exam Prep
 */
const SPECIFIC_SCHEDULES = {
    // TUESDAY 27 JANUARY (WORK DAY)
    '2026-01-27': {
        dayType: 'workDay',
        events: [
            { title: 'Part-time job', category: 'work', start: '06:00', end: '10:00', notes: '' },
            { title: 'Commute, light snack, change', category: 'routine', start: '10:00', end: '11:00', notes: '' },
            { title: 'Gym/Running', category: 'exercise', start: '11:00', end: '12:30', notes: '' },
            { title: 'Shower, lunch', category: 'meal', start: '12:30', end: '13:30', notes: '' },
            { title: 'STUDY SESSION - Domain 1 start', category: 'study', start: '13:30', end: '15:00', notes: 'General Security Concepts' },
            { title: 'School run', category: 'routine', start: '15:00', end: '16:00', notes: '' },
            { title: 'STUDY SESSION - Domain 1 continue', category: 'study', start: '16:00', end: '18:00', notes: '' },
            { title: 'Dinner', category: 'meal', start: '18:00', end: '19:00', notes: '' },
            { title: 'STUDY SESSION - Domain 1 finish + flashcards', category: 'study', start: '19:00', end: '20:00', notes: '' },
            { title: 'Free time', category: 'personal', start: '20:00', end: '21:00', notes: '' },
            { title: 'Wind down, sleep prep', category: 'rest', start: '21:00', end: '22:00', notes: '' }
        ]
    },

    // WEDNESDAY 28 JANUARY (NON-WORK DAY)
    '2026-01-28': {
        dayType: 'nonWorkDay',
        events: [
            { title: 'Wake up, breakfast', category: 'routine', start: '07:00', end: '08:00', notes: '' },
            { title: 'STUDY SESSION - Domain 2 start', category: 'study', start: '08:00', end: '10:30', notes: 'Threats, Vulnerabilities, and Mitigations' },
            { title: 'Gym/Running', category: 'exercise', start: '10:30', end: '12:00', notes: '' },
            { title: 'Shower, lunch', category: 'meal', start: '12:00', end: '13:00', notes: '' },
            { title: 'STUDY SESSION - Domain 2 continue', category: 'study', start: '13:00', end: '15:00', notes: '' },
            { title: 'School run', category: 'routine', start: '15:00', end: '16:00', notes: '' },
            { title: 'Job applications', category: 'jobHunting', start: '16:00', end: '17:30', notes: '14 apps target' },
            { title: 'Dinner', category: 'meal', start: '17:30', end: '18:30', notes: '' },
            { title: 'STUDY SESSION - Domain 2 finish + flashcards', category: 'study', start: '18:30', end: '20:00', notes: '' },
            { title: 'Free time', category: 'personal', start: '20:00', end: '21:00', notes: '' },
            { title: 'Wind down, sleep prep', category: 'rest', start: '21:00', end: '22:00', notes: '' }
        ]
    },

    // THURSDAY 29 JANUARY (WORK DAY)
    '2026-01-29': {
        dayType: 'workDay',
        events: [
            { title: 'Part-time job', category: 'work', start: '06:00', end: '10:00', notes: '' },
            { title: 'Commute, recovery', category: 'routine', start: '10:00', end: '11:00', notes: '' },
            { title: 'Gym/Running', category: 'exercise', start: '11:00', end: '12:30', notes: '' },
            { title: 'Shower, lunch', category: 'meal', start: '12:30', end: '13:30', notes: '' },
            { title: 'STUDY SESSION - Domain 3 start', category: 'study', start: '13:30', end: '15:00', notes: 'Security Architecture' },
            { title: 'School run', category: 'routine', start: '15:00', end: '16:00', notes: '' },
            { title: 'STUDY SESSION - Domain 3 continue', category: 'study', start: '16:00', end: '18:00', notes: '' },
            { title: 'Dinner', category: 'meal', start: '18:00', end: '19:00', notes: '' },
            { title: 'STUDY SESSION - Domain 3 finish', category: 'study', start: '19:00', end: '20:00', notes: '' },
            { title: 'Free time', category: 'personal', start: '20:00', end: '21:00', notes: '' },
            { title: 'Wind down, sleep prep', category: 'rest', start: '21:00', end: '22:00', notes: '' }
        ]
    },

    // FRIDAY 30 JANUARY (NON-WORK DAY)
    '2026-01-30': {
        dayType: 'nonWorkDay',
        events: [
            { title: 'Wake up, breakfast', category: 'routine', start: '07:00', end: '08:00', notes: '' },
            { title: 'STUDY SESSION - Domain 4 start', category: 'study', start: '08:00', end: '10:30', notes: 'Security Operations' },
            { title: 'Gym/Running', category: 'exercise', start: '10:30', end: '12:00', notes: '' },
            { title: 'Shower, lunch', category: 'meal', start: '12:00', end: '13:00', notes: '' },
            { title: 'STUDY SESSION - Domain 4 continue', category: 'study', start: '13:00', end: '15:00', notes: '' },
            { title: 'School run', category: 'routine', start: '15:00', end: '16:00', notes: '' },
            { title: 'Job applications', category: 'jobHunting', start: '16:00', end: '17:30', notes: '14 apps target' },
            { title: 'Dinner', category: 'meal', start: '17:30', end: '18:30', notes: '' },
            { title: 'STUDY SESSION - Domain 4 finish', category: 'study', start: '18:30', end: '20:00', notes: '' },
            { title: 'Free time', category: 'personal', start: '20:00', end: '21:00', notes: '' },
            { title: 'Wind down, sleep prep', category: 'rest', start: '21:00', end: '22:00', notes: '' }
        ]
    },

    // SATURDAY 31 JANUARY (WORK DAY)
    '2026-01-31': {
        dayType: 'workDay',
        events: [
            { title: 'Part-time job', category: 'work', start: '06:00', end: '10:00', notes: '' },
            { title: 'Commute, light snack', category: 'routine', start: '10:00', end: '11:00', notes: '' },
            { title: 'Gym/Running', category: 'exercise', start: '11:00', end: '12:30', notes: '' },
            { title: 'Shower, lunch', category: 'meal', start: '12:30', end: '13:30', notes: '' },
            { title: 'STUDY SESSION - Domain 5 start', category: 'study', start: '13:30', end: '15:30', notes: 'Security Program Management and Oversight' },
            { title: 'Break', category: 'rest', start: '15:30', end: '16:00', notes: '' },
            { title: 'STUDY SESSION - Domain 5 finish', category: 'study', start: '16:00', end: '17:00', notes: '' },
            { title: 'Job applications', category: 'jobHunting', start: '17:00', end: '18:30', notes: '10 apps target' },
            { title: 'Dinner', category: 'meal', start: '18:30', end: '19:30', notes: '' },
            { title: 'STUDY SESSION - Review all domains', category: 'study', start: '19:30', end: '20:00', notes: 'Quick overview' },
            { title: 'Free time', category: 'personal', start: '20:00', end: '21:00', notes: '' },
            { title: 'Sleep prep', category: 'rest', start: '21:00', end: '22:00', notes: '' }
        ]
    },

    // SUNDAY 1 FEBRUARY (WORK DAY)
    '2026-02-01': {
        dayType: 'workDay',
        events: [
            { title: 'Part-time job', category: 'work', start: '06:00', end: '10:00', notes: '' },
            { title: 'Commute, recovery', category: 'routine', start: '10:00', end: '11:00', notes: '' },
            { title: 'Light activity or rest', category: 'rest', start: '11:00', end: '12:30', notes: 'Skip gym - rest day' },
            { title: 'Lunch', category: 'meal', start: '12:30', end: '13:30', notes: '' },
            { title: 'FIRST PRACTICE EXAM', category: 'exam', start: '13:30', end: '15:00', notes: 'Full 90 min practice test' },
            { title: 'Break', category: 'rest', start: '15:00', end: '15:30', notes: '' },
            { title: 'Review wrong answers - detailed', category: 'study', start: '15:30', end: '17:30', notes: 'Go through every wrong answer' },
            { title: 'Job applications', category: 'jobHunting', start: '17:30', end: '19:00', notes: '10 apps target' },
            { title: 'Dinner', category: 'meal', start: '19:00', end: '20:00', notes: '' },
            { title: 'Free time', category: 'personal', start: '20:00', end: '21:00', notes: '' },
            { title: 'Sleep prep', category: 'rest', start: '21:00', end: '22:00', notes: '' }
        ]
    },

    // MONDAY 2 FEBRUARY (NON-WORK DAY)
    '2026-02-02': {
        dayType: 'nonWorkDay',
        events: [
            { title: 'Wake up, breakfast', category: 'routine', start: '07:00', end: '08:00', notes: '' },
            { title: 'STUDY SESSION - Attack types deep dive', category: 'study', start: '08:00', end: '10:30', notes: 'Malware, social engineering, application attacks' },
            { title: 'Gym', category: 'exercise', start: '10:30', end: '12:00', notes: '' },
            { title: 'Shower, lunch', category: 'meal', start: '12:00', end: '13:00', notes: '' },
            { title: 'STUDY SESSION - Cryptography review', category: 'study', start: '13:00', end: '15:00', notes: 'Symmetric, asymmetric, hashing, PKI' },
            { title: 'School run', category: 'routine', start: '15:00', end: '16:00', notes: '' },
            { title: 'Job applications', category: 'jobHunting', start: '16:00', end: '17:30', notes: '14 apps target' },
            { title: 'Dinner', category: 'meal', start: '17:30', end: '18:30', notes: '' },
            { title: 'STUDY SESSION - Network protocols', category: 'study', start: '18:30', end: '20:00', notes: 'Ports, protocols, secure communications' },
            { title: 'Free time', category: 'personal', start: '20:00', end: '21:00', notes: '' },
            { title: 'Wind down', category: 'rest', start: '21:00', end: '22:00', notes: '' }
        ]
    },

    // TUESDAY 3 FEBRUARY (WORK DAY)
    '2026-02-03': {
        dayType: 'workDay',
        events: [
            { title: 'Part-time job', category: 'work', start: '06:00', end: '10:00', notes: '' },
            { title: 'Commute', category: 'routine', start: '10:00', end: '11:00', notes: '' },
            { title: 'Gym/Running', category: 'exercise', start: '11:00', end: '12:30', notes: '' },
            { title: 'Shower, lunch', category: 'meal', start: '12:30', end: '13:30', notes: '' },
            { title: 'STUDY SESSION - Security controls', category: 'study', start: '13:30', end: '15:00', notes: 'Technical, administrative, physical controls' },
            { title: 'School run', category: 'routine', start: '15:00', end: '16:00', notes: '' },
            { title: 'STUDY SESSION - PBQ practice scenarios', category: 'study', start: '16:00', end: '18:00', notes: 'Performance-based questions practice' },
            { title: 'Dinner', category: 'meal', start: '18:00', end: '19:00', notes: '' },
            { title: 'STUDY SESSION - Continue PBQ', category: 'study', start: '19:00', end: '20:00', notes: '' },
            { title: 'Free time', category: 'personal', start: '20:00', end: '21:00', notes: '' },
            { title: 'Sleep prep', category: 'rest', start: '21:00', end: '22:00', notes: '' }
        ]
    },

    // WEDNESDAY 4 FEBRUARY (NON-WORK DAY)
    '2026-02-04': {
        dayType: 'nonWorkDay',
        events: [
            { title: 'Wake up, breakfast', category: 'routine', start: '07:00', end: '08:00', notes: '' },
            { title: 'SECOND PRACTICE EXAM + review', category: 'exam', start: '08:00', end: '10:30', notes: 'Full practice test then immediate review' },
            { title: 'Gym/Running', category: 'exercise', start: '10:30', end: '12:00', notes: '' },
            { title: 'Shower, lunch', category: 'meal', start: '12:00', end: '13:00', notes: '' },
            { title: 'STUDY SESSION - Weak areas from exam', category: 'study', start: '13:00', end: '15:00', notes: 'Focus on topics you got wrong' },
            { title: 'School run', category: 'routine', start: '15:00', end: '16:00', notes: '' },
            { title: 'Job applications', category: 'jobHunting', start: '16:00', end: '17:30', notes: '14 apps target' },
            { title: 'Dinner', category: 'meal', start: '17:30', end: '18:30', notes: '' },
            { title: 'STUDY SESSION - Port numbers drill', category: 'study', start: '18:30', end: '20:00', notes: 'Memorize common ports' },
            { title: 'Free time', category: 'personal', start: '20:00', end: '21:00', notes: '' },
            { title: 'Wind down', category: 'rest', start: '21:00', end: '22:00', notes: '' }
        ]
    },

    // THURSDAY 5 FEBRUARY (WORK DAY)
    '2026-02-05': {
        dayType: 'workDay',
        events: [
            { title: 'Part-time job', category: 'work', start: '06:00', end: '10:00', notes: '' },
            { title: 'Commute', category: 'routine', start: '10:00', end: '11:00', notes: '' },
            { title: 'Gym/Running', category: 'exercise', start: '11:00', end: '12:30', notes: '' },
            { title: 'Shower, lunch', category: 'meal', start: '12:30', end: '13:30', notes: '' },
            { title: 'STUDY SESSION - Governance + compliance', category: 'study', start: '13:30', end: '15:00', notes: 'Policies, regulations, frameworks' },
            { title: 'School run', category: 'routine', start: '15:00', end: '16:00', notes: '' },
            { title: 'STUDY SESSION - Acronyms review', category: 'study', start: '16:00', end: '18:00', notes: 'CIA, AAA, SIEM, SOAR, IDS, IPS, etc.' },
            { title: 'Dinner', category: 'meal', start: '18:00', end: '19:00', notes: '' },
            { title: 'STUDY SESSION - Protocol review', category: 'study', start: '19:00', end: '20:00', notes: '' },
            { title: 'Free time', category: 'personal', start: '20:00', end: '21:00', notes: '' },
            { title: 'Sleep prep', category: 'rest', start: '21:00', end: '22:00', notes: '' }
        ]
    },

    // FRIDAY 6 FEBRUARY (NON-WORK DAY)
    '2026-02-06': {
        dayType: 'nonWorkDay',
        events: [
            { title: 'Wake up, breakfast', category: 'routine', start: '07:00', end: '08:00', notes: '' },
            { title: 'THIRD PRACTICE EXAM + review', category: 'exam', start: '08:00', end: '10:30', notes: 'Target: 80%+ score' },
            { title: 'Gym/Running', category: 'exercise', start: '10:30', end: '12:00', notes: '' },
            { title: 'Shower, lunch', category: 'meal', start: '12:00', end: '13:00', notes: '' },
            { title: 'STUDY SESSION - Wrong answers deep dive', category: 'study', start: '13:00', end: '15:00', notes: 'Understand WHY each answer is wrong' },
            { title: 'School run', category: 'routine', start: '15:00', end: '16:00', notes: '' },
            { title: 'Job applications', category: 'jobHunting', start: '16:00', end: '17:30', notes: '14 apps target' },
            { title: 'Dinner', category: 'meal', start: '17:30', end: '18:30', notes: '' },
            { title: 'STUDY SESSION - Final weak areas', category: 'study', start: '18:30', end: '20:00', notes: '' },
            { title: 'Free time', category: 'personal', start: '20:00', end: '21:00', notes: '' },
            { title: 'Wind down', category: 'rest', start: '21:00', end: '22:00', notes: '' }
        ]
    },

    // SATURDAY 7 FEBRUARY (BIRTHDAY)
    '2026-02-07': {
        dayType: 'birthdayDay',
        events: [
            { title: 'Part-time job', category: 'work', start: '06:00', end: '10:00', notes: '' },
            { title: "🎂 SHIRLY'S BIRTHDAY PARTY 🎂", category: 'birthday', start: '10:00', end: '22:00', notes: 'COMPLETELY OFF - NO STUDYING! Enjoy!' }
        ]
    },

    // SUNDAY 8 FEBRUARY (WORK DAY)
    '2026-02-08': {
        dayType: 'workDay',
        events: [
            { title: 'Part-time job', category: 'work', start: '06:00', end: '10:00', notes: '' },
            { title: 'Commute, recovery', category: 'routine', start: '10:00', end: '11:00', notes: '' },
            { title: 'Light rest - skip gym', category: 'rest', start: '11:00', end: '12:00', notes: 'Rest before exam' },
            { title: 'Lunch', category: 'meal', start: '12:00', end: '13:00', notes: '' },
            { title: 'FOURTH PRACTICE EXAM', category: 'exam', start: '13:00', end: '14:30', notes: 'Final practice - confidence builder' },
            { title: 'Break', category: 'rest', start: '14:30', end: '15:00', notes: '' },
            { title: 'Review wrong answers', category: 'study', start: '15:00', end: '16:30', notes: 'Light review only' },
            { title: 'Job applications', category: 'jobHunting', start: '16:30', end: '18:00', notes: '10 apps target' },
            { title: 'Dinner', category: 'meal', start: '18:00', end: '19:00', notes: '' },
            { title: 'Skim all flashcards', category: 'study', start: '19:00', end: '20:00', notes: 'Quick review, no stress' },
            { title: 'Free time', category: 'personal', start: '20:00', end: '20:30', notes: '' },
            { title: 'STOP STUDYING - early bed prep', category: 'rest', start: '20:30', end: '21:00', notes: 'Relax!' },
            { title: 'Sleep', category: 'rest', start: '21:00', end: '22:00', notes: 'Early night for exam' }
        ]
    },

    // MONDAY 9 FEBRUARY - EXAM DAY
    '2026-02-09': {
        dayType: 'examDay',
        events: [
            { title: 'Wake up, light breakfast', category: 'routine', start: '07:00', end: '07:30', notes: 'Eat something sustaining' },
            { title: 'Quick flashcard skim', category: 'study', start: '07:30', end: '08:00', notes: 'Ports/acronyms only' },
            { title: 'Final prep, gather ID', category: 'routine', start: '08:00', end: '08:30', notes: '2 forms of ID' },
            { title: 'Leave for exam center', category: 'routine', start: '08:30', end: '09:00', notes: 'Arrive early!' },
            { title: '🎯 SECURITY+ EXAM 🎯', category: 'exam', start: '09:00', end: '11:00', notes: 'YOU GOT THIS!' },
            { title: 'Post-exam celebration', category: 'personal', start: '11:00', end: '22:00', notes: 'Celebrate your hard work!' }
        ]
    }
};

/**
 * DEFAULT POMODORO SETTINGS
 */
const DEFAULT_POMODORO = {
    focusDuration: 25,
    breakDuration: 5,
    longBreakDuration: 15,
    sessionsUntilLongBreak: 4
};

/**
 * NOTIFICATION SETTINGS
 */
const NOTIFICATION_SETTINGS = {
    snoozeInterval: 10,
    maxSnoozes: 6
};
