import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'habit-tracker:v1';
const THEME_KEY = 'habit-tracker:theme';
// Muted tones: sage, dusty blue, lavender, clay, rose, sea green.
const COLORS = ['#7fa98b', '#7d9cc0', '#a291c4', '#d19a76', '#cf8fa3', '#6fa9a2'];
// Earlier versions saved brighter colours; swap them for their soft equivalents.
const OLD_COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#f97316', '#ec4899', '#14b8a6'];

// Local-time YYYY-MM-DD, so "today" matches the user's calendar, not UTC.
function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function loadHabits() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const habits = raw ? JSON.parse(raw) : [];
    return habits.map((h) => {
      const i = OLD_COLORS.indexOf(h.color);
      return i === -1 ? h : { ...h, color: COLORS[i] };
    });
  } catch {
    return [];
  }
}

// Consecutive completed days ending today. If today isn't done yet,
// the streak still counts from yesterday so it doesn't look broken mid-day.
function currentStreak(done, today) {
  let day = done[toKey(today)] ? today : addDays(today, -1);
  let count = 0;
  while (done[toKey(day)]) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}

function longestStreak(done) {
  const days = Object.keys(done).filter((k) => done[k]).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of days) {
    const date = new Date(`${key}T00:00:00`);
    run = prev && toKey(addDays(prev, 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

function pluralDays(n) {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Use the saved choice if there is one, otherwise follow the device setting.
function initialTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [habits, setHabits] = useState(loadHabits);
  const [name, setName] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [theme, setTheme] = useState(initialTheme);
  const [reordering, setReordering] = useState(false);
  // The day circle that was just ticked, so only it plays the check animation.
  const [justChecked, setJustChecked] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
  }, [habits]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#1b1a18' : '#f6f3ee');
  }, [theme]);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
  }

  // A phone tab can stay open past midnight, so refresh "today" whenever the
  // page comes back into view, and once a minute while it's showing.
  const [today, setToday] = useState(startOfToday);
  useEffect(() => {
    const refresh = () =>
      setToday((prev) => {
        const now = startOfToday();
        return toKey(now) === toKey(prev) ? prev : now;
      });
    const timer = setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const todayKey = toKey(today);

  // Seven days ending on today (shifted back by whole weeks when navigating).
  const days = useMemo(() => {
    const end = addDays(today, weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
  }, [today, weekOffset]);

  function addHabit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setHabits((hs) => [
      ...hs,
      {
        // Not crypto.randomUUID(): it's missing on plain-http pages, like a phone on Wi-Fi.
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: trimmed,
        color: COLORS[hs.length % COLORS.length],
        done: {},
      },
    ]);
    setName('');
  }

  function toggle(id, key) {
    const habit = habits.find((h) => h.id === id);
    if (!habit.done[key]) {
      // Only celebrate checking, not unchecking.
      setJustChecked(`${id}:${key}`);
      navigator.vibrate?.(12);
    }
    setHabits((hs) =>
      hs.map((h) => {
        if (h.id !== id) return h;
        const done = { ...h.done };
        if (done[key]) delete done[key];
        else done[key] = true;
        return { ...h, done };
      })
    );
  }

  function rename(id) {
    const habit = habits.find((h) => h.id === id);
    const next = prompt('Rename habit', habit.name)?.trim();
    if (!next) return;
    setHabits((hs) => hs.map((h) => (h.id === id ? { ...h, name: next } : h)));
  }

  function remove(id) {
    const habit = habits.find((h) => h.id === id);
    if (!confirm(`Delete "${habit.name}" and its history?`)) return;
    setHabits((hs) => hs.filter((h) => h.id !== id));
  }

  function move(index, delta) {
    setHabits((hs) => {
      const target = index + delta;
      if (target < 0 || target >= hs.length) return hs;
      const next = [...hs];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // Backups are plain JSON files, so habits can be recovered if the browser's
  // storage is cleared or the app is opened from a different address.
  function saveBackup() {
    const blob = new Blob([JSON.stringify({ version: 1, habits }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `habits-backup-${todayKey}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function restoreBackup(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const restored = Array.isArray(data) ? data : data.habits;
      const valid =
        Array.isArray(restored) &&
        restored.every((h) => h && typeof h.name === 'string' && h.done && typeof h.done === 'object');
      if (!valid) throw new Error('not a habits backup');
      if (
        habits.length > 0 &&
        !confirm(`Replace your ${habits.length} current habits with the ${restored.length} in this backup?`)
      ) {
        return;
      }
      setHabits(
        restored.map((h, i) => ({
          id: h.id ?? `${Date.now().toString(36)}-${i}`,
          name: h.name,
          color: h.color ?? COLORS[i % COLORS.length],
          done: h.done,
        }))
      );
    } catch {
      alert("That file doesn't look like a habits backup.");
    }
  }

  const doneToday = habits.filter((h) => h.done[todayKey]).length;
  const rangeLabel = `${days[0].toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} – ${days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  return (
    <main className="app">
      <header>
        <div className="top">
          <p className="date">
            {today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <button
            className="theme"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? '☀︎' : '☾'}
          </button>
        </div>
        <h1>Habits</h1>
        {habits.length > 0 && (
          <div className="progress">
            <div className="bar">
              <div
                className="fill"
                style={{ width: `${(doneToday / habits.length) * 100}%` }}
              />
            </div>
            <span className={doneToday === habits.length ? 'all-done' : ''}>
              {doneToday === habits.length
                ? 'All done for today ☾'
                : `${doneToday} of ${habits.length} done today`}
            </span>
          </div>
        )}
      </header>

      <form className="add" onSubmit={addHabit}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a habit, e.g. Read 20 minutes"
          aria-label="New habit name"
        />
        <button type="submit" disabled={!name.trim()}>
          Add
        </button>
      </form>

      {habits.length === 0 ? (
        <p className="empty">Nothing here yet. Start with one small habit.</p>
      ) : reordering ? (
        <>
          <p className="reorder-title">Move habits into the order you like</p>
          <ul className="habits">
            {habits.map((h, i) => (
              <li key={h.id} className="habit reorder-row" style={{ '--c': h.color }}>
                <span className="name">{h.name}</span>
                <div className="arrows">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${h.name} up`}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === habits.length - 1}
                    aria-label={`Move ${h.name} down`}
                  >
                    ↓
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button className="reorder-toggle done" onClick={() => setReordering(false)}>
            Done
          </button>
        </>
      ) : (
        <>
          <div className="week-nav">
            <button onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week">
              ‹
            </button>
            <span>{weekOffset === 0 ? 'This week' : rangeLabel}</span>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              disabled={weekOffset === 0}
              aria-label="Next week"
            >
              ›
            </button>
          </div>

          <ul className="habits">
            {habits.map((h) => {
              const streak = currentStreak(h.done, today);
              const best = longestStreak(h.done);
              return (
                <li key={h.id} className="habit" style={{ '--c': h.color }}>
                  <div className="habit-head">
                    <div>
                      <button className="name" onClick={() => rename(h.id)} title="Rename">
                        {h.name}
                      </button>
                      <div className="streak">
                        {streak > 0 ? `${pluralDays(streak)} in a row` : 'No current streak'}
                        {best > 0 && ` · best ${pluralDays(best)}`}
                        {streak > 0 && !h.done[todayKey] && (
                          <span className="hint"> · check off today to keep it going</span>
                        )}
                      </div>
                    </div>
                    <button className="delete" onClick={() => remove(h.id)} aria-label="Delete">
                      ×
                    </button>
                  </div>

                  <div className="days">
                    {days.map((d) => {
                      const key = toKey(d);
                      const checked = !!h.done[key];
                      const popping = checked && justChecked === `${h.id}:${key}`;
                      return (
                        <button
                          key={key}
                          className={`day${checked ? ' checked' : ''}${key === todayKey ? ' today' : ''}${popping ? ' pop' : ''}`}
                          onClick={() => toggle(h.id, key)}
                          onAnimationEnd={(e) => {
                            // The ripple is the longest part, so clear once it finishes.
                            if (e.animationName === 'ripple') setJustChecked(null);
                          }}
                          aria-pressed={checked}
                          aria-label={`${h.name} on ${key}`}
                        >
                          <span className="dow">
                            {d.toLocaleDateString(undefined, { weekday: 'narrow' })}
                          </span>
                          <span className="circle">
                            {checked ? (
                              <svg className="tick" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M6 12.5l4 4 8-9" />
                              </svg>
                            ) : (
                              d.getDate()
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
          {habits.length > 1 && (
            <button className="reorder-toggle" onClick={() => setReordering(true)}>
              Reorder
            </button>
          )}
        </>
      )}

      <footer className="backup">
        {habits.length > 0 && <button onClick={saveBackup}>Save a backup</button>}
        <label>
          Restore from backup
          <input type="file" accept="application/json,.json" onChange={restoreBackup} hidden />
        </label>
      </footer>
    </main>
  );
}
