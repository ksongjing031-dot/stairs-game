// =====================================================
// audio.js  ―― 効果音とBGM（Web Audio API を使用）
//   ・ブラウザの決まりで、ユーザーが一度クリックかキー入力をするまで音は出せません
//   ・そのため main.js で「最初の操作」のときに initAudio() を呼びます
// =====================================================

const FILES = {
  se: "sounds/cursor12.mp3",       // 効果音「カーソル移動12」
  bgm: "sounds/dreaming-sky.mp3",  // BGM「Dreaming Sky」
};

let ctx = null;        // 音を鳴らすための土台（AudioContext）
let seGain = null;     // 効果音の音量つまみ
let bgmGain = null;    // BGMの音量つまみ
let seBuffer = null;   // 読み込んだ効果音
let volumes = { se: 0.7, bgm: 0.4 }; // 0〜1

// スライダーの値をそのまま使うと小さい音の変化がわかりにくいので2乗する
const toGain = (v) => v * v;

/** 最初のクリック／キー入力のときに1回だけ呼ぶ */
export async function initAudio() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume();
    return;
  }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  seGain = ctx.createGain();
  bgmGain = ctx.createGain();
  seGain.connect(ctx.destination);
  bgmGain.connect(ctx.destination);
  applyVolumes();

  const [se, bgm] = await Promise.all([load(FILES.se), load(FILES.bgm)]);
  seBuffer = se;

  // BGM：最後まで再生したら最初に戻ってくり返す
  if (bgm) {
    const source = ctx.createBufferSource();
    source.buffer = bgm;
    source.loop = true;
    source.connect(bgmGain);
    source.start();
  }
}

// 音声ファイルを読み込んで、再生できる形に変換する
async function load(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    return await ctx.decodeAudioData(await res.arrayBuffer());
  } catch (err) {
    console.warn("音声ファイルを読み込めませんでした:", url, err);
    return null; // 読み込めなくてもゲームは動くようにする
  }
}

/** 効果音を1回鳴らす（重ねて鳴らしてもOK） */
export function playSE() {
  if (!ctx || !seBuffer || volumes.se === 0) return;
  const source = ctx.createBufferSource();
  source.buffer = seBuffer;
  source.connect(seGain);
  source.start();
}

/** 音量を変える（0〜1）。指定しなかった方はそのまま */
export function setVolumes({ se, bgm }) {
  if (typeof se === "number") volumes.se = se;
  if (typeof bgm === "number") volumes.bgm = bgm;
  applyVolumes();
}

function applyVolumes() {
  if (!ctx) return;
  // setTargetAtTime で少しなめらかに変える（プツッという音を防ぐ）
  seGain.gain.setTargetAtTime(toGain(volumes.se), ctx.currentTime, 0.02);
  bgmGain.gain.setTargetAtTime(toGain(volumes.bgm), ctx.currentTime, 0.05);
}

// 別のタブを見ている間は音を止める
document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend();
  else ctx.resume();
});
