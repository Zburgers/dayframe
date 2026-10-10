"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { completeness, dayMetrics, formatDuration, localDateKey, sevenDayAverage } from "./lib/metrics";
import { withAddedActivity, withRemovedActivity } from "./lib/activity";
import { eraseState, normalizeState, readOpenAIKey, readState, writeOpenAIKey, writeState } from "./lib/storage";
import { Activity, DayframeState, MealEstimate, MovementDay, emptyState } from "./lib/types";
import { isDayframeBackup, localDateTimeValue, parseMealAmount, parseMealItems, suggestedMealTime } from "./lib/validation";

type Tab = "today" | "log" | "history" | "settings";
type Notice = { kind: "success" | "error"; message: string } | null;

const number = (value: FormDataEntryValue | null) => Math.max(0, Number(value) || 0);
const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-IN", options).format(new Date(`${date}T12:00:00`));
}

function dateTimeInput(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

async function normalizeMealImage(file: File): Promise<File> {
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose a photo smaller than 12 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = document.createElement("img");
    image.src = objectUrl;
    await image.decode();
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = longest > 1600 ? 1600 / longest : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
    if (!blob) throw new Error("Could not prepare that photo.");
    return new File([blob], "meal.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-orb" aria-hidden="true" />
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function Heatmap({ state, onSelect }: { state: DayframeState; onSelect: (date: string) => void }) {
  const days = useMemo(() => {
    const anchor = new Date();
    anchor.setHours(12, 0, 0, 0);
    const result: { date: string; score: number }[] = [];
    for (let offset = 83; offset >= 0; offset -= 1) {
      const day = new Date(anchor);
      day.setDate(anchor.getDate() - offset);
      const date = localDateKey(day);
      result.push({ date, score: completeness(state, date) });
    }
    return result;
  }, [state]);

  return (
    <div className="heatmap-wrap">
      <div className="heatmap" role="grid" aria-label="Twelve week logging consistency">
        {days.map((day) => (
          <button
            key={day.date}
            className={`heat-cell heat-${day.score}`}
            onClick={() => onSelect(day.date)}
            title={`${dateLabel(day.date, { month: "short", day: "numeric" })}: ${day.score} of 3 areas logged`}
            aria-label={`${dateLabel(day.date)}. ${day.score} of 3 areas logged`}
          />
        ))}
      </div>
      <div className="heat-legend"><span>Less</span><i className="heat-0" /><i className="heat-1" /><i className="heat-2" /><i className="heat-3" /><span>Complete</span></div>
    </div>
  );
}

export default function Home() {
  const today = localDateKey(new Date());
  const [state, setState] = useState<DayframeState>(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [selectedDate, setSelectedDate] = useState(today);
  const [notice, setNotice] = useState<Notice>(null);
  const [healthJson, setHealthJson] = useState("");
  const [mealFile, setMealFile] = useState<File | null>(null);
  const [mealPreview, setMealPreview] = useState<string | null>(null);
  const [mealEstimate, setMealEstimate] = useState<MealEstimate | null>(null);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const mealRequest = useRef<AbortController | null>(null);
  const photoSelectionId = useRef(0);
  const mealInput = useRef<HTMLInputElement>(null);
  const [mealError, setMealError] = useState("");
  const [openAIKey, setOpenAIKey] = useState("");
  const [keyConfigured, setKeyConfigured] = useState(false);
  const restoreInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([readState(), readOpenAIKey()])
      .then(([stored, savedKey]) => { setState(stored); setOpenAIKey(savedKey); setKeyConfigured(Boolean(savedKey)); })
      .catch(() => setNotice({ kind: "error", message: "Local storage could not be opened." }))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    writeState(state).catch(() => setNotice({ kind: "error", message: "A change could not be saved on this device." }));
  }, [state, loaded]);

  useEffect(() => () => { if (mealPreview) URL.revokeObjectURL(mealPreview); }, [mealPreview]);
  useEffect(() => () => mealRequest.current?.abort(), []);
  useEffect(() => {
    if (tab === "log" && editingMealId) document.getElementById("food-log")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [tab, editingMealId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("health");
    if (encoded) {
      window.setTimeout(() => {
        setHealthJson(encoded);
        setTab("log");
      }, 0);
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const metrics = useMemo(() => dayMetrics(state, selectedDate), [state, selectedDate]);
  const editingMeal = state.meals.find((meal) => meal.id === editingMealId) ?? null;
  const openSleep = state.sleepSessions.find((session) => !session.endedAt);
  const averageSleep = sevenDayAverage(state, selectedDate, "sleep");
  const averageSteps = sevenDayAverage(state, selectedDate, "steps");
  const averageCalories = sevenDayAverage(state, selectedDate, "calories");

  function flash(kind: "success" | "error", message: string) {
    setNotice({ kind, message });
    window.setTimeout(() => setNotice(null), 4200);
  }

  function moveDate(delta: number) {
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() + delta);
    const next = localDateKey(date);
    if (next <= today) setSelectedDate(next);
  }

  function upsertMovement(next: MovementDay) {
    setState((current) => ({
      ...current,
      movementDays: [...current.movementDays.filter((day) => day.date !== next.date), next],
    }));
  }

  function saveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const existing = state.movementDays.find((day) => day.date === selectedDate);
    upsertMovement({
      date: selectedDate,
      steps: Math.round(number(form.get("steps"))),
      activeCalories: Math.round(number(form.get("activeCalories"))),
      exerciseMinutes: Math.round(number(form.get("exerciseMinutes"))),
      source: "manual",
      activities: existing?.activities ?? [],
      updatedAt: new Date().toISOString(),
    });
    flash("success", "Movement totals saved on this device.");
  }

  function addActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("activityName") ?? "").trim();
    if (!name) return;
    const activity: Activity = { id: id(), name, minutes: Math.round(number(form.get("activityMinutes"))), calories: Math.round(number(form.get("activityCalories"))) };
    const date = selectedDate;
    const updatedAt = new Date().toISOString();
    setState((current) => {
      const existing = current.movementDays.find((day) => day.date === date);
      const next = withAddedActivity(existing, date, activity, updatedAt);
      return { ...current, movementDays: [...current.movementDays.filter((day) => day.date !== date), next] };
    });
    event.currentTarget.reset();
    flash("success", `${name} added.`);
  }

  function removeActivity(activityId: string) {
    const activity = metrics.activities.find((item) => item.id === activityId);
    if (!activity || !window.confirm(`Remove "${activity.name}" from this day?`)) return;
    const date = selectedDate;
    const updatedAt = new Date().toISOString();
    setState((current) => ({
      ...current,
      movementDays: current.movementDays.map((day) => day.date === date ? withRemovedActivity(day, activityId, updatedAt) : day),
    }));
    flash("success", "Activity removed.");
  }

  function startSleep() {
    if (openSleep) return;
    setState((current) => ({ ...current, sleepSessions: [...current.sleepSessions, { id: id(), startedAt: new Date().toISOString(), endedAt: null }] }));
    flash("success", "Sleep timer started. Good night.");
  }

  function finishSleep() {
    if (!openSleep) return;
    const endedAt = new Date().toISOString();
    setState((current) => ({ ...current, sleepSessions: current.sleepSessions.map((session) => session.id === openSleep.id ? { ...session, endedAt } : session) }));
    setSelectedDate(localDateKey(endedAt));
    flash("success", "Sleep session saved. Morning.");
  }

  function addManualSleep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startedAt = new Date(String(form.get("sleepStart"))).toISOString();
    const endedAt = new Date(String(form.get("sleepEnd"))).toISOString();
    if (new Date(endedAt) <= new Date(startedAt) || new Date(endedAt).getTime() - new Date(startedAt).getTime() > 24 * 60 * 60 * 1000) {
      flash("error", "Sleep end must be after the start and within 24 hours.");
      return;
    }
    setState((current) => ({ ...current, sleepSessions: [...current.sleepSessions, { id: id(), startedAt, endedAt }] }));
    setSelectedDate(localDateKey(endedAt));
    event.currentTarget.reset();
    flash("success", "Sleep session added.");
  }

  function importHealth() {
    try {
      const parsed = JSON.parse(healthJson) as Record<string, unknown>;
      if (parsed.version !== 1 || typeof parsed.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) throw new Error("Unsupported payload");
      const activities = Array.isArray(parsed.activities) ? parsed.activities.map((value) => {
        const activity = value as Record<string, unknown>;
        return { id: id(), name: String(activity.name || "Workout").slice(0, 60), minutes: Math.round(Math.max(0, Number(activity.minutes) || 0)), calories: Math.round(Math.max(0, Number(activity.calories) || 0)) };
      }).slice(0, 30) : [];
      const day: MovementDay = {
        date: parsed.date,
        steps: Math.round(Math.min(200_000, Math.max(0, Number(parsed.steps) || 0))),
        activeCalories: Math.round(Math.min(10_000, Math.max(0, Number(parsed.activeCalories) || 0))),
        exerciseMinutes: Math.round(Math.min(1_440, Math.max(0, Number(parsed.exerciseMinutes) || 0))),
        source: "apple-health-shortcut",
        activities,
        updatedAt: new Date().toISOString(),
      };
      upsertMovement(day);
      setSelectedDate(day.date);
      setHealthJson("");
      flash("success", `Apple Health summary imported for ${dateLabel(day.date, { month: "short", day: "numeric" })}.`);
    } catch {
      flash("error", "That Apple Health JSON does not match the supported format.");
    }
  }

  async function selectMealPhoto(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    event.target.value = "";
    const selection = ++photoSelectionId.current;
    mealRequest.current?.abort();
    mealRequest.current = null;
    setAnalyzing(false);
    setMealFile(null);
    setMealPreview(null);
    setMealEstimate(null);
    setMealError("");
    try {
      const prepared = await normalizeMealImage(selected);
      if (selection !== photoSelectionId.current) return;
      setMealFile(prepared);
      setMealPreview(URL.createObjectURL(prepared));
    } catch (error) {
      if (selection === photoSelectionId.current) {
        setMealError(error instanceof Error ? error.message : "That image could not be read.");
      }
    }
  }

  async function analyzeMeal() {
    if (!mealFile) return;
    mealRequest.current?.abort();
    const controller = new AbortController();
    mealRequest.current = controller;
    setAnalyzing(true);
    setMealEstimate(null);
    setMealError("");
    try {
      const form = new FormData();
      form.append("image", mealFile);
      const response = await fetch("/api/analyze-meal", {
        method: "POST",
        headers: openAIKey ? { "x-dayframe-openai-key": openAIKey } : undefined,
        body: form,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({ error: "The analysis service did not return a valid response." })) as { estimate?: MealEstimate; error?: string };
      if (controller.signal.aborted) return;
      if (!response.ok || !payload.estimate) throw new Error(payload.error || "Could not analyze that photo.");
      setMealEstimate(payload.estimate);
    } catch (error) {
      if (!controller.signal.aborted) {
        setMealError(error instanceof Error ? error.message : "Photo analysis is unavailable.");
      }
    } finally {
      if (mealRequest.current === controller) {
        mealRequest.current = null;
        setAnalyzing(false);
      }
    }
  }

  function editMeal(mealId: string) {
    if (!state.meals.some((meal) => meal.id === mealId)) return;
    photoSelectionId.current += 1;
    mealRequest.current?.abort();
    mealRequest.current = null;
    setAnalyzing(false);
    setMealFile(null);
    setMealPreview(null);
    setMealEstimate(null);
    setMealError("");
    setEditingMealId(mealId);
    setTab("log");
  }

  function cancelMealEdit() {
    photoSelectionId.current += 1;
    mealRequest.current?.abort();
    mealRequest.current = null;
    setAnalyzing(false);
    setEditingMealId(null);
    setMealEstimate(null);
    setMealFile(null);
    setMealPreview(null);
    setMealError("");
    if (mealInput.current) mealInput.current.value = "";
  }

  function saveMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("mealName") ?? "").trim();
    const eatenAtRaw = String(form.get("eatenAt") ?? "");
    const eatenAtDate = new Date(eatenAtRaw);
    const calories = parseMealAmount(form.get("mealCalories"), 5000, true);
    const proteinGrams = parseMealAmount(form.get("mealProtein"), 500);
    const carbsGrams = parseMealAmount(form.get("mealCarbs"), 800);
    const fatGrams = parseMealAmount(form.get("mealFat"), 500);
    if (!name || !Number.isFinite(eatenAtDate.getTime()) ||
        calories === null || proteinGrams === null || carbsGrams === null || fatGrams === null) {
      flash("error", "Enter a valid meal name, date, calories, and nonnegative macros.");
      return;
    }
    const previous = editingMeal;
    const updated = {
      id: previous?.id ?? id(), eatenAt: eatenAtDate.toISOString(), name: name.slice(0, 100),
      calories: Math.round(calories), proteinGrams, carbsGrams, fatGrams,
      source: mealEstimate ? "photo-estimate" as const : previous?.source ?? "manual" as const,
      confidence: mealEstimate?.confidence ?? previous?.confidence,
      items: parseMealItems(form.get("mealItems")),
      note: String(form.get("mealNote") ?? "").trim().slice(0, 500),
    };
    setState((current) => ({
      ...current,
      meals: previous
        ? current.meals.map((meal) => meal.id === previous.id ? updated : meal)
        : [...current.meals, updated],
    }));
    photoSelectionId.current += 1;
    mealRequest.current?.abort();
    mealRequest.current = null;
    setAnalyzing(false);
    setMealPreview(null);
    setMealFile(null);
    setMealEstimate(null);
    setMealError("");
    setEditingMealId(null);
    setSelectedDate(localDateKey(updated.eatenAt));
    if (mealInput.current) mealInput.current.value = "";
    event.currentTarget.reset();
    flash("success", `${name} ${previous ? "updated" : "saved"} on this device.`);
  }

  function removeMeal(mealId: string) {
    const meal = state.meals.find((item) => item.id === mealId);
    if (!meal || !window.confirm(`Remove "${meal.name}" from your journal?`)) return;
    setState((current) => ({ ...current, meals: current.meals.filter((item) => item.id !== mealId) }));
    if (editingMealId === mealId) cancelMealEdit();
    flash("success", "Meal removed.");
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `dayframe-backup-${today}.json`; link.click();
    URL.revokeObjectURL(url);
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isDayframeBackup(parsed)) throw new Error("Invalid backup");
      const restored = normalizeState(parsed);
      if (!window.confirm("Replace all current Dayframe data with this backup?")) return;
      setState(restored);
      flash("success", "Backup restored on this device.");
    } catch {
      flash("error", "That file is not a valid Dayframe backup.");
    } finally { event.target.value = ""; }
  }

  async function eraseEverything() {
    if (!window.confirm("Erase every sleep, movement, and meal record stored by Dayframe on this device? This cannot be undone without a backup.")) return;
    try {
      await eraseState();
      setState(emptyState);
      setOpenAIKey("");
      setKeyConfigured(false);
      flash("success", "All Dayframe data and the saved photo-analysis key were erased on this device.");
    } catch (error) { flash("error", error instanceof Error ? error.message : "Data could not be erased."); }
  }

  async function saveApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("openaiKey") ?? "").trim();
    if (!value.startsWith("sk-") || value.length < 20) {
      flash("error", "Enter a valid OpenAI API key beginning with sk-.");
      return;
    }
    try {
      await writeOpenAIKey(value);
      setOpenAIKey(value);
      setKeyConfigured(true);
      event.currentTarget.reset();
      flash("success", "Photo estimates are configured on this device.");
    } catch { flash("error", "The key could not be saved on this device."); }
  }

  async function removeApiKey() {
    await writeOpenAIKey("");
    setOpenAIKey("");
    setKeyConfigured(false);
    flash("success", "The local API key was removed.");
  }

  const debrief = (() => {
    const parts: string[] = [];
    if (metrics.sleepMinutes) parts.push(`You logged ${formatDuration(metrics.sleepMinutes)} of sleep`); else parts.push("Sleep is not logged yet");
    if (metrics.steps) parts.push(`${metrics.steps.toLocaleString("en-IN")} steps`); else if (metrics.activities.length) parts.push(`${metrics.exerciseMinutes} active minutes`); else parts.push("movement is still open");
    if (metrics.meals.length) parts.push(`${metrics.meals.length} meal${metrics.meals.length === 1 ? "" : "s"} totalling about ${metrics.caloriesIn.toLocaleString("en-IN")} kcal`); else parts.push("food is not logged yet");
    return `${parts[0]}. ${parts[1][0].toUpperCase()}${parts[1].slice(1)}, and ${parts[2]}.`;
  })();

  if (!loaded) return <main className="loading-screen"><div className="brand-mark">D</div><p>Opening your day…</p></main>;

  return (
    <main className="app-shell">
      {notice && <div className={`notice notice-${notice.kind}`} role="status">{notice.message}</div>}
      <header className="topbar">
        <button className="brand" onClick={() => setTab("today")} aria-label="Open today"><span className="brand-mark">D</span><span><b>Dayframe</b><small>Private daily health</small></span></button>
        <div className="local-badge"><i /> On this device</div>
      </header>

      <nav className="primary-nav" aria-label="Main navigation">
        {(["today", "log", "history", "settings"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}><span>{item === "today" ? "◉" : item === "log" ? "+" : item === "history" ? "▦" : "○"}</span>{item}</button>)}
      </nav>

      <div className="page-wrap">
        {tab !== "settings" && <section className="date-rail" aria-label="Selected day">
          <button onClick={() => moveDate(-1)} aria-label="Previous day">←</button>
          <div><small>{selectedDate === today ? "Today" : dateLabel(selectedDate, { weekday: "long" })}</small><strong>{dateLabel(selectedDate, { month: "long", day: "numeric", year: "numeric" })}</strong></div>
          <button onClick={() => moveDate(1)} disabled={selectedDate >= today} aria-label="Next day">→</button>
        </section>}

        {tab === "today" && <>
          <section className="hero-copy"><p className="eyebrow">Daily frame · {completeness(state, selectedDate)}/3 logged</p><h1>Your day,<br/><em>in frame.</em></h1><p>{debrief}</p></section>

          <section className="metrics-grid" aria-label="Daily totals">
            <MetricCard label="Sleep" value={formatDuration(metrics.sleepMinutes)} detail={averageSleep ? `${formatDuration(averageSleep)} 7-day avg` : "Tap to add tonight"} tone="indigo" />
            <MetricCard label="Steps" value={metrics.steps ? metrics.steps.toLocaleString("en-IN") : "—"} detail={averageSteps ? `${averageSteps.toLocaleString("en-IN")} 7-day avg` : "No movement logged"} tone="lime" />
            <MetricCard label="Food" value={metrics.caloriesIn ? `${metrics.caloriesIn.toLocaleString("en-IN")} kcal` : "—"} detail={averageCalories ? `${averageCalories.toLocaleString("en-IN")} kcal 7-day avg` : "No meals logged"} tone="coral" />
            <MetricCard label="Active energy" value={metrics.activeCalories ? `${metrics.activeCalories.toLocaleString("en-IN")} kcal` : "—"} detail={`${metrics.exerciseMinutes || 0} exercise min`} tone="amber" />
          </section>

          <section className="quick-panel">
            <div><p className="eyebrow">Quick log</p><h2>What happened?</h2></div>
            <div className="quick-actions">
              <button onClick={openSleep ? finishSleep : startSleep}><span className="action-dot indigo" />{openSleep ? "I’m awake" : "Going to sleep"}<small>{openSleep ? `Started ${new Date(openSleep.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Starts a timer"}</small></button>
              <button onClick={() => setTab("log")}><span className="action-dot coral" />Log a meal<small>Camera or manual</small></button>
              <button onClick={() => setTab("log")}><span className="action-dot lime" />Add movement<small>Steps or activity</small></button>
            </div>
          </section>

          <section className="split-grid">
            <article className="surface debrief-card"><div className="section-heading"><div><p className="eyebrow">Day-on-day debrief</p><h2>A clean read, no judgement.</h2></div><span className="score-pill">{completeness(state, selectedDate)}/3</span></div><p className="debrief-text">{debrief}</p><div className="mini-comparison"><span><b>{formatDuration(metrics.sleepMinutes)}</b> sleep</span><span><b>{metrics.exerciseMinutes}m</b> moving</span><span><b>{metrics.protein ? `${Math.round(metrics.protein)}g` : "—"}</b> protein</span></div></article>
            <article className="surface"><div className="section-heading"><div><p className="eyebrow">84-day rhythm</p><h2>Consistency, not perfection.</h2></div></div><Heatmap state={state} onSelect={(date) => { setSelectedDate(date); setTab("today"); }} /></article>
          </section>

          <section className="surface timeline"><div className="section-heading"><div><p className="eyebrow">Recorded today</p><h2>Your entries</h2></div><button className="text-button" onClick={() => setTab("log")}>Add entry</button></div>
            {metrics.meals.length === 0 && metrics.activities.length === 0 && !metrics.sleepMinutes ? <div className="empty-state"><span>○</span><p>Nothing logged for this date yet.</p><button onClick={() => setTab("log")}>Log the first thing</button></div> : <div className="entry-list">
              {metrics.sleepMinutes > 0 && <div className="entry-row"><span className="entry-icon indigo">Z</span><div><b>Sleep</b><small>{formatDuration(metrics.sleepMinutes)} ending this day</small></div></div>}
              {metrics.activities.map((activity) => <div className="entry-row" key={activity.id}><span className="entry-icon lime">M</span><div><b>{activity.name}</b><small>{activity.minutes} min · {activity.calories} active kcal</small></div></div>)}
              {metrics.meals.map((meal) => <div className="entry-row" key={meal.id}><span className="entry-icon coral">F</span><div><b>{meal.name}</b><small>{new Date(meal.eatenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · about {meal.calories} kcal</small></div><button className="secondary-button" onClick={() => editMeal(meal.id)} aria-label={`Edit ${meal.name}`}>Edit</button><button className="delete-mini" onClick={() => removeMeal(meal.id)} aria-label={`Remove ${meal.name}`}>×</button></div>)}
            </div>}
          </section>
        </>}

        {tab === "log" && <section className="log-layout">
          <div className="log-intro"><p className="eyebrow">Log your day</p><h1>Three signals.<br/><em>One honest picture.</em></h1><p>Add what you know. Every field can be corrected later, and nothing in your history leaves this device.</p></div>

          <article className="surface log-card sleep-card"><div className="log-card-title"><span className="entry-icon indigo">Z</span><div><p className="eyebrow">Sleep</p><h2>{openSleep ? "Sleep timer is running" : "Rest, recorded simply"}</h2></div></div>
            <button className="primary-button indigo-button" onClick={openSleep ? finishSleep : startSleep}>{openSleep ? "I’m awake — finish session" : "Going to sleep now"}</button>
            <details><summary>Add or correct times manually</summary><form className="form-grid" onSubmit={addManualSleep}><label>Went to sleep<input name="sleepStart" type="datetime-local" defaultValue={dateTimeInput(new Date(`${selectedDate}T23:00:00`))} required /></label><label>Woke up<input name="sleepEnd" type="datetime-local" defaultValue={dateTimeInput(new Date(new Date(`${selectedDate}T07:00:00`).getTime() + (selectedDate === today ? 0 : 86_400_000)))} required /></label><button className="secondary-button" type="submit">Save sleep</button></form></details>
          </article>

          <article className="surface log-card movement-card"><div className="log-card-title"><span className="entry-icon lime">M</span><div><p className="eyebrow">Movement</p><h2>Totals and activities</h2></div></div>
            <form className="form-grid three" key={selectedDate} onSubmit={saveMovement}><label>Steps<input name="steps" type="number" min="0" max="200000" defaultValue={metrics.steps || ""} placeholder="8,000" /></label><label>Active kcal<input name="activeCalories" type="number" min="0" max="10000" defaultValue={metrics.activeCalories || ""} placeholder="420" /></label><label>Exercise min<input name="exerciseMinutes" type="number" min="0" max="1440" defaultValue={metrics.exerciseMinutes || ""} placeholder="45" /></label><button className="primary-button lime-button" type="submit">Save daily totals</button></form>
            <div className="form-divider"><span>or add an activity</span></div>
            <form className="activity-form" onSubmit={addActivity}><label>Activity<input name="activityName" placeholder="Walk, gym, football…" required /></label><label>Minutes<input name="activityMinutes" type="number" min="0" max="1440" placeholder="30" /></label><label>Active kcal<input name="activityCalories" type="number" min="0" max="5000" placeholder="180" /></label><button className="secondary-button" type="submit">Add activity</button></form>
            {metrics.activities.length > 0 && <div className="chips">{metrics.activities.map((activity) => <span key={activity.id}>{activity.name} · {activity.minutes}m <button type="button" onClick={() => removeActivity(activity.id)} aria-label={`Remove ${activity.name}`} title={`Remove ${activity.name}`}>×</button></span>)}</div>}
            <details className="health-import"><summary>Import an Apple Health summary</summary><p>Paste the JSON created by your iPhone Shortcut. Importing the same date replaces its previous totals.</p><textarea value={healthJson} onChange={(event) => setHealthJson(event.target.value)} placeholder={'{"version":1,"date":"2026-08-04","steps":8421,"activeCalories":516,"exerciseMinutes":48,"activities":[]}'}/><button className="secondary-button" disabled={!healthJson.trim()} onClick={importHealth}>Validate and import</button></details>
          </article>

          <article id="food-log" className="surface log-card meal-card"><div className="log-card-title"><span className="entry-icon coral">F</span><div><p className="eyebrow">Food</p><h2>{editingMeal ? "Edit recorded meal" : "Photo estimate or manual log"}</h2></div></div>
            {editingMeal && <button className="secondary-button" type="button" onClick={cancelMealEdit}>Cancel editing</button>}
            <div className={`photo-zone ${mealPreview ? "has-photo" : ""}`}>
              {/* The source is a short-lived local object URL, so Next image optimization is intentionally not used. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {mealPreview ? <img src={mealPreview} alt="Selected meal preview" /> : <><span>＋</span><b>Take a meal photo</b><small>Processed for an estimate, never saved</small></>}
              <input ref={mealInput} aria-label="Take or choose a meal photo" type="file" accept="image/*" capture="environment" onChange={selectMealPhoto} />
            </div>
            {mealPreview && <button className="primary-button coral-button" type="button" disabled={analyzing} onClick={analyzeMeal}>{analyzing ? "Estimating your meal…" : "Estimate calories from photo"}</button>}
            {mealError && <p className="inline-error">{mealError}</p>}
            <p className="privacy-line"><span>✓</span> Photo bytes are discarded after this request. Review every estimate before saving.</p>
            <div className="form-divider"><span>{mealEstimate ? "Review the estimate" : "meal details"}</span></div>
            <form className="form-grid meal-form" onSubmit={saveMeal} key={`${selectedDate}-${editingMeal?.id ?? "new"}-${mealEstimate ? JSON.stringify(mealEstimate) : "manual"}`}>
              <label className="wide">Meal name<input name="mealName" defaultValue={mealEstimate?.name ?? editingMeal?.name ?? ""} placeholder="Paneer rice bowl" maxLength={100} required /></label>
              <label>Time<input name="eatenAt" type="datetime-local" defaultValue={editingMeal ? localDateTimeValue(editingMeal.eatenAt) : suggestedMealTime(selectedDate)} required /></label>
              <label>Calories<input name="mealCalories" type="number" min="0" max="5000" defaultValue={mealEstimate?.calories ?? editingMeal?.calories ?? ""} placeholder="650" required /></label>
              <label>Protein (g)<input name="mealProtein" type="number" min="0" max="500" step="0.1" defaultValue={mealEstimate?.proteinGrams ?? editingMeal?.proteinGrams ?? ""} /></label>
              <label>Carbs (g)<input name="mealCarbs" type="number" min="0" max="800" step="0.1" defaultValue={mealEstimate?.carbsGrams ?? editingMeal?.carbsGrams ?? ""} /></label>
              <label>Fat (g)<input name="mealFat" type="number" min="0" max="500" step="0.1" defaultValue={mealEstimate?.fatGrams ?? editingMeal?.fatGrams ?? ""} /></label>
              <label className="wide">Food items (comma separated)<input name="mealItems" maxLength={800} defaultValue={mealEstimate?.items.join(", ") ?? editingMeal?.items?.join(", ") ?? ""} placeholder="Rice, paneer, vegetables" /></label>
              <label className="wide">Notes and estimate uncertainty<textarea name="mealNote" maxLength={500} defaultValue={mealEstimate?.note ?? editingMeal?.note ?? ""} placeholder="Portion details, sauces, or anything to remember" /></label>
              {mealEstimate && <div className="estimate-note wide"><b>{mealEstimate.confidence} confidence</b><p>{mealEstimate.note}</p>{mealEstimate.items.length > 0 && <small>{mealEstimate.items.join(" · ")}</small>}</div>}
              <button className="primary-button coral-button" type="submit">{editingMeal ? "Update meal" : "Save meal"} and discard photo</button>
            </form>
          </article>
        </section>}

        {tab === "history" && <section className="history-page"><div className="history-hero"><p className="eyebrow">Your recent rhythm</p><h1>Look back without<br/><em>keeping score.</em></h1></div><article className="surface history-heat"><Heatmap state={state} onSelect={(date) => { setSelectedDate(date); setTab("today"); }} /></article><div className="day-list">{Array.from({ length: 14 }, (_, offset) => { const day = new Date(); day.setDate(day.getDate() - offset); const date = localDateKey(day); const values = dayMetrics(state, date); return <button key={date} onClick={() => { setSelectedDate(date); setTab("today"); }}><time>{dateLabel(date, { weekday: "short", month: "short", day: "numeric" })}</time><span><b>{formatDuration(values.sleepMinutes)}</b> sleep</span><span><b>{values.steps ? values.steps.toLocaleString("en-IN") : "—"}</b> steps</span><span><b>{values.caloriesIn ? `${values.caloriesIn} kcal` : "—"}</b> food</span><i className={`heat-${completeness(state, date)}`} /></button>; })}</div></section>}

        {tab === "settings" && <section className="settings-page"><div className="settings-hero"><p className="eyebrow">Settings and privacy</p><h1>Your data belongs<br/><em>to this device.</em></h1><p>Dayframe has no account database. Back up occasionally so browser cleanup or a new phone does not erase your history.</p></div>
          <article className="surface privacy-card"><span className="privacy-icon">⌁</span><div><h2>Local by design</h2><p>Sleep, movement, and meals are saved in this browser’s IndexedDB. Meal photos are never added to it.</p></div></article>
          <div className="settings-grid"><article className="surface setting-card"><p className="eyebrow">Portable copy</p><h2>Back up your history</h2><p>Download a human-readable JSON copy of all records and settings.</p><button className="primary-button" onClick={downloadBackup}>Download backup</button></article><article className="surface setting-card"><p className="eyebrow">Move or recover</p><h2>Restore a backup</h2><p>Validate a Dayframe backup before replacing the data on this device.</p><input ref={restoreInput} className="hidden-input" type="file" accept="application/json" onChange={restoreBackup}/><button className="secondary-button" onClick={() => restoreInput.current?.click()}>Choose backup file</button></article></div>
          <article className="surface api-key-card"><div><p className="eyebrow">Photo estimates</p><h2>{keyConfigured ? "Vision is configured" : "Connect your own API key"}</h2><p>{keyConfigured ? "Your key is stored separately in this browser and excluded from backups." : "A project-specific OpenAI API key enables meal-photo estimates. API usage is billed separately from ChatGPT."}</p></div>{keyConfigured ? <button className="secondary-button" onClick={removeApiKey}>Remove local key</button> : <form onSubmit={saveApiKey}><label>OpenAI API key<input name="openaiKey" type="password" autoComplete="off" placeholder="sk-proj-…" required /></label><button className="primary-button" type="submit">Save on this device</button></form>}</article>
          <article className="surface danger-card"><div><p className="eyebrow">Danger zone</p><h2>Erase local history</h2><p>Deletes every Dayframe record stored in this browser. Export a backup first if you may want it later.</p></div><button onClick={eraseEverything}>Erase everything</button></article>
          <footer><b>Dayframe</b><p>A personal journal for patterns—not a medical device.</p></footer>
        </section>}
      </div>
    </main>
  );
}
