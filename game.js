// =====================================================
// game.js  ―― 階段ゲーム本体（Firebaseとは無関係の部分）
// =====================================================

// ---- 画面と見た目の設定 ----
const W = 400;          // キャンバスの論理的な幅
const H = 600;          // キャンバスの論理的な高さ
const STEP_X = 44;      // 1段登るごとに横へ進む距離
const STEP_Y = 34;      // 1段登るごとに上へ進む距離
const STAIR_W = 58;     // 段の幅
const PLAYER_SCREEN_Y = H * 0.66; // プレイヤーを画面のどの高さに表示するか

// ---- 色（style.css の :root と同じ） ----
const COLORS = {
  bg: "#f3f1ec",
  ink: "#151515",
  sub: "#77736b",
  line: "#d8d3c8",
  accent: "#ff4d2e",
};

// ---- 難易度の設定 ----
const TIME_MAX = 100;   // 時間ゲージの最大値
const TIME_GAIN = 7;    // 1段登るごとに回復する量
const FALL_SECONDS = 1.0; // 落下アニメーションの長さ

// 時間ゲージが1秒あたりに減る量（スコアが上がるほど速くなる）
function drainRate(score) {
  return Math.min(15 + score * 0.2, 70);
}

// 階段が曲がる確率（高く登るほど曲がりやすくなる）
function turnChance(stairIndex) {
  return Math.min(0.12 + stairIndex * 0.0025, 0.5);
}

export class StairsGame {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {(score:number, reason:string) => void} onGameOver ゲームオーバー時に呼ばれる
   */
  constructor(canvas, onGameOver) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onGameOver = onGameOver;
    this.running = false;

