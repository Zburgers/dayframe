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
    const longest = Math.max(image.naturalWidth, image.naturalHeig