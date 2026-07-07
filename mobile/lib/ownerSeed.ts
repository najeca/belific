import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadCustomEvents, saveCustomEvents } from './storage';
import { formatDateKey } from './data';
import type { CustomEvent } from './types';

const OWNER_SEED_KEY = 'belific_owner_seeded';

type RawEvent = {
  title: string;
  category: string;
  icon: string;
  start: string; // HH:MM 24-hr
  end: string;   // HH:MM 24-hr
};

// Indexed by JS getDay() value: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
const DAY_TEMPLATES: Record<number, RawEvent[]> = {
  1: [ // Monday — off work, Zone 2 run, school run 3–4pm
    { title: 'Brush teeth — before eating',                                           category: 'hygiene',  icon: '🪥', start: '07:00', end: '07:03' },
    { title: 'Overnight oats + peppermint tea + supplements · CeraVe + SPF',          category: 'routine',  icon: '🔄', start: '07:03', end: '07:30' },
    { title: 'Job applications × 6',                                                   category: 'jobs',     icon: '🔍', start: '07:30', end: '09:00' },
    { title: 'Zone 2 run — 2 hours',                                                   category: 'fitness',  icon: '🏃', start: '09:00', end: '11:00' },
    { title: 'Shower · CeraVe while damp',                                             category: 'routine',  icon: '🔄', start: '11:00', end: '11:30' },
    { title: 'Project building — Landis deep work',                                    category: 'project',  icon: '💻', start: '11:30', end: '13:00' },
    { title: 'Lunch + rooibos tea',                                                    category: 'free',     icon: '☕', start: '13:00', end: '13:30' },
    { title: 'TryHackMe or blockchain/crypto rotation',                                category: 'cyber',    icon: '🔐', start: '13:30', end: '14:30' },
    { title: 'Project building',                                                        category: 'project',  icon: '💻', start: '14:30', end: '15:00' },
    { title: 'School run',                                                              category: 'school',   icon: '🏫', start: '15:00', end: '16:00' },
    { title: 'Interview practice — 12 questions verbal out loud',                       category: 'project',  icon: '🎯', start: '16:00', end: '16:30' },
    { title: 'Project building — Landis',                                               category: 'project',  icon: '💻', start: '16:30', end: '18:00' },
    { title: 'Dinner + ginger tea',                                                     category: 'free',     icon: '☕', start: '18:00', end: '18:30' },
    { title: 'Umamusume',                                                               category: 'game',     icon: '🎮', start: '18:30', end: '19:30' },
    { title: 'Prep tomorrow',                                                           category: 'routine',  icon: '🔄', start: '20:00', end: '20:10' },
    { title: 'Skincare — CeraVe · Nizoral on applicable nights',                       category: 'hygiene',  icon: '🪥', start: '20:10', end: '20:15' },
    { title: 'Stretching & mobility',                                                   category: 'fitness',  icon: '🏃', start: '20:15', end: '20:30' },
    { title: 'Dark chocolate 85%',                                                      category: 'free',     icon: '☕', start: '20:30', end: '20:35' },
    { title: 'Chamomile or turmeric ashwagandha · read/journal/pray',                   category: 'winddown', icon: '🌙', start: '20:35', end: '20:55' },
    { title: 'Brush teeth',                                                             category: 'hygiene',  icon: '🪥', start: '20:55', end: '21:00' },
    { title: 'Sleep',                                                                   category: 'sleep',    icon: '😴', start: '21:00', end: '23:59' },
  ],
  2: [ // Tuesday — work 6–10am, gym Push, laundry, school run, anime
    { title: 'Wake up · brush teeth — before eating',                                  category: 'hygiene',  icon: '🪥', start: '05:15', end: '05:18' },
    { title: 'Overnight oats + peppermint tea + supplements · CeraVe · pack gym bag',  category: 'routine',  icon: '🔄', start: '05:18', end: '05:45' },
    { title: 'Home Bargains shift · banana at 9:45am',                                 category: 'work',     icon: '💼', start: '06:00', end: '10:00' },
    { title: 'Drive to gym · creatine in 500ml bottle',                                category: 'routine',  icon: '🔄', start: '10:00', end: '10:15' },
    { title: 'Gym — Push day',                                                          category: 'fitness',  icon: '🏃', start: '10:15', end: '12:15' },
    { title: 'Start washing machine',                                                   category: 'chore',    icon: '🧹', start: '12:15', end: '12:20' },
    { title: 'Drive home · shower · CeraVe while damp',                                category: 'routine',  icon: '🔄', start: '12:20', end: '12:50' },
    { title: 'Move laundry to spin',                                                    category: 'chore',    icon: '🧹', start: '12:50', end: '12:55' },
    { title: 'Lunch + job applications × 2 + rooibos tea',                             category: 'jobs',     icon: '🔍', start: '12:55', end: '13:25' },
    { title: 'Transfer laundry to dry rack',                                            category: 'chore',    icon: '🧹', start: '13:20', end: '13:25' },
    { title: 'Interview practice — 12 questions verbal out loud',                       category: 'project',  icon: '🎯', start: '13:25', end: '13:55' },
    { title: 'TryHackMe or blockchain/crypto rotation',                                category: 'cyber',    icon: '🔐', start: '13:55', end: '14:55' },
    { title: 'School run',                                                              category: 'school',   icon: '🏫', start: '15:00', end: '16:00' },
    { title: 'Project building — Landis',                                               category: 'project',  icon: '💻', start: '16:00', end: '18:00' },
    { title: 'Dinner + ginger tea',                                                     category: 'free',     icon: '☕', start: '18:00', end: '18:30' },
    { title: 'Anime — watch + note clip timestamps',                                    category: 'game',     icon: '📺', start: '18:30', end: '19:30' },
    { title: 'Prep tomorrow',                                                           category: 'routine',  icon: '🔄', start: '20:00', end: '20:10' },
    { title: 'Skincare — CeraVe · Nizoral on applicable nights',                       category: 'hygiene',  icon: '🪥', start: '20:10', end: '20:15' },
    { title: 'Stretching & mobility',                                                   category: 'fitness',  icon: '🏃', start: '20:15', end: '20:30' },
    { title: 'Dark chocolate 85%',                                                      category: 'free',     icon: '☕', start: '20:30', end: '20:35' },
    { title: 'Chamomile or turmeric ashwagandha · read/journal',                        category: 'winddown', icon: '🌙', start: '20:35', end: '20:55' },
    { title: 'Brush teeth',                                                             category: 'hygiene',  icon: '🪥', start: '20:55', end: '21:00' },
    { title: 'Sleep',                                                                   category: 'sleep',    icon: '😴', start: '21:00', end: '23:59' },
  ],
  3: [ // Wednesday — off work, tempo run, laundry fold+iron, room clean, school run
    { title: 'Brush teeth — before eating',                                             category: 'hygiene',  icon: '🪥', start: '07:00', end: '07:03' },
    { title: 'Overnight oats + peppermint tea + supplements · CeraVe + SPF',           category: 'routine',  icon: '🔄', start: '07:03', end: '07:30' },
    { title: 'Job applications × 6',                                                    category: 'jobs',     icon: '🔍', start: '07:30', end: '09:00' },
    { title: 'Tempo run — 2 hours',                                                     category: 'fitness',  icon: '🏃', start: '09:00', end: '11:00' },
    { title: 'Shower · CeraVe while damp',                                              category: 'routine',  icon: '🔄', start: '11:00', end: '11:30' },
    { title: 'TryHackMe — dedicated 1.5hr cyber block',                                 category: 'cyber',    icon: '🔐', start: '11:30', end: '13:00' },
    { title: 'Lunch + rooibos tea',                                                     category: 'free',     icon: '☕', start: '13:00', end: '13:30' },
    { title: 'Project building — Landis',                                               category: 'project',  icon: '💻', start: '13:30', end: '15:00' },
    { title: 'School run',                                                              category: 'school',   icon: '🏫', start: '15:00', end: '16:00' },
    { title: 'Fold + iron laundry — 1hr full focus',                                    category: 'chore',    icon: '🧹', start: '16:00', end: '17:00' },
    { title: 'Clean room — hoover surfaces tidy',                                       category: 'chore',    icon: '🧹', start: '17:00', end: '17:45' },
    { title: 'Interview practice — 12 questions verbal out loud',                       category: 'project',  icon: '🎯', start: '17:45', end: '18:00' },
    { title: 'Dinner + ginger tea',                                                     category: 'free',     icon: '☕', start: '18:00', end: '18:30' },
    { title: 'Umamusume',                                                               category: 'game',     icon: '🎮', start: '18:30', end: '19:30' },
    { title: 'Prep tomorrow',                                                           category: 'routine',  icon: '🔄', start: '20:00', end: '20:10' },
    { title: 'Skincare — CeraVe · Nizoral on applicable nights',                       category: 'hygiene',  icon: '🪥', start: '20:10', end: '20:15' },
    { title: 'Stretching & mobility',                                                   category: 'fitness',  icon: '🏃', start: '20:15', end: '20:30' },
    { title: 'Dark chocolate 85%',                                                      category: 'free',     icon: '☕', start: '20:30', end: '20:35' },
    { title: 'Chamomile or turmeric ashwagandha · read/journal/pray',                   category: 'winddown', icon: '🌙', start: '20:35', end: '20:55' },
    { title: 'Brush teeth',                                                             category: 'hygiene',  icon: '🪥', start: '20:55', end: '21:00' },
    { title: 'Sleep',                                                                   category: 'sleep',    icon: '😴', start: '21:00', end: '23:59' },
  ],
  4: [ // Thursday — work 6–10am, gym Pull, school run, anime
    { title: 'Wake up · brush teeth — before eating',                                  category: 'hygiene',  icon: '🪥', start: '05:15', end: '05:18' },
    { title: 'Overnight oats + peppermint tea + supplements · CeraVe · pack gym bag',  category: 'routine',  icon: '🔄', start: '05:18', end: '05:45' },
    { title: 'Home Bargains shift · banana at 9:45am',                                 category: 'work',     icon: '💼', start: '06:00', end: '10:00' },
    { title: 'Drive to gym · creatine in 500ml bottle',                                category: 'routine',  icon: '🔄', start: '10:00', end: '10:15' },
    { title: 'Gym — Pull day',                                                          category: 'fitness',  icon: '🏃', start: '10:15', end: '12:15' },
    { title: 'Drive home · shower · CeraVe while damp',                                category: 'routine',  icon: '🔄', start: '12:15', end: '12:45' },
    { title: 'Lunch + job applications × 2 + rooibos tea',                             category: 'jobs',     icon: '🔍', start: '12:45', end: '13:15' },
    { title: 'Interview practice — 12 questions verbal out loud',                       category: 'project',  icon: '🎯', start: '13:15', end: '13:45' },
    { title: 'TryHackMe or blockchain/crypto rotation',                                category: 'cyber',    icon: '🔐', start: '13:45', end: '14:45' },
    { title: 'School run',                                                              category: 'school',   icon: '🏫', start: '15:00', end: '16:00' },
    { title: 'Project building — Landis',                                               category: 'project',  icon: '💻', start: '16:00', end: '18:00' },
    { title: 'Dinner + ginger tea',                                                     category: 'free',     icon: '☕', start: '18:00', end: '18:30' },
    { title: 'Anime — watch + note clip timestamps',                                    category: 'game',     icon: '📺', start: '18:30', end: '19:30' },
    { title: 'Prep tomorrow',                                                           category: 'routine',  icon: '🔄', start: '20:00', end: '20:10' },
    { title: 'Skincare — CeraVe · Nizoral on applicable nights',                       category: 'hygiene',  icon: '🪥', start: '20:10', end: '20:15' },
    { title: 'Stretching & mobility',                                                   category: 'fitness',  icon: '🏃', start: '20:15', end: '20:30' },
    { title: 'Dark chocolate 85%',                                                      category: 'free',     icon: '☕', start: '20:30', end: '20:35' },
    { title: 'Chamomile or turmeric ashwagandha · read/journal',                        category: 'winddown', icon: '🌙', start: '20:35', end: '20:55' },
    { title: 'Brush teeth',                                                             category: 'hygiene',  icon: '🪥', start: '20:55', end: '21:00' },
    { title: 'Sleep',                                                                   category: 'sleep',    icon: '😴', start: '21:00', end: '23:59' },
  ],
  5: [ // Friday — off work, Zone 2 run, school run, weekly review
    { title: 'Brush teeth — before eating',                                             category: 'hygiene',  icon: '🪥', start: '07:00', end: '07:03' },
    { title: 'Overnight oats + peppermint tea + supplements · CeraVe + SPF',           category: 'routine',  icon: '🔄', start: '07:03', end: '07:30' },
    { title: 'Job applications × 6',                                                    category: 'jobs',     icon: '🔍', start: '07:30', end: '09:00' },
    { title: 'Zone 2 run — 2 hours',                                                    category: 'fitness',  icon: '🏃', start: '09:00', end: '11:00' },
    { title: 'Shower · CeraVe while damp',                                              category: 'routine',  icon: '🔄', start: '11:00', end: '11:30' },
    { title: 'Project building — Landis deep work',                                     category: 'project',  icon: '💻', start: '11:30', end: '13:00' },
    { title: 'Lunch + rooibos tea',                                                     category: 'free',     icon: '☕', start: '13:00', end: '13:30' },
    { title: 'TryHackMe or blockchain/crypto rotation',                                category: 'cyber',    icon: '🔐', start: '13:30', end: '14:30' },
    { title: 'Project building',                                                        category: 'project',  icon: '💻', start: '14:30', end: '15:00' },
    { title: 'School run',                                                              category: 'school',   icon: '🏫', start: '15:00', end: '16:00' },
    { title: 'Interview practice — 12 questions verbal out loud',                       category: 'project',  icon: '🎯', start: '16:00', end: '16:30' },
    { title: 'Weekly review — hit 25 apps? count + plan Monday',                        category: 'project',  icon: '💻', start: '16:30', end: '17:15' },
    { title: 'Project building',                                                        category: 'project',  icon: '💻', start: '17:15', end: '18:00' },
    { title: 'Dinner + ginger tea',                                                     category: 'free',     icon: '☕', start: '18:00', end: '18:30' },
    { title: 'Umamusume',                                                               category: 'game',     icon: '🎮', start: '18:30', end: '19:30' },
    { title: 'Prep tomorrow',                                                           category: 'routine',  icon: '🔄', start: '20:00', end: '20:10' },
    { title: 'Skincare — CeraVe · Nizoral on applicable nights',                       category: 'hygiene',  icon: '🪥', start: '20:10', end: '20:15' },
    { title: 'Stretching & mobility',                                                   category: 'fitness',  icon: '🏃', start: '20:15', end: '20:30' },
    { title: 'Dark chocolate 85%',                                                      category: 'free',     icon: '☕', start: '20:30', end: '20:35' },
    { title: 'Chamomile or turmeric ashwagandha · read/journal/pray',                   category: 'winddown', icon: '🌙', start: '20:35', end: '20:55' },
    { title: 'Brush teeth',                                                             category: 'hygiene',  icon: '🪥', start: '20:55', end: '21:00' },
    { title: 'Sleep',                                                                   category: 'sleep',    icon: '😴', start: '21:00', end: '23:59' },
  ],
  6: [ // Saturday — work 6–10am, gym Legs, anime editing
    { title: 'Wake up · brush teeth — before eating',                                  category: 'hygiene',  icon: '🪥', start: '05:15', end: '05:18' },
    { title: 'Overnight oats + peppermint tea + supplements · CeraVe · pack gym bag',  category: 'routine',  icon: '🔄', start: '05:18', end: '05:45' },
    { title: 'Home Bargains shift · banana at 9:45am',                                 category: 'work',     icon: '💼', start: '06:00', end: '10:00' },
    { title: 'Drive to gym · creatine in 500ml bottle',                                category: 'routine',  icon: '🔄', start: '10:00', end: '10:15' },
    { title: 'Gym — Legs day',                                                          category: 'fitness',  icon: '🏃', start: '10:15', end: '12:15' },
    { title: 'Drive home · shower · CeraVe while damp',                                category: 'routine',  icon: '🔄', start: '12:15', end: '12:45' },
    { title: 'Lunch + job applications × 2 + rooibos tea',                             category: 'jobs',     icon: '🔍', start: '12:45', end: '13:15' },
    { title: 'Interview practice — 12 questions verbal out loud',                       category: 'project',  icon: '🎯', start: '13:15', end: '13:45' },
    { title: 'TryHackMe or blockchain/crypto — 30 min',                                category: 'cyber',    icon: '🔐', start: '13:45', end: '14:15' },
    { title: 'Project building — Landis',                                               category: 'project',  icon: '💻', start: '14:15', end: '16:00' },
    { title: 'Anime clip editing — CapCut/DaVinci batch',                               category: 'game',     icon: '📺', start: '16:00', end: '16:45' },
    { title: 'Car clean — fortnightly',                                                 category: 'chore',    icon: '🧹', start: '16:45', end: '17:00' },
    { title: 'Rest & free time',                                                        category: 'free',     icon: '☕', start: '17:00', end: '17:30' },
    { title: 'Dinner + ginger tea',                                                     category: 'free',     icon: '☕', start: '17:30', end: '18:30' },
    { title: 'Umamusume',                                                               category: 'game',     icon: '🎮', start: '18:30', end: '19:30' },
    { title: 'Prep tomorrow',                                                           category: 'routine',  icon: '🔄', start: '19:30', end: '19:40' },
    { title: 'Skincare — CeraVe · Nizoral on applicable nights',                       category: 'hygiene',  icon: '🪥', start: '19:40', end: '19:45' },
    { title: 'Stretching & mobility',                                                   category: 'fitness',  icon: '🏃', start: '19:45', end: '20:00' },
    { title: 'Dark chocolate 85%',                                                      category: 'free',     icon: '☕', start: '20:00', end: '20:05' },
    { title: 'Chamomile or turmeric ashwagandha · read/journal',                        category: 'winddown', icon: '🌙', start: '20:05', end: '20:25' },
    { title: 'Brush teeth',                                                             category: 'hygiene',  icon: '🪥', start: '20:25', end: '20:30' },
    { title: 'Sleep',                                                                   category: 'sleep',    icon: '😴', start: '20:30', end: '23:59' },
  ],
  0: [ // Sunday — work 6–10am, church, rest day
    { title: 'Wake up · brush teeth — before eating',                                  category: 'hygiene',  icon: '🪥', start: '05:15', end: '05:18' },
    { title: 'Overnight oats + peppermint tea + supplements · CeraVe',                  category: 'routine',  icon: '🔄', start: '05:18', end: '05:45' },
    { title: 'Home Bargains shift',                                                     category: 'work',     icon: '💼', start: '06:00', end: '10:00' },
    { title: 'Return home · prep for church',                                           category: 'routine',  icon: '🔄', start: '10:00', end: '11:00' },
    { title: 'Church',                                                                  category: 'church',   icon: '⛪', start: '11:00', end: '13:00' },
    { title: 'Lunch + rooibos tea',                                                     category: 'free',     icon: '☕', start: '13:00', end: '13:30' },
    { title: 'Job applications × 2',                                                    category: 'jobs',     icon: '🔍', start: '13:30', end: '14:00' },
    { title: 'Interview practice — 12 questions verbal out loud',                       category: 'project',  icon: '🎯', start: '14:00', end: '14:30' },
    { title: 'Blockchain/crypto reading — light session',                               category: 'cyber',    icon: '🔐', start: '14:30', end: '15:00' },
    { title: 'Game testing — 30 min max',                                               category: 'free',     icon: '☕', start: '15:00', end: '15:30' },
    { title: 'Rest & free time — genuine recovery',                                     category: 'free',     icon: '☕', start: '15:30', end: '17:00' },
    { title: 'Weekly planning — hit 25 apps? prep Monday',                              category: 'project',  icon: '💻', start: '17:00', end: '17:30' },
    { title: 'Dinner + ginger tea',                                                     category: 'free',     icon: '☕', start: '17:30', end: '18:30' },
    { title: 'Umamusume',                                                               category: 'game',     icon: '🎮', start: '19:00', end: '20:00' },
    { title: 'Prep tomorrow',                                                           category: 'routine',  icon: '🔄', start: '20:00', end: '20:10' },
    { title: 'Skincare — CeraVe · Nizoral on applicable nights',                       category: 'hygiene',  icon: '🪥', start: '20:10', end: '20:15' },
    { title: 'Stretching & mobility',                                                   category: 'fitness',  icon: '🏃', start: '20:15', end: '20:30' },
    { title: 'Dark chocolate 85%',                                                      category: 'free',     icon: '☕', start: '20:30', end: '20:35' },
    { title: 'Chamomile or turmeric ashwagandha · read/journal/pray',                   category: 'winddown', icon: '🌙', start: '20:35', end: '20:55' },
    { title: 'Brush teeth',                                                             category: 'hygiene',  icon: '🪥', start: '20:55', end: '21:00' },
    { title: 'Sleep',                                                                   category: 'sleep',    icon: '😴', start: '21:00', end: '23:59' },
  ],
};

export async function seedOwnerSchedule(): Promise<void> {
  const alreadySeeded = await AsyncStorage.getItem(OWNER_SEED_KEY);
  if (alreadySeeded === 'true') return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const seedEvents: CustomEvent[] = [];
  const WEEKS = 12;
  const DAYS = WEEKS * 7;

  for (let offset = 0; offset < DAYS; offset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);

    const dow = date.getDay();
    const template = DAY_TEMPLATES[dow];
    if (!template) continue;

    const dateKey = formatDateKey(date);

    template.forEach((raw, index) => {
      const id = `seed-${dateKey}-${raw.start.replace(':', '')}-${index}`;
      seedEvents.push({
        id,
        title: raw.title,
        category: raw.category,
        icon: raw.icon,
        start: raw.start,
        end: raw.end,
        notes: '',
        date: dateKey,
      });
    });
  }

  const existing = await loadCustomEvents();
  const existingIds = new Set(existing.map((e) => e.id));
  const newEvents = seedEvents.filter((e) => !existingIds.has(e.id));

  await saveCustomEvents([...existing, ...newEvents]);
  await AsyncStorage.setItem(OWNER_SEED_KEY, 'true');
}