    // 高解像度ディスプレイでもくっきり描画する
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // this を固定しておく（イベントやrequestAnimationFrameで使うため）
    this.loop = this.loop.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
  }

  // ---------- ゲーム開始・終了 ----------

  start() {
    // 階段データ：stairs[i].x が i段目の横位置（1マス単位）
    this.stairs = [{ x: 0 }];
    this.genDir = 1; // 階段を生成するときの今の向き
    for (let i = 0; i < 40; i++) this.addStair();

    this.index = 0;          // プレイヤーが立っている段の番号
    this.facing = 1;         // プレイヤーの向き（-1:左 / 1:右）
    this.score = 0;
    this.time = TIME_MAX;
    this.started = false;    // 最初のキー入力までは時間が減らない
    this.state = "playing";  // "playing" → "falling" → "over"
    this.reason = "";

    const p = this.standPos(0);
    this.player = { x: p.x, y: p.y };   // 描画上のプレイヤー位置
    this.cam = { x: p.x, y: p.y };      // カメラ位置
    this.fall = { vx: 0, vy: 0, t: 0 };

    window.addEventListener("keydown", this.onKeyDown);
    this.lastTime = performance.now();
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(this.loop);
    }
  }

  stop() {
    this.running = false;
    window.removeEventListener("keydown", this.onKeyDown);
  }

  // ---------- 階段の生成 ----------

  addStair() {
    const n = this.stairs.length;
    const last = this.stairs[n - 1];
    // 最初の数段はまっすぐ。それ以降はランダムで曲がる
    if (n > 3 && Math.random() < turnChance(n)) {
      this.genDir *= -1;
    }
    this.stairs.push({ x: last.x + this.genDir });
  }

  // i段目の上に立ったときの足元の座標（ワールド座標）
  standPos(i) {
    return { x: this.stairs[i].x * STEP_X, y: -i * STEP_Y };
  }

  // ---------- 入力 ----------

  onKeyDown(e) {
    if (e.repeat) return; // 押しっぱなしで連続入力されないように
    if (e.key === "ArrowLeft") { e.preventDefault(); this.move(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); this.move(1); }
  }

  /** dir: -1 = 左上へ / 1 = 右上へ */
  move(dir) {
    if (this.state !== "playing") return;
    this.started = true;
    this.facing = dir;

    const cur = this.stairs[this.index];
    const next = this.stairs[this.index + 1];

    if (next.x === cur.x + dir) {
      // 正解：1段登る
      this.index++;
      this.score++;
      this.time = Math.min(TIME_MAX, this.time + TIME_GAIN);
      // 先の階段が足りなくならないよう補充
      while (this.stairs.length < this.index + 40) this.addStair();
    } else {
      // 不正解：段がない方向へ踏み出して落下
      this.startFall(dir, "踏み外した！");
    }
  }

  startFall(dir, reason) {
    this.state = "falling";
    this.reason = reason;
    this.fall = { vx: dir * 110, vy: -260, t: 0 }; // 少し跳ねてから落ちる
  }

  // ---------- 毎フレームの処理 ----------

  loop(now) {
    if (!this.running) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.05); // 経過秒（重い時は上限）
    this.lastTime = now;
    this.update(dt);
    this.draw();
    requestAnimationFrame(this.loop);
  }

  update(dt) {
    if (this.state === "playing") {
      // 時間ゲージを減らす
      if (this.started) {
        this.time -= drainRate(this.score) * dt;
        if (this.time <= 0) {
          this.time = 0;
          this.startFall(this.facing, "時間切れ！");
        }
      }
      // プレイヤーを今の段へなめらかに移動
      const target = this.standPos(this.index);
      const k = 1 - Math.pow(0.000001, dt);
      this.player.x += (target.x - this.player.x) * k;
      this.player.y += (target.y - this.player.y) * k;
    } else if (this.state === "falling") {
      // 重力で落下
      this.fall.vy += 1500 * dt;
      this.player.x += this.fall.vx * dt;
      this.player.y += this.fall.vy * dt;
      this.fall.t += dt;
      if (this.fall.t >= FALL_SECONDS) {
        this.state = "over";
        this.onGameOver(this.score, this.reason);
      }
      return; // 落下中はカメラを止める
    }

    // カメラはプレイヤーを少し遅れて追いかける
    const c = 1 - Math.pow(0.001, dt);
    this.cam.x += (this.player.x - this.cam.x) * c;
    this.cam.y += (this.player.y - this.cam.y) * c;
  }

  // ---------- 描画 ----------
  // 色は style.css の :root と同じ値にそろえています

  draw() {
    const ctx = this.ctx;

    // 背景：ホーム画面と同じ生成り色
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    // ここからワールド座標（カメラに合わせてずらす）
    ctx.save();
    ctx.translate(W / 2 - this.cam.x, PLAYER_SCREEN_Y - this.cam.y);

    this.drawMarkers();
    const from = Math.max(0, this.index - 16);
    const to = Math.min(this.stairs.length - 1, this.index + 22);
    for (let i = from; i <= to; i++) this.drawStair(i);
    this.drawPlayer();

    ctx.restore();

    this.drawHud();
  }

  // 10段ごとの高さの目印（点線と段数）
  drawMarkers() {
    const ctx = this.ctx;
    const left = this.cam.x - W / 2;
    const first = Math.max(10, Math.floor((this.index - 16) / 10) * 10);
    ctx.save();
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.fillStyle = COLORS.sub;
    ctx.font = "400 11px 'Jost', sans-serif";
    ctx.textAlign = "left";
    for (let i = first; i <= this.index + 22; i += 10) {
      const y = -i * STEP_Y + 0.5;
      ctx.beginPath();
      ctx.moveTo(left + 44, y);
      ctx.lineTo(left + W, y);
      ctx.stroke();
      ctx.fillText(String(i).padStart(3, "0"), left + 14, y + 4);
    }
    ctx.restore();
  }

  drawStair(i) {
    const ctx = this.ctx;
    const p = this.standPos(i);
    // 通り過ぎた段は薄く、これからの段は黒い線で
    ctx.fillStyle = i < this.index ? COLORS.line : COLORS.ink;
    ctx.fillRect(p.x - STAIR_W / 2, p.y, STAIR_W, 4);
  }

  drawPlayer() {
    const ctx = this.ctx;
    const { x, y } = this.player; // 足元の位置
    const f = this.facing;
    const size = 20;

    ctx.save();
    ctx.translate(x, y - size / 2); // 四角の中心へ
    if (this.state !== "playing") {
      ctx.rotate(this.fall.t * 7 * f); // 落ちるときはくるくる回る
    }
    // 体：ホーム画面の飾りと同じ朱色の四角
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    // 目：向いている方向に寄せる
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(f * 4 - 2, -5, 4, 4);
    ctx.restore();
  }

  drawHud() {
    const ctx = this.ctx;

    // 上部を背景色でぼかしてスコアを読みやすくする
    const shade = ctx.createLinearGradient(0, 0, 0, 140);
    shade.addColorStop(0, "rgba(243,241,236,1)");
    shade.addColorStop(0.6, "rgba(243,241,236,0.9)");
    shade.addColorStop(1, "rgba(243,241,236,0)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, 140);

    // スコア（細い大きな数字＋「段」）
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.ink;
    ctx.font = "200 64px 'Jost', sans-serif";
    ctx.fillText(this.score, 22, 78);
    const w = ctx.measureText(String(this.score)).width;
    ctx.fillStyle = COLORS.sub;
    ctx.font = "500 13px 'Zen Kaku Gothic New', sans-serif";
    ctx.fillText("段", 22 + w + 6, 76);

    // 時間ゲージ（細い線の上に太い線）
    const bx = 24, bw = W - 48, by = 98;
    const ratio = this.time / TIME_MAX;
    ctx.fillStyle = COLORS.sub;
    ctx.font = "400 10px 'Jost', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("TIME", bx + bw, by - 8);
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(bx, by, bw, 1);
    ctx.fillStyle = ratio > 0.3 ? COLORS.ink : COLORS.accent; // 残り少ないと朱色
    ctx.fillRect(bx, by - 1, bw * ratio, 3);

    // スタート前のヒント
    if (!this.started && this.state === "playing") {
      ctx.textAlign = "center";
      ctx.fillStyle = COLORS.sub;
      ctx.font = "500 14px 'Zen Kaku Gothic New', sans-serif";
      ctx.fillText("← → で登ろう", W / 2, H - 36);
    }
  }
}
