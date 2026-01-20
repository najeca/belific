/**
 * =============================================
 * DATA.JS - Constants and Configuration
 * =============================================
 * 
 * This file contains all the static data for the app:
 * - Category definitions (colors, icons, names)
 * - Schedule templates (your pre-defined daily schedules)
 * - Day type configurations
 * 
 * CUSTOMIZATION:
 * - To change a category color, edit the 'color' property
 * - To change schedule times, edit the templates below
 * - To add a new category, add an entry to CATEGORIES
 */

/**
 * CATEGORIES
 * 
 * Each category represents a type of activity.
 * Properties:
 * - name: Display name shown in the UI
 * - icon: Emoji icon for visual identification
 * - color: CSS color value (matches CSS variables)
 */
const CATEGORIES = {
    work: {
        name: 'Work',
        icon: '💼',
        color: '#5B8CB8'  // Dusty blue
    },
    exercise: {
        name: 'Exercise',
        icon: '🏃',
        color: '#6B9B76'  // Sage green
    },
    study: {
        name: 'Study',
        icon: '📚',
        color: '#D4915D'  // Warm amber
    },
    jobHunting: {
        name: 'Job Hunt',
        icon: '🔍',
        color: '#8B7BB8'  // Muted purple
    },
    portfolio: {
        name: 'Portfolio',
        icon: '🔨',
        color: '#C76B8F'  // Dusty rose
    },
    meal: {
        name: 'Meal',
        icon: '🍽️',
        color: '#C9A857'  // Golden wheat
    },
    personal: {
        name: 'Personal',
        icon: '👤',
        color: '#5BA3A3'  // Teal
    },
    rest: {
        name: 'Rest',
        icon: '🌙',
        color: '#7B82AA'  // Lavender blue
    },
    routine: {
        name: 'Routine',
        icon: '🔄',
        color: '#8B8B8B'  // Warm gray
    }
};

/**
 * DAY TYPES
 * 
 * Defines the four types of days in your schedule.
 * Properties:
 * - name: Display name
 * - color: Badge color (matches CSS variables)
 * - days: Array of JavaScript day numbers (0=Sunday, 1=Monday, etc.)
 */
const DAY_TYPES = {
    workingWeekday: {
        name: 'Working Weekday',
        color: '#5B8CB8',
        days: [2, 4]  // Tuesday, Thursday
    },
    nonWorkingWeekday: {
        name: 'Non-Working Weekday',
        color: '#6B9B76',
        days: [1, 3, 5]  // Monday, Wednesday, Friday
    },
    workingSaturday: {
        name: 'Working Saturday',
        color: '#D4915D',
        days: [6]  // Saturday only
    },
    restSunday: {
        name: 'Rest Day (Sunday)',
        color: '#7B82AA',
        days: [0]  // Sunday only
    }
};

/**
 * SCHEDULE TEMPLATES
 * 
 * Pre-defined daily schedules for each day type.
 * Each event has:
 * - title: Event name
 * - category: Key from CATEGORIES object
 * - start: Start time in 24-hour format (HH:MM)
 * - end: End time in 24-hour format (HH:MM)
 * 
 * TO MODIFY YOUR SCHEDULE:
 * Simply change the times or titles below.
 * Make sure end time is after start time!
 */
