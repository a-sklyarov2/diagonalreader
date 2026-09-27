/**
 * Reader preferences persisted in localStorage: summary level
 * (low/high/max), summary voice (faithful/plain) and summary text
 * size. Synchronous reads so views render at the right setting on
 * first paint; changes broadcast to all live views.
 */

import type { Level } from './api';

export type Voice = 'faithful' | 'plain';
export type TextSize = 'small' | 'medium' | 'large';

const VOICE_KEY = 'diagonal_voice';
const TEXT_SIZE_KEY = 'diagonal_text_size';
const LEVEL_KEY = 'diagonal_level';

export const TEXT_SIZES: Record<TextSize, { label: string; px: number }> = {
  small: { label: 'Small', px: 17 },
  medium: { label: 'Medium', px: 21 },
  large: { label: 'Large', px: 25 },
};

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: prefs just don't persist this session.
  }
}

export function readVoice(): Voice {
  return readStored(VOICE_KEY) === 'plain' ? 'plain' : 'faithful';
}

export function readTextSize(): TextSize {
  const stored = readStored(TEXT_SIZE_KEY);
  if (stored === 'small' || stored === 'large') return stored;
  return 'medium';
}

export function getLevel(): Level {
  const stored = readStored(LEVEL_KEY);
  if (stored === 'low' || stored === 'max') return stored;
  return 'high';
}

export function setLevel(level: Level): void {
  writeStored(LEVEL_KEY, level);
  emit();
}

type PrefsListener = () => void;

const listeners = new Set<PrefsListener>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function onPrefsChange(fn: PrefsListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getVoice(): Voice {
  return readVoice();
}

export function setVoice(voice: Voice): void {
  writeStored(VOICE_KEY, voice);
  emit();
}

export function getTextSize(): TextSize {
  return readTextSize();
}

export function setTextSize(size: TextSize): void {
  writeStored(TEXT_SIZE_KEY, size);
  emit();
}
