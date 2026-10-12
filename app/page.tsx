Warning: truncated output (original token count: 10832)
Total output lines: 638

"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import { AuthPanel } from "./AuthPanel";
import { completeness, dayMetrics, formatDuration, localDateKey, sevenDayAverage } from "./lib/metrics";
import { withAddedActivity, withRemovedActivity } from "./lib/activity";
import { eraseState, normalizeState, readState } from "./lib/storage";
import { Activity, DayframeState, MealEstimate, MovementDay, emptyState } from "./lib/types";
import { isDayframeBackup, localDateTimeValue, parseMealAmount, parseMealItems, suggestedMealTime, suggestedSleepRange } from "./lib/validation";

type Tab = "today" | "log" | "history" | "settings";
type Notice = { kind: "success" | "error"; message: string } | null;

const number = (value: FormDataEntryValue | null) => Math.max(0, Number(value) || 0);
const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-IN", options).format(new Date(`${date}T12:00:00`));
}

function base64(bytes: Uint8Array): string {
  let result = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)));
  }
  return btoa(result);
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
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
    if (!blob) throw new Error("Could not prepare that photo.");
    if (blob.size > 4_500_000) throw new Error("That photo is still too large after preparation. Choose a smaller image.");
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
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const remoteState = useQuery(api.health.getState, isAuthenticated ? {} : "skip");
  const modelSettings = useQuery(api.modelSettings.getSettings, isAuthenticated ? {} : "skip");
  const syncState = useMutation(api.health.syncState);
  const clearCloudState = useMutation(api.health.clearState);
  const saveModelSelection = useMutation(api.modelSettings.saveSelection);
  const analyzeMealAction = useAction(api.mealAnalysis.analyzeMeal);
  const saveOpenRouterKeyAction = useAction(api.modelSettingsActions.saveOpenRouterKey);
  const removeOpenRouterKeyAction = useAction(api.modelSettingsActions.removeOpenRouterKey);
  const [state, setState] = useState<DayframeState>(emptyState);
  const [loaded, setLoaded] = useState(false);
  const stateRef = useRef<DayframeState>(emptyState);
  const stateReadyRef = useRef(false);
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [tab, setTab] = useState<Tab>("today");
  const [selectedDate, setSelectedDate] = useState(today);
  const [notice, setNotice] = useState<Notice>(null);
  const [healthJson, setHealthJson] = useState("");
  const [mealFile, setMealFile] = useState<File | null>(null);
  const [mealPreview, setMealPreview] = useState<string | null>(null);
  const [mealEstimate, setMealEstimate] = useState<MealEstimate | null>(null);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const photoSelectionId = useRef(0);
  const mealInput = useRef<HTMLInputElement>(null);
  const [mealError, setMealError] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<"openai" | "openrouter">("openai");
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini");
  const [customOpenRouterModel, setCustomOpenRouterModel] = useState("");
  const restoreInput = useRef<HTMLInputElement>(null);
  const migratedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      const resetTimer = window.setTimeout(() => {
        migratedRef.current = false;
        stateReadyRef.current = false;
        stateRef.current = emptyState;
        setLoaded(false);
        setState(emptyState);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }
    if (remoteState === undefined || migratedRef.current) return;
    migratedRef.current = true;
    void (async () => {
      let local = emptyState;
      try {
        local = normalizeState(await readState());
      } catch {
        // A failed local migration read must not turn into an empty cloud write.
      }
      const hasRemote = Boolean(remoteState && (remoteState.sleepSessions.length || remoteState.movementDays.length || remoteState.meals.length));
      const hasLocal = Boolean(local.sleepSessions.length || local.movementDays.length || local.meals.length);
      const next = !hasRemote && hasLocal ? local : (remoteState ?? emptyState);
      stateRef.current = next;
      stateReadyRef.current = true;
      setState(next);
      if (!hasRemote && hasLocal) await syncState({ state: next });
      setLoaded(true);
    })().catch(() => {
      stateReadyRef.current = false;
      setNotice({ kind: "error", message: "Your Convex data could not be opened. No changes have been saved." });
    });
  }, [authLoading, isAuthenticated, remoteState, syncState]);

  useEffect(() => {
    if (!modelSettings) return;
    const settingsTimer = window.setTimeout(() => {
      setSelectedProvider(modelSettings.provider);
      setSelectedModel(modelSettings.model);
      setCustomOpenRouterModel(modelSettings.provider === "openrouter" && !modelSettings.catalog.some((item) => item.provider === "openrouter" && item.model === modelSettings.model) ? modelSettings.model : "");
    }, 0);
    return () => window.clearTimeout(settingsTimer);
  }, [modelSettings]);

  useEffect(() => () => { if (mealPreview) URL.revokeObjectURL(mealPreview); }, [mealPreview]);
  useEffect(() => () => { photoSelectionId.current += 1; }, []);
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

  function updateState(updater: (current: DayframeState) => DayframeState) {
    if (!stateReadyRef.current) return;
    const next = updater(stateRef.current);
    stateRef.current = next;
    setState(next);
    syncQueueRef.current = syncQueueRef.current
      .catch(() => undefined)
      .then(async () => { await syncState({ state: next }); })
      .catch(() => setNotice({ kind: "error", message: "That change could not be saved to Convex. Your current screen may not be synced." }));
  }

  function moveDate(delta: number) {
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() + delta);
    const next = localDateKey(date);
    if (next <= today) setSelectedDate(next);
  }

  function upsertMovement(next: MovementDay) {
    updateState((current) => ({
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
    updateState((current) => {
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
    updateState((current) => ({
      ...current,
      movementDays: current.movementDays.map((day) => day.date === date ? withRemovedActivity(day, activityId, updatedAt) : day),
    }));
    flash("success", "Activity removed.");
  }

  function startSleep() {
    if (openSleep) return;
    updateState((current) => ({ ...current, sleepSessions: [...current.sleepSessions, { id: id(), startedAt: new Date().toISOString(), endedAt: null }] }));
    flash("success", "Sleep timer started. Good night.");
  }

  function finishSleep() {
    if (!openSleep) return;
    const endedAt = new Date().toISOString();
    updateState((current) => ({ ...current, sleepSessions: current.sleepSessions.map((session) => session.id === openSleep.id ? { ...session, endedAt } : session) }));
    setSelectedDate(localDateKey(endedAt));
    flash("success", "Sleep session saved. Morning.");
  }

  function addManualSleep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const start = new Date(String(form.get("sleepStart") ?? ""));
    const end = new Date(String(form.get("sleepEnd") ?? ""));
    const duration = end.getTime() - start.getTime();
    if (!Number.isFinite(duration) || duration <= 0 || duration > 24 * 60 * 60 * 1000) {
      flash("error", "Sleep end must be after the start and within 24 hours.");
      return;
    }
    const startedAt = start.toISOString();
    const endedAt = end.toISOString();
    updateState((current) => ({ ...current, sleepSessions: [...current.sleepSessions, { id: id(), startedAt, endedAt }] }));
    setSelectedDate(localDateKey(endedAt));
    event.currentTarget.reset();
    flash("success", "Sleep session added.");
  }

  function removeSleep(sleepId: string) {
    const session = state.sleepSessions.find((entry) => entry.id === sleepId);
    if (!session || !window.confirm("Remove this recorded sleep session?")) return;
    updateState((current) => ({ ...current, sleepSessions: current.sleepSessions.filter((entry) => entry.id !== sleepId) }));
    flash("success", "Sleep session removed.");
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
    const selection = photoSelectionId.current;
    setAnalyzing(true);
    setMealEstimate(null);
    setMealError("");
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(mealFile.type)) throw new Error("Use a JPEG, PNG, or WebP photo.");
      const estimate = await analyzeMealAction({ imageBase64: base64(new Uint8Array(await mealFile.arrayBuffer())), mimeType: mealFile.type as "image/jpeg" | "image/png" | "image/webp" });
      if (selection === photoSelectionId.current) setMealEstimate(estimate);
    } catch (error) {
      if (selection === photoSelectionId.current) {
        setMealError(error instanceof Error ? error.message : "Photo analysis is unavailable.");
      }
    } finally {
      if (selection === photoSelectionId.current) setAnalyzing(false);
    }
  }

  function editMeal(mealId: string) {
    if (!state.meals.some((meal) => meal.id === mealId)) return;
    photoSelectionId.current += 1;
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
  …1832 tokens truncated…story" ? "▦" : "○"}</span>{item}</button>)}
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
              {state.sleepSessions.filter((session) => session.endedAt && localDateKey(session.endedAt) === selectedDate).map((session) => <div className="entry-row" key={session.id}><span className="entry-icon indigo">Z</span><div><b>Sleep</b><small>{formatDuration(Math.max(0, Math.round((new Date(session.endedAt!).getTime() - new Date(session.startedAt).getTime()) / 60000)))} ending this day</small></div><button className="delete-mini" onClick={() => removeSleep(session.id)} aria-label="Remove sleep session">×</button></div>)}
              {metrics.activities.map((activity) => <div className="entry-row" key={activity.id}><span className="entry-icon lime">M</span><div><b>{activity.name}</b><small>{activity.minutes} min · {activity.calories} active kcal</small></div></div>)}
              {metrics.meals.map((meal) => <div className="entry-row" key={meal.id}><span className="entry-icon coral">F</span><div><b>{meal.name}</b><small>{new Date(meal.eatenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · about {meal.calories} kcal</small></div><button className="secondary-button" onClick={() => editMeal(meal.id)} aria-label={`Edit ${meal.name}`}>Edit</button><button className="delete-mini" onClick={() => removeMeal(meal.id)} aria-label={`Remove ${meal.name}`}>×</button></div>)}
            </div>}
          </section>
        </>}

        {tab === "log" && <section className="log-layout">
          <div className="log-intro"><p className="eyebrow">Log your day</p><h1>Three signals.<br/><em>One honest picture.</em></h1><p>Add what you know. Every field can be corrected later, and your signed-in history stays synced to Convex.</p></div>

          <article className="surface log-card sleep-card"><div className="log-card-title"><span className="entry-icon indigo">Z</span><div><p className="eyebrow">Sleep</p><h2>{openSleep ? "Sleep timer is running" : "Rest, recorded simply"}</h2></div></div>
            <button className="primary-button indigo-button" onClick={openSleep ? finishSleep : startSleep}>{openSleep ? "I’m awake — finish session" : "Going to sleep now"}</button>
            <details><summary>Add or correct times manually</summary><form className="form-grid" key={`sleep-${selectedDate}`} onSubmit={addManualSleep}><label>Went to sleep<input name="sleepStart" type="datetime-local" defaultValue={suggestedSleepRange(selectedDate).start} required /></label><label>Woke up<input name="sleepEnd" type="datetime-local" defaultValue={suggestedSleepRange(selectedDate).end} required /></label><button className="secondary-button" type="submit">Save sleep</button></form></details>
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

        {tab === "settings" && <section className="settings-page"><div className="settings-hero"><p className="eyebrow">Settings and privacy</p><h1>Your data follows<br/><em>your account.</em></h1><p>Health records are persisted in Convex and scoped to your signed-in account, so your history can follow you across devices.</p></div>
          <article className="surface privacy-card"><span className="privacy-icon">⌁</span><div><h2>Synced by design</h2><p>Sleep, movement, meals, and model preferences are saved to Convex. Meal photos are analyzed in memory and never stored by Dayframe.</p></div></article>
          <div className="settings-grid"><article className="surface setting-card"><p className="eyebrow">Portable copy</p><h2>Back up your history</h2><p>Download a human-readable JSON copy of all records and settings.</p><button className="primary-button" onClick={downloadBackup}>Download backup</button></article><article className="surface setting-card"><p className="eyebrow">Move or recover</p><h2>Restore a backup</h2><p>Validate a Dayframe backup before replacing the data on this device.</p><input ref={restoreInput} className="hidden-input" type="file" accept="application/json" onChange={restoreBackup}/><button className="secondary-button" onClick={() => restoreInput.current?.click()}>Choose backup file</button></article></div>
          <article className="surface api-key-card"><div><p className="eyebrow">Photo estimates</p><h2>Choose a vision model</h2><p>Free OpenRouter vision models are first. They still use your OpenRouter key, which Dayframe encrypts before saving to your account. Hosted OpenAI is optional.</p></div><form className="model-settings-form" onSubmit={saveVisionSettings}><label>Provider<select value={selectedProvider} onChange={(event) => { const nextProvider = event.target.value as "openai" | "openrouter"; const nextModel = (modelSettings?.catalog ?? []).find((item) => item.provider === nextProvider)?.model ?? ""; setSelectedProvider(nextProvider); setSelectedModel(nextModel); setCustomOpenRouterModel(""); }}><option value="openrouter">OpenRouter (free first)</option><option value="openai">OpenAI (hosted)</option></select></label><label>Model<select value={customOpenRouterModel ? "__custom__" : selectedModel} onChange={(event) => { if (event.target.value === "__custom__") { setSelectedModel(""); setCustomOpenRouterModel(""); } else { setSelectedModel(event.target.value); setCustomOpenRouterModel(""); } }}>{(modelSettings?.catalog ?? []).filter((item) => item.provider === selectedProvider).map((item) => <option key={`${item.provider}-${item.model}`} value={item.model}>{item.label}</option>)}{selectedProvider === "openrouter" && <option value="__custom__">Custom OpenRouter model ID…</option>}</select></label>{selectedProvider === "openrouter" && (customOpenRouterModel !== "" || !selectedModel) && <label>Custom OpenRouter model ID<input value={customOpenRouterModel} onChange={(event) => setCustomOpenRouterModel(event.target.value)} placeholder="provider/model-name" /></label>}<button className="primary-button" type="submit">Save vision settings</button></form><div className="provider-key-row">{modelSettings?.openRouterConfigured ? <><p>OpenRouter key connected · ends in <b>…{modelSettings.openRouterKeyLast4}</b></p><button className="secondary-button" type="button" onClick={removeOpenRouterKey}>Remove key</button></> : <form onSubmit={saveOpenRouterKey}><label>OpenRouter API key<input name="openRouterApiKey" type="password" autoComplete="off" placeholder="sk-or-v1-…" required /></label><button className="secondary-button" type="submit">Encrypt and save key</button></form>}</div></article>
          <article className="surface danger-card"><div><p className="eyebrow">Danger zone</p><h2>Erase synced history</h2><p>Deletes every Dayframe health record from your Convex account. Export a backup first if you may want it later.</p></div><button onClick={eraseEverything}>Erase everything</button></article>
          <footer><b>Dayframe</b><p>A personal journal for patterns—not a medical device.</p></footer>
        </section>}
      </div>
    </main>
  );
}
