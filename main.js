// =====================================================
// main.js  ―― 画面の切り替えとボタンの処理
//   game.js（ゲーム本体）と firebase.js（Firebase）をつなぐ役
// =====================================================
import { StairsGame } from "./game.js";
import {
  signUp,
  logIn,
  logOut,
  watchUser,
  saveScore,
  fetchRanking,
  toJapaneseError,
} from "./firebase.js";
import { initAudio, playSE, setVolumes } from "./audio.js";
import {
  DEFAULTS,
  RESERVED_KEYS,
  getSettings,
  onSettingsChange,
  loadSettingsFor,
  updateSettings,
  saveCurrentSettings,
  keyLabel,
} from "./settings.js";

const $ = (id) => document.getElementById(id);

let currentUser = null; // ログイン中のユーザー（未ログインなら null）

// ---------- 画面切り替え ----------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => {
    el.classList.toggle("active", el.id === id);
  });
}

// =====================================================
// アカウント
// =====================================================

// ログイン状態が変わったら表示を更新（ページを開いた時も1回呼ばれる）
watchUser((user) => {
  currentUser = user;
  renderUser();
  loadRanking();          // 自分の行を目立たせるため再読み込み
  loadSettingsFor(user);  // その人のキー配置・音量を読み込む
});

function renderUser() {
  const loggedIn = !!currentUser;
  $("loggedOut").hidden = loggedIn;
  $("loggedIn").hidden = !loggedIn;
  $("guestNote").hidden = loggedIn;
  // 右上のログイン状態表示
  $("userDot").classList.toggle("on", loggedIn);
  $("userChip").textContent = loggedIn ? (currentUser.displayName || "名無し") : "ゲスト";
  if (loggedIn) {
    $("userName").textContent = currentUser.displayName || "名無し";
  }
  // 設定の保存先の説明
  $("settingsWhere").textContent = loggedIn
    ? `${currentUser.displayName || "名無し"} さんのアカウントに保存されます（別の端末でも同じ設定になります）`
    : "ゲストの設定は、このブラウザにだけ保存されます";
}

// =====================================================
// 小窓（ダイアログ）の開け閉め
// =====================================================
document.querySelectorAll("[data-open]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.open;
    $(id).showModal();
    if (id === "rankingDialog") loadRanking(); // 開くたびに最新を読み込む
  });
});
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => btn.closest("dialog").close());
});
// 小窓の外側（暗い部分）をクリックしても閉じる
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
});

function setAuthMsg(text, type = "") {
  const el = $("authMsg");
  el.textContent = text;
  el.className = "msg " + type;
}

// 「新規登録」「ログイン」タブの切り替え
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    $("signupForm").hidden = tab.dataset.tab !== "signupForm";
    $("loginForm").hidden = tab.dataset.tab !== "loginForm";
    setAuthMsg("");
  });
});

// 新規登録
$("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault(); // フォーム送信でページが再読み込みされるのを防ぐ
  const button = e.submitter;
  const name = $("signupName").value.trim();
  if (!name) return setAuthMsg("ニックネームを入力してください", "error");

  button.disabled = true;
  setAuthMsg("登録中…");
  try {
    currentUser = await signUp(name, $("signupEmail").value, $("signupPassword").value);
    renderUser(); // ニックネームを表示に反映
    setAuthMsg("登録しました！ようこそ " + name + " さん", "ok");
    e.target.reset();
    setTimeout(() => $("accountDialog").close(), 900);
  } catch (err) {
    setAuthMsg(toJapaneseError(err), "error");
  } finally {
    button.disabled = false;
  }
});

// ログイン
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = e.submitter;
  button.disabled = true;
  setAuthMsg("ログイン中…");
  try {
    await logIn($("loginEmail").value, $("loginPassword").value);
    setAuthMsg("ログインしました", "ok");
    e.target.reset();
    setTimeout(() => $("accountDialog").close(), 900);
  } catch (err) {
    setAuthMsg(toJapaneseError(err), "error");
  } finally {
    button.disabled = false;
  }
});

// ログアウト
$("logoutBtn").addEventListener("click", async () => {
  await logOut();
  setAuthMsg("ログアウトしました");
});

// =====================================================
// ランキング
// =====================================================
async function loadRanking() {
  const list = $("rankingList");
  try {
    const rows = await fetchRanking(10);
    renderLeader(rows[0]);
    list.innerHTML = "";
    if (rows.length === 0) {
      list.innerHTML = '<li class="empty">まだ記録がありません</li>';
      return;
    }
    for (const row of rows) {
      const li = document.createElement("li");
      if (currentUser && row.uid === currentUser.uid) li.classList.add("me");
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = row.name; // textContent を使うと名前に<タグ>が入っても安全
      const score = document.createElement("span");
      score.className = "score";
      score.textContent = row.best;
      const unit = document.createElement("small");
      unit.textContent = "段";
      score.append(unit);
      li.append(name, score);
      list.append(li);
    }
  } catch (err) {
    list.innerHTML = "";
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "ランキングを読み込めません：" + toJapaneseError(err);
    list.append(li);
  }
}

// ホーム画面の「現在の1位」表示
function renderLeader(top) {
  const el = $("leader");
  if (!top) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = "現在の1位　";
  const name = document.createElement("b");
  name.textContent = top.name;
  const num = document.createElement("span");
  num.className = "num";
  num.textContent = "　" + top.best;
  el.append(name, num, "段");
}

// =====================================================
// ゲーム
// =====================================================
const game = new StairsGame($("canvas"), {
  onGameOver: handleGameOver,
  onStep: playSE, // 1段登るたびに効果音
});

function startGame() {
  $("overlay").hidden = true;
  showScreen("game");
  game.start();
}

async function handleGameOver(score, reason) {
  $("reason").textContent = reason;
  $("finalScore").textContent = score;
  $("overlay").hidden = false;

  const msg = $("saveMsg");
  msg.className = "msg";
  if (!currentUser) {
    msg.textContent = "ログインするとランキングに記録されます";
    return;
  }
  msg.textContent = "記録を保存中…";
  try {
    const result = await saveScore(score);
    if (result.updated) {
      msg.textContent = `自己ベスト更新！ ${result.best} 段`;
      msg.classList.add("ok");
    } else {
      msg.textContent = `自己ベスト：${result.best} 段`;
    }
  } catch (err) {
    msg.textContent = "保存できませんでした：" + toJapaneseError(err);
    msg.classList.add("error");
  }
}

$("startBtn").addEventListener("click", startGame);
$("retryBtn").addEventListener("click", startGame);
function goHome() {
  game.stop();
  showScreen("home");
  loadRanking();
}
$("homeBtn").addEventListener("click", goHome);
$("quitBtn").addEventListener("click", goHome);

// ゲーム画面で Esc を押すとホームへ
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("game").classList.contains("active")) goHome();
});

// Enter キー：ホームならスタート、ゲームオーバー画面ならもう一度
window.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (document.querySelector("dialog[open]")) return;  // 小窓が開いているときは何もしない

  // ホーム画面：どこにフォーカスがあっても Enter はスタート
  if ($("home").classList.contains("active")) {
    e.preventDefault(); // フォーカス中のボタンが押されるのを止める
    startGame();
    return;
  }
  // ゲームオーバー画面：ボタンにフォーカスがあるときはそのボタンに任せる
  const onGameOver = $("game").classList.contains("active") && !$("overlay").hidden;
  if (onGameOver && !e.target.closest("button")) startGame();
});

// スマホ用の ← → ボタン
document.querySelectorAll(".touch-btn").forEach((btn) => {
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    game.move(Number(btn.dataset.dir));
  });
});