const SCHEDULE_TEMPLATES = {
    
    /**
     * WORKING WEEKDAY (Tuesday & Thursday)
     * Includes: Work shift, errands, gym in daylight hours
     * Total study: 2.5 hours | Total job hunting: 2 hours
     */
    workingWeekday: [
        {
            title: 'Part-time job',
            category: 'work',
            start: '06:00',
            end: '10:00'
        },
        {
            title: 'Commute, light snack, change',
            category: 'routine',
            start: '10:00',
            end: '11:00'
        },
        {
            title: 'Gym/Running',
            category: 'exercise',
            start: '11:00',
            end: '12:30'
        },
        {
            title: 'Shower, lunch',
            category: 'meal',
            start: '12:30',
            end: '13:30'
        },
        {
            title: 'Study session',
            category: 'study',
            start: '13:30',
            end: '15:00'
        },
        {
            title: 'Errands',
            category: 'routine',
            start: '15:00',
            end: '15:30'
        },
        {
            title: 'Job applications',
            category: 'jobHunting',
            start: '15:30',
            end: '17:30'
        },
        {
            title: 'Dinner',
            category: 'meal',
            start: '17:30',
            end: '18:30'
        },
        {
            title: 'Practice/Review',
            category: 'study',
            start: '18:30',
            end: '19:30'
        },
        {
            title: 'Free time',
            category: 'personal',
            start: '19:30',
            end: '21:00'
        },
        {
            title: 'Wind down, sleep prep',
            category: 'rest',
            start: '21:00',
            end: '22:00'
        }
    ],

    /**
     * NON-WORKING WEEKDAY (Monday, Wednesday, Friday)
     * Includes: Morning gym, extended study blocks
     * Total study: 3 hours | Total job hunting: 2.5 hours
     */
    nonWorkingWeekday: [
        {
            title: 'Wake up, breakfast',
            category: 'routine',
            start: '07:00',
            end: '08:00'
        },
        {
            title: 'Gym/Running',
            category: 'exercise',
            start: '08:00',
            end: '10:00'
        },
        {
            title: 'Shower, recovery snack',
            category: 'routine',
            start: '10:00',
            end: '11:00'
        },
        {
            title: 'Study session',
            category: 'study',
            start: '11:00',
            end: '13:00'
        },
        {
            title: 'Lunch',
            category: 'meal',
            start: '13:00',
            end: '14:00'
        },
        {
            title: 'Job applications',
            category: 'jobHunting',
            start: '14:00',
            end: '16:30'
        },
        {
            title: 'Break',
            category: 'rest',
            start: '16:30',
            end: '17:00'
        },
        {
            title: 'Practice/Review',
            category: 'study',
            start: '17:00',
            end: '18:00'
        },
        {
            title: 'Dinner',
            category: 'meal',
            start: '18:00',
            end: '19:00'
        },
        {
            title: 'Free time',
            category: 'personal',
            start: '19:00',
            end: '21:00'
        },
        {
            title: 'Wind down, sleep prep',
            category: 'rest',
            start: '21:00',
            end: '22:00'
        }
    ],

    /**
     * WORKING SATURDAY
     * Includes: Work shift, gym, portfolio time
     * Total study: 1.5 hours | Total job hunting: 1 hour | Portfolio: 1 hour
     */
    workingSaturday: [
        {
            title: 'Part-time job',
            category: 'work',
            start: '06:00',
            end: '10:00'
        },
        {
            title: 'Commute, light snack, change',
            category: 'routine',
            start: '10:00',
            end: '11:00'
        },
        {
            title: 'Gym/Running',
            category: 'exercise',
            start: '11:00',
            end: '12:30'
        },
        {
            title: 'Shower, lunch',
            category: 'meal',
            start: '12:30',
            end: '13:30'
        },
        {
            title: 'Study session',
            category: 'study',
            start: '13:30',
            end: '15:00'
        },
        {
            title: 'Portfolio work',
            category: 'portfolio',
            start: '15:00',
            end: '16:00'
        },
        {
            title: 'Job applications',
            category: 'jobHunting',
            start: '16:00',
            end: '17:00'
        },
        {
            title: 'Dinner',
            category: 'meal',
            start: '17:00',
            end: '18:00'
        },
        {
            title: 'Free time',
            category: 'personal',
            start: '18:00',
            end: '20:00'
        },
        {
            title: 'Wind down',
            category: 'rest',
            start: '20:00',
            end: '21:00'
        }
    ],

    /**
     * REST SUNDAY
     * Includes: Church, rest, light activities - no gym
     * A proper rest day for recovery
     */
    restSunday: [
        {
            title: 'Wake up, breakfast',
            category: 'routine',
            start: '08:00',
            end: '09:30'
        },
        {
            title: 'Get ready for church',
            category: 'routine',
            start: '09:30',
            end: '10:30'
        },
        {
            title: 'Church',
            category: 'personal',
            start: '11:00',
            end: '13:00'
        },
        {
            title: 'Lunch',
            category: 'meal',
            start: '13:00',
            end: '14:00'
        },
        {
            title: 'Rest/Relaxation',
            category: 'rest',
            start: '14:00',
            end: '16:00'
        },
        {
            title: 'Light study/Reading',
            category: 'study',
            start: '16:00',
            end: '17:00'
        },
        {
            title: 'Dinner',
            category: 'meal',
            start: '17:00',
            end: '18:00'
        },
        {
            title: 'Free time',
            category: 'personal',
            start: '18:00',
            end: '20:30'
        },
        {
            title: 'Prepare for the week',
            category: 'routine',
            start: '20:30',
            end: '21:30'
        },
        {
            title: 'Wind down',
            category: 'rest',
            start: '21:30',
            end: '22:00'
        }
    ]
};

/**
 * DEFAULT POMODORO SETTINGS
 * 
 * Standard Pomodoro technique values.
 * You can adjust these in the app settings.
 */
const DEFAULT_POMODORO = {
    focusDuration: 25,       // Minutes per focus session
    breakDuration: 5,        // Minutes per short break
    longBreakDuration: 15,   // Minutes per long break
    sessionsUntilLongBreak: 4 // Number of sessions before long break
};

/**
 * NOTIFICATION SETTINGS
 * 
 * Configure snooze behavior.
 */
const NOTIFICATION_SETTINGS = {
    snoozeInterval: 10,  // Minutes between snooze reminders
    maxSnoozes: 6        // Maximum snoozes (10 min × 6 = 1 hour)
};

/**
 * APP VERSION
 * 
 * Update this when releasing new versions.
 */
const APP_VERSION = '1.1.0';
