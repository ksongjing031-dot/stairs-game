// =====================================================
// settings.js  ―― 設定（キー配置・音量）の管理
//   ・ログイン中：Firestore の settings/{ユーザーID} に保存（別の端末でも同じ設定）
//   ・ゲスト   ：このブラウザ（localStorage）に保存
// =====================================================
import { loadSettings, saveSettings } from "./firebase.js";

export const DEFAULTS = {
  keyLeft: "ArrowLeft",   // 左上へ登るキー（KeyboardEvent.code の値）
  keyRight: "ArrowRight", // 右上へ登るキー
  seVolume: 0.7,          // 効果音の音量 0〜1
  bgmVolume: 0.4,         // BGMの音量 0〜1
};

// 設定に使えないキー（ほかの操作に使っているため）
export const RESERVED_KEYS = ["Escape", "Enter", "NumpadEnter", "Tab", "MetaLeft", "MetaRight", "ContextMenu"];

const GUEST_STORAGE_KEY = "stairs-settings-guest";

let current = { ...DEFAULTS };
let user = null;
const listeners = [];

export function getSettings() {
  return current;
}

/** 設定が変わるたびに呼ばれる関数を登録する */
export function onSettingsChange(fn) {
  listeners.push(fn);
  fn(current);
}

function emit() {
  listeners.forEach((fn) => fn(current));
}

// 保存データから、知っている項目だけを取り出す（余計なデータが混ざらないように）
function pick(data) {
  const out = {};
  if (!data) return out;
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof data[key] === typeof DEFAULTS[key]) out[key] = data[key];
  }
  return out;
}

function readGuest() {
  try {
    return pick(JSON.parse(localStorage.getItem(GUEST_STORAGE_KEY)));
  } catch {
    return {};
  }
}

/** ログイン状態が変わったら呼ぶ。その人の設定を読み込む */
export async function loadSettingsFor(newUser) {
  user = newUser;
  if (user) {
    try {
      const saved = await loadSettings();
      // まだ保存したことがない人は、今のブラウザの設定を引き継ぐ
      current = { ...DEFAULTS, ...readGuest(), ...pick(saved) };
    } catch (err) {
      console.warn("設定を読み込めませんでした:", err);
      current = { ...DEFAULTS, ...readGuest() };
    }
  } else {
    current = { ...DEFAULTS, ...readGuest() };
  }
  emit();
}

/** 設定の一部を変える（画面にはすぐ反映。保存は saveCurrentSettings で） */
export function updateSettings(patch) {
  current = { ...current, ...patch };
  emit();
}

/** 今の設定を保存する */
export async function saveCurrentSettings() {
  if (user) {
    await saveSettings(current);
  } else {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(current));
  }
}

/** キーの名前を画面表示用にする（例：KeyA → A） */
export function keyLabel(code) {
  const names = {
    ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
    Space: "Space", Backspace: "BackSpace",
    ShiftLeft: "左Shift", ShiftRight: "右Shift",
    ControlLeft: "左Ctrl", ControlRight: "右Ctrl",
    AltLeft: "左Alt", AltRight: "右Alt",
    Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: ":",
    BracketLeft: "@", BracketRight: "[", Backslash: "]", Minus: "-",
    Equal: "^", IntlYen: "¥", IntlRo: "＼",
  };
  if (names[code]) return names[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "テンキー" + code.slice(6);
  return code;
}
