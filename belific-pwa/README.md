# Belific

> A warm, focused productivity app for managing your daily schedule with Pomodoro timer.

![Version](https://img.shields.io/badge/version-1.0.0-orange)
![License](https://img.shields.io/badge/license-MIT-blue)
![PWA](https://img.shields.io/badge/PWA-ready-green)

<p align="center">
  <img src="assets/icon-192.png" alt="Belific Icon" width="96" height="96">
</p>

## ✨ Features

- **📅 Smart Schedule Templates** - Pre-configured daily schedules that auto-populate based on day type
- **⏱️ Pomodoro Timer** - Focus sessions with breaks, customizable durations
- **📆 Calendar View** - Month view with day selection and schedule preview
- **🔔 Notifications** - Event reminders with snooze functionality (10-minute intervals, up to 1 hour)
- **📱 Install as App** - Add to your phone's home screen like a native app
- **🌙 Dark Mode** - Automatic dark/light theme based on system preference
- **📴 Works Offline** - All data stored locally, no internet required
- **🎨 Warm Design** - Productive color palette with terracotta accents

## 📸 Screenshots

| Today View | Calendar | Focus Timer |
|------------|----------|-------------|
| View current activity, next up, and full schedule | Month calendar with day type indicators | Pomodoro timer with session tracking |

## 🚀 Quick Start

### Option 1: GitHub Pages (Recommended)

1. **Fork this repository** or click "Use this template"
2. Go to **Settings → Pages**
3. Under "Source", select **main branch**
4. Click **Save**
5. Your app will be live at `https://YOUR_USERNAME.github.io/belific`

### Option 2: Any Static Host

Upload all files to any static hosting service:
- [Netlify](https://netlify.com) - Drag and drop the folder
- [Vercel](https://vercel.com) - Import from GitHub
- [Cloudflare Pages](https://pages.cloudflare.com) - Connect your repo

## 📱 Install on iPhone

1. Open your deployed URL in **Safari** (must be Safari, not Chrome)
2. Tap the **Share button** (square with arrow pointing up)
3. Scroll down and tap **"Add to Home Screen"**
4. Name it "Belific" and tap **Add**

The app will now appear on your home screen and work like a native app!

## 📁 Project Structure

```
belific/
├── index.html          # Main HTML file
├── manifest.json       # PWA manifest (app metadata)
├── sw.js              # Service worker (offline support)
├── css/
│   └── styles.css     # All styles with CSS variables
├── js/
│   ├── data.js        # Constants, categories, schedule templates
│   ├── storage.js     # localStorage operations
│   ├── schedule.js    # Schedule management logic
│   ├── notifications.js # Notification handling
│   ├── timer.js       # Pomodoro timer functionality
│   ├── ui.js          # UI rendering functions
│   └── app.js         # Main app entry point
├── assets/
│   ├── icon-192.png   # App icon (small)
│   └── icon-512.png   # App icon (large)
└── README.md          # This file
```

## ⚙️ Customization

### Change Your Schedule

Edit `js/data.js` and modify the `SCHEDULE_TEMPLATES` object:

```javascript
// Example: Change working weekday schedule
workingWeekday: [
    {
        title: 'Morning Workout',
        category: 'exercise',
        start: '06:00',
        end: '07:30'
    },
    // ... add more events
]
```

### Change Day Types

Edit the `DAY_TYPES` object in `js/data.js`:

```javascript
DAY_TYPES: {
    workingWeekday: {
        name: 'Working Weekday',
        color: '#5B8CB8',
        days: [2, 4]  // Tuesday, Thursday (0=Sun, 1=Mon, etc.)
    },
    // ...
}
```

### Change Colors

Edit CSS variables in `css/styles.css`:

```css
:root {
    --primary: #D97652;           /* Main accent color */
    --color-work: #5B8CB8;        /* Work category */
    --color-exercise: #6B9B76;    /* Exercise category */
    /* ... more colors */
}
```

### Change Pomodoro Defaults

Edit `DEFAULT_POMODORO` in `js/data.js`:

```javascript
const DEFAULT_POMODORO = {
    focusDuration: 25,        // Minutes per focus session
    breakDuration: 5,         // Minutes per short break
    longBreakDuration: 15,    // Minutes per long break
    sessionsUntilLongBreak: 4 // Sessions before long break
};
```

## 🔔 Notification Limitations

### What Works
- In-app notification banners with Start/Snooze buttons
- System notifications when app is in foreground
- Snooze reminders (10-minute intervals, up to 6 times = 1 hour)
- Audio notification sounds

### iOS PWA Limitations
- **No background notifications** - iOS suspends PWAs when not active
- **No full-screen takeover** - Only native apps can do this
- Notifications work best when the app is open

### Workarounds
- Keep the app open during scheduled blocks
- Use the Pomodoro timer for focus sessions
- Set iPhone's native Reminders for critical events

## 🛠️ Development

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/belific.git
   cd belific
   ```

2. Serve with any local server:
   ```bash
   # Python
   python -m http.server 8000
   
   # Node.js (npx)
   npx serve
   
   # PHP
   php -S localhost:8000
   ```

3. Open `http://localhost:8000` in your browser

### Code Structure

Each JavaScript file is fully commented explaining:
- What the file does
- How each function works
- Parameters and return values
- Usage examples

This makes it easy to understand and modify the code.

## 📖 Pre-loaded Schedules

### Working Weekday (Example)
| Time | Activity | Category |
|------|----------|----------|
| 6:00-10:00 | Part-time job | Work |
| 10:00-11:00 | Commute, snack, change | Routine |
| 11:00-12:30 | Gym/Running | Exercise |
| 12:30-13:30 | Shower, lunch | Meal |
| 13:30-15:00 | Study session | Study |
| 15:00-15:30 | Errands | Routine |
| 15:30-17:30 | Job applications | Job Hunt |
| 17:30-18:30 | Dinner | Meal |
| 18:30-19:30 | Practice/Review | Study |
| 19:30-21:00 | Free time | Personal |
| 21:00-22:00 | Wind down | Rest |

### Non-Working Weekday (Example)
| Time | Activity | Category |
|------|----------|----------|
| 7:00-8:00 | Wake up, breakfast | Routine |
| 8:00-10:00 | Gym/Running | Exercise |
| 10:00-11:00 | Shower, recovery snack | Routine |
| 11:00-13:00 | Study session | Study |
| 13:00-14:00 | Lunch | Meal |
| 14:00-16:30 | Job applications | Job Hunt |
| 16:30-17:00 | Break | Rest |
| 17:00-18:00 | Practice/Review | Study |
| 18:00-19:00 | Dinner | Meal |
| 19:00-21:00 | Free time | Personal |
| 21:00-22:00 | Wind down | Rest |

### Working Weekend (Example)
| Time | Activity | Category |
|------|----------|----------|
| 6:00-10:00 | Part-time job | Work |
| 10:00-11:00 | Commute, snack, change | Routine |
| 11:00-12:30 | Gym/Running | Exercise |
| 12:30-13:30 | Shower, lunch | Meal |
| 13:30-15:00 | Study session | Study |
| 15:00-16:00 | Portfolio work | Portfolio |
| 16:00-17:00 | Job applications | Job Hunt |
| 17:00-18:00 | Dinner | Meal |
| 18:00-20:00 | Free time | Personal |
| 20:00-21:00 | Wind down | Rest |

### Example Weekly Totals
- 📚 **Study:** ~17 hours/week
- 🔍 **Job Applications:** ~11 hours/week
- 🔨 **Portfolio:** ~2 hours/week
- 🎮 **Free Time:** 1.5-2 hours daily

> **Note:** These are example schedules. Edit `js/data.js` to customise with your own activities and times.

## 🎨 Color Palette

The app uses a warm, productive color scheme:

| Color | Hex | Usage |
|-------|-----|-------|
| Terracotta | `#D97652` | Primary actions, accents |
| Dusty Blue | `#5B8CB8` | Work category |
| Sage Green | `#6B9B76` | Exercise category |
| Warm Amber | `#D4915D` | Study category |
| Muted Purple | `#8B7BB8` | Job hunting category |
| Dusty Rose | `#C76B8F` | Portfolio category |
| Golden Wheat | `#C9A857` | Meal category |
| Teal | `#5BA3A3` | Personal category |
| Lavender | `#7B82AA` | Rest category |
| Warm Gray | `#8B8B8B` | Routine category |

## 📄 License

MIT License - Feel free to use, modify, and distribute.

## 🙏 Acknowledgments

Built with vanilla JavaScript, CSS, and HTML. No frameworks, no dependencies, just clean code.

---

<p align="center">
  Made with ☕ for productivity
</p>
