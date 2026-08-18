import { Chess, type Move, type Square } from "chess.js";
import {
	airconAfter,
	applyHeat,
	bestMove,
	capturedSquare,
	type Heat,
	legalMoves,
	OVERHEAT,
	pass,
	status,
} from "./game";
import bB from "./piece/bB.svg";
import bK from "./piece/bK.svg";
import bN from "./piece/bN.svg";
import bP from "./piece/bP.svg";
import bQ from "./piece/bQ.svg";
import bR from "./piece/bR.svg";
import wB from "./piece/wB.svg";
import wK from "./piece/wK.svg";
import wN from "./piece/wN.svg";
import wP from "./piece/wP.svg";
import wQ from "./piece/wQ.svg";
import wR from "./piece/wR.svg";

// lichess (lila) cburnett 세트 — GPLv2+, 출처는 README 참고
const PIECE: Record<string, string> = {
	wk: wK,
	wq: wQ,
	wr: wR,
	wb: wB,
	wn: wN,
	wp: wP,
	bk: bK,
	bq: bQ,
	br: bR,
	bb: bB,
	bn: bN,
	bp: bP,
};

const NAME: Record<string, string> = {
	k: "킹",
	q: "퀸",
	r: "룩",
	b: "비숍",
	n: "나이트",
	p: "폰",
};

const PAWNS: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };

const RECORD_KEY = "heat-chess-record";
const THEME_KEY = "heat-chess-board";
const TURN_KEY = "heat-chess-turn";
const SOUND_KEY = "heat-chess-sound";

// 프라이빗 모드 등에서 localStorage 접근 자체가 막힐 수 있다
function readStore(key: string) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStore(key: string, value: string | null) {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		// 저장이 막혀도 이번 세션 표시는 유지된다
	}
}

const boardEl = document.getElementById("board")!;
const takenTopEl = document.getElementById("taken-top")!;
const takenBottomEl = document.getElementById("taken-bottom")!;
const statusEl = document.getElementById("status")!;
const clockEl = document.getElementById("clock")!;
const recordEl = document.getElementById("record")!;
const modeEl = document.getElementById("mode") as HTMLSelectElement;
const themeEl = document.getElementById("theme") as HTMLSelectElement;
const turnEl = document.getElementById("turn") as HTMLSelectElement;
const turnLabelEl = document.getElementById("turn-label")!;
const undoEl = document.getElementById("undo") as HTMLButtonElement;
const soundEl = document.getElementById("sound") as HTMLButtonElement;
const movesEl = document.getElementById("moves")!;
const promoEl = document.getElementById("promo")!;
const promoBoxEl = document.getElementById("promo-box")!;

let chess = new Chess();
let heat: Heat = {};
let sel: string | null = null;
let busy = false;
let airconOn = false;
let airconSq: Record<"w" | "b", string | null> = { w: null, b: null };
let picking: "w" | "b" | null = null;
let audio: AudioContext | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let pending: ReturnType<typeof setTimeout> | undefined;
let left = 0;
// 히스토리는 pass() 의 FEN 재적재로 못 쓰니, 잡힌 기물을 수를 둘 때 누적한다 (승격에도 정확)
let lostPieces: Record<"w" | "b", string[]> = { w: [], b: [] };
let record = loadRecord();
let recorded = false;
let soundOn = readStore(SOUND_KEY) !== "off";
let sanMoves: string[] = [];
// undo 용 스냅샷 — 수를 두기 직전 상태를 담는다 (heat 는 불변이라 참조로 충분)
type Snap = {
	fen: string;
	heat: Heat;
	lost: Record<"w" | "b", string[]>;
	aircon: Record<"w" | "b", string | null>;
	san: string[];
};
let history: Snap[] = [];
let pendingPromo: { from: string; to: string } | null = null;

// localStorage 는 사용자가 직접 고칠 수 있으니 값을 믿지 않는다
function loadRecord() {
	try {
		const r = JSON.parse(readStore(RECORD_KEY) ?? "{}");
		return { w: Number(r.w) || 0, l: Number(r.l) || 0, d: Number(r.d) || 0 };
	} catch {
		return { w: 0, l: 0, d: 0 };
	}
}

function drawRecord() {
	recordEl.textContent = `${record.w}승 ${record.l}패 ${record.d}무`;
}

// 사람이 백을 잡는 vs AI 판만 전적으로 센다
function finish(result: "w" | "l" | "d") {
	if (recorded || !modeEl.value.startsWith("ai")) return;
	recorded = true;
	record[result]++;
	writeStore(RECORD_KEY, JSON.stringify(record));
	drawRecord();
}

// 무게감은 낮은 기본음 + 피치 하강 + 로우패스에서 나온다
function thud(freq: number, dur: number, type: OscillatorType, gain = 0.3) {
	if (!soundOn) return;
	audio ??= new AudioContext();
	const t = audio.currentTime;
	const osc = audio.createOscillator();
	const amp = audio.createGain();
	const lp = audio.createBiquadFilter();
	lp.type = "lowpass";
	lp.frequency.setValueAtTime(freq * 8, t);
	lp.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
	osc.type = type;
	osc.frequency.setValueAtTime(freq, t);
	osc.frequency.exponentialRampToValueAtTime(freq * 0.45, t + dur);
	amp.gain.setValueAtTime(gain, t);
	amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	osc.connect(lp).connect(amp).connect(audio.destination);
	osc.start(t);
	osc.stop(t + dur);
}

function playSound(m: Move, overheated: boolean) {
	if (overheated) thud(48, 0.85, "sawtooth", 0.3);
	else if (m.captured) thud(78, 0.42, "square", 0.32);
	else thud(135, 0.22, "sine", 0.34);
	if (chess.isCheck()) setTimeout(() => thud(190, 0.4, "triangle", 0.3), 130);
}

// step 체인 예약은 언제나 하나 — 새 예약이 이전 것을 무효화한다
function later(fn: () => void, ms: number) {
	clearTimeout(pending);
	pending = setTimeout(fn, ms);
}

function stopClock() {
	clearInterval(timer);
	timer = undefined;
	clockEl.textContent = "";
}

// 제한 시간을 넘기면 그 자리에서 진다. 백그라운드 탭에서 인터벌이
// 스로틀돼도 어긋나지 않게 마감 시각 기준으로 남은 시간을 계산한다
function startClock() {
	clearInterval(timer);
	left = Number(turnEl.value);
	const end = Date.now() + left * 1000;
	drawClock();
	timer = setInterval(() => {
		const next = Math.max(0, Math.ceil((end - Date.now()) / 1000));
		if (next === left) return;
		left = next;
		drawClock();
		if (left <= 5 && left > 0) thud(220, 0.12, "sine", 0.18);
		if (left <= 0) {
			stopClock();
			busy = true;
			const winner = chess.turn() === "w" ? "흑" : "백";
			statusEl.textContent = `시간 초과, ${winner} 승`;
			finish(chess.turn() === "w" ? "l" : "w");
			thud(42, 1.2, "sawtooth", 0.32);
		}
	}, 250);
}

function drawClock() {
	const min = Math.floor(left / 60);
	clockEl.textContent = min
		? `⏱ ${min}:${String(left % 60).padStart(2, "0")}`
		: `⏱ ${left}`;
	clockEl.classList.toggle("low", left <= 5);
}

function renderTaken() {
	const lostW = lostPieces.w;
	const lostB = lostPieces.b;
	const worth = (g: string[]) => g.reduce((s, t) => s + PAWNS[t]!, 0);
	const edge = worth(lostB) - worth(lostW);
	// 각 진영 쪽에 그 진영이 잡은 상대 기물을 둔다 (위=흑, 아래=백)
	fillTray(
		takenTopEl,
		"흑이 잡은 기물",
		lostW,
		"w",
		edge < 0 ? `+${-edge}` : "",
	);
	fillTray(
		takenBottomEl,
		"백이 잡은 기물",
		lostB,
		"b",
		edge > 0 ? `+${edge}` : "",
	);
}

function fillTray(
	el: HTMLElement,
	who: string,
	gone: string[],
	color: string,
	edge: string,
) {
	const label = document.createElement("span");
	label.className = "who";
	label.textContent = who;
	el.replaceChildren(
		label,
		...gone.map((type) => {
			const img = document.createElement("img");
			img.src = PIECE[color + type]!;
			img.alt = `잡힌 ${color === "w" ? "백" : "흑"} ${NAME[type]}`;
			return img;
		}),
	);
	if (edge) {
		const span = document.createElement("span");
		span.className = "edge";
		span.textContent = edge;
		el.append(span);
	}
}

function drawMoves() {
	const parts: string[] = [];
	for (let i = 0; i < sanMoves.length; i++)
		parts.push(`${i % 2 === 0 ? `${i / 2 + 1}. ` : ""}${sanMoves[i]}`);
	movesEl.textContent = parts.join(" ");
	movesEl.scrollTop = movesEl.scrollHeight;
}

function updateUndo() {
	undoEl.disabled = busy || picking !== null || history.length === 0;
}

function render() {
	drawMoves();
	updateUndo();
	renderTaken();
	const board = chess.board();
	const targets = sel
		? legalMoves(chess, heat).filter((m) => m.from === sel)
		: [];
	boardEl.replaceChildren(
		...board.flatMap((row, r) =>
			row.map((piece, f) => {
				const sq = "abcdefgh"[f]! + (8 - r);
				const el = document.createElement("div");
				el.className = `sq ${(r + f) % 2 ? "dark" : "light"}`;
				el.dataset.sq = sq;
				if (sq === sel) el.classList.add("sel");
				const target = targets.find((m) => m.to === sq);
				if (target) {
					el.classList.add("target");
					if (target.captured) el.classList.add("capture");
				}
				if (piece) {
					const cell = heat[sq];
					const pc = document.createElement("img");
					pc.className = "pc";
					pc.src = PIECE[piece.color + piece.type]!;
					pc.alt = `${piece.color === "w" ? "백" : "흑"} ${NAME[piece.type]}${
						cell?.lock
							? `, 과열 ${cell.lock}턴`
							: cell?.heat
								? `, heat ${cell.heat}`
								: ""
					}`;
					if (cell?.lock) {
						pc.classList.add("overheat");
						el.classList.add("overheat");
						// 솟아오르는 열기 줄기 — 에어콘의 바람(.wind)과 구분된다
						const steam = document.createElement("span");
						steam.className = "steam";
						el.append(steam);
					} else if (cell?.heat) {
						pc.classList.add("hot");
						pc.style.setProperty("--h", String(cell.heat));
					}
					el.append(pc);
					if (cell?.lock || cell?.heat) {
						const badge = document.createElement("span");
						badge.className = `badge ${cell.lock ? "overheat" : ""}`;
						badge.textContent = cell.lock
							? `🔥${cell.lock}`
							: String(cell.heat);
						el.append(badge);
					}
				}
				// 내 에어콘 기물 표시 — vs AI 에서만. 2인 플레이는 화면을 같이 보므로 숨긴다
				if (sq === airconSq.w && modeEl.value.startsWith("ai")) {
					el.classList.add("aircon");
					// 바람 줄기 두 레이어 (두 번째는 더 큰 바람이 드물게)
					const wind = document.createElement("span");
					wind.className = "wind";
					el.append(wind);
					const gust = document.createElement("span");
					gust.className = "wind wind-gust";
					el.append(gust);
					// 우하단 고정 아이콘 — 열 배지(우상단)와 겹치지 않는다
					const ico = document.createElement("span");
					ico.className = "aircon-ico";
					ico.textContent = "🌬️";
					el.append(ico);
				}
				return el;
			}),
		),
	);
}

// 스냅샷은 사람의 수만 남긴다 — vs AI 에서 undo 한 번이
// AI 응답과 사람의 수를 함께 되돌리기 위함 (AI 수의 스냅샷을 되돌리면 흑 차례가 된다)
function doMove(
	from: string,
	to: string,
	promotion: "q" | "r" | "b" | "n" = "q",
	byHuman = true,
) {
	if (byHuman)
		history.push({
			fen: chess.fen(),
			heat,
			lost: { w: [...lostPieces.w], b: [...lostPieces.b] },
			aircon: { ...airconSq },
			san: [...sanMoves],
		});
	const move = chess.move({ from, to, promotion });
	sanMoves.push(move.san);
	if (move.captured)
		lostPieces[move.color === "w" ? "b" : "w"].push(move.captured);
	// 과열 판정은 잠금 유무가 아니라 이동 전 열로 본다 (에어콘 모드는 히트 규칙 없음)
	const overheated = (heat[from]?.heat ?? 0) + 1 >= OVERHEAT;
	heat = applyHeat(heat, move, airconOn);
	sel = null;
	airconSq[move.color] = airconAfter(move, airconSq[move.color]);
	const foe = move.color === "w" ? "b" : "w";
	const hit = !!move.captured && airconSq[foe] === capturedSquare(move);
	if (hit) airconSq[foe] = null;
	render();
	playSound(move, overheated);
	if (hit) {
		busy = true;
		stopClock();
		clearTimeout(pending);
		statusEl.textContent = `❄ 에어콘 기물 격추, ${move.color === "w" ? "백" : "흑"} 승`;
		finish(move.color === "w" ? "w" : "l");
		thud(42, 1.2, "sawtooth", 0.32);
		return;
	}
	later(step, 20);
}

const AI_DEPTH: Record<string, number> = { ai1: 1, ai2: 2, ai3: 4 };

function step() {
	if (busy) return;
	const st = status(chess, heat);
	statusEl.textContent = st.text;
	if (st.over) {
		busy = true;
		stopClock();
		clearTimeout(pending);
		const draw = chess.isDraw() || chess.isStalemate();
		finish(draw ? "d" : chess.turn() === "w" ? "l" : "w");
		return;
	}
	if (st.mustPass) {
		heat = pass(chess, heat);
		sanMoves.push("(패스)");
		render();
		// 넘어간 턴이 눈에 보이게 잠깐 멈춘다 — 그동안 입력은 busy 로 막는다
		busy = true;
		later(() => {
			busy = false;
			step();
		}, 700);
		return;
	}
	if (modeEl.value.startsWith("ai") && chess.turn() === "b") {
		busy = true;
		stopClock();
		statusEl.textContent = "AI 생각 중…";
		later(() => {
			const m = bestMove(
				chess,
				heat,
				AI_DEPTH[modeEl.value] ?? 3,
				airconOn,
				airconOn ? airconSq.b : null,
			);
			busy = false;
			if (m)
				doMove(
					m.from,
					m.to,
					(m.promotion ?? "q") as "q" | "r" | "b" | "n",
					false,
				);
		}, 30);
	} else startClock();
}

const pickText = () =>
	modeEl.value.startsWith("ai")
		? "에어콘 기물을 클릭해 지정하세요 (킹 제외)"
		: `${picking === "w" ? "백" : "흑"}: 에어콘 기물 몰래 클릭 (킹 제외, 상대는 눈 감기)`;

// 킹은 잡히기 전에 메이트가 나므로 에어콘으로 고르면 규칙이 무력화된다
function randomAircon(color: "w" | "b") {
	const own: string[] = [];
	chess.board().forEach((row, r) => {
		row.forEach((p, f) => {
			if (p?.color === color && p.type !== "k")
				own.push("abcdefgh"[f]! + (8 - r));
		});
	});
	return own[Math.floor(Math.random() * own.length)]!;
}

const PROMO_PIECES = ["q", "r", "b", "n"] as const;

function showPromo(color: "w" | "b") {
	promoBoxEl.replaceChildren(
		...PROMO_PIECES.map((p) => {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.title = `${NAME[p]}로 승격`;
			const img = document.createElement("img");
			img.src = PIECE[color + p]!;
			img.alt = btn.title;
			btn.append(img);
			btn.addEventListener("click", () => {
				if (!pendingPromo) return;
				const { from, to } = pendingPromo;
				pendingPromo = null;
				promoEl.hidden = true;
				doMove(from, to, p);
			});
			return btn;
		}),
	);
	promoEl.hidden = false;
}

function hidePromo() {
	pendingPromo = null;
	promoEl.hidden = true;
}

boardEl.addEventListener("click", (e) => {
	if (busy) return;
	const sq = (e.target as HTMLElement).closest<HTMLElement>(".sq")?.dataset.sq;
	if (!sq) return;
	if (picking) {
		const p = chess.get(sq as Square);
		if (!p || p.color !== picking || p.type === "k") return;
		airconSq[picking] = sq;
		if (modeEl.value.startsWith("ai")) {
			airconSq.b = randomAircon("b");
			picking = null;
		} else picking = picking === "w" ? "b" : null;
		render();
		if (picking) statusEl.textContent = pickText();
		else step();
		return;
	}
	// AI(흑) 차례에는 사람 클릭으로 수를 두지 못한다
	if (modeEl.value.startsWith("ai") && chess.turn() === "b") return;
	const moves = legalMoves(chess, heat);
	if (sel && moves.some((m) => m.from === sel && m.to === sq)) {
		const opts = moves.filter((m) => m.from === sel && m.to === sq);
		if (opts.length > 1) {
			pendingPromo = { from: sel, to: sq };
			showPromo(chess.get(sel as Square)!.color);
		} else doMove(sel, sq);
	} else {
		sel = moves.some((m) => m.from === sq) ? sq : null;
		render();
	}
});

function newGame() {
	clearTimeout(pending);
	hidePromo();
	chess = new Chess();
	heat = {};
	sel = null;
	busy = false;
	recorded = false;
	lostPieces = { w: [], b: [] };
	airconSq = { w: null, b: null };
	picking = airconOn ? "w" : null;
	sanMoves = [];
	history = [];
	stopClock();
	render();
	if (picking) statusEl.textContent = pickText();
	else step();
}

// 진행 중인 게임을 버리는 동작(새 게임/모드 전환)에 확인을 받는다
const confirmDiscard = () =>
	sanMoves.length === 0 || confirm("진행 중인 게임을 버리고 새로 시작할까요?");

modeEl.addEventListener("change", () => !busy && !picking && step());

// 게임 모드 토글 — 라벨은 현재 모드를 보여주고, 클릭하면 모드를 바꾸며 새 게임을 시작한다
const gameModeEl = document.getElementById("game-mode")!;
function drawGameMode() {
	gameModeEl.textContent = airconOn ? "🌬️ 에어콘" : "🔥 히트";
	gameModeEl.classList.toggle("on", airconOn);
}
gameModeEl.addEventListener("click", () => {
	if (!confirmDiscard()) return;
	airconOn = !airconOn;
	drawGameMode();
	newGame();
});

document.getElementById("new-game")!.addEventListener("click", () => {
	if (!confirmDiscard()) return;
	newGame();
});

undoEl.addEventListener("click", () => {
	if (busy || picking) return;
	const snap = history.pop();
	if (!snap) return;
	clearTimeout(pending);
	stopClock();
	hidePromo();
	chess = new Chess(snap.fen);
	heat = snap.heat;
	lostPieces = { w: [...snap.lost.w], b: [...snap.lost.b] };
	airconSq = { ...snap.aircon };
	sanMoves = [...snap.san];
	sel = null;
	busy = false;
	render();
	step();
});

const soundLabel = () => (soundOn ? "🔊" : "🔇");
soundEl.textContent = soundLabel();
soundEl.addEventListener("click", () => {
	soundOn = !soundOn;
	writeStore(SOUND_KEY, soundOn ? null : "off");
	soundEl.textContent = soundLabel();
	soundEl.title = soundOn ? "효과음 끄기" : "효과음 켜기";
});

recordEl.addEventListener("click", () => {
	if (!confirm("전적을 지울까요?")) return;
	record = { w: 0, l: 0, d: 0 };
	writeStore(RECORD_KEY, null);
	drawRecord();
});

// 저장된 값이 옵션에 없으면 select.value 가 "" 가 되니 기본값으로 되돌린다
turnEl.value = readStore(TURN_KEY) ?? "30";
if (!turnEl.value) turnEl.value = "30";
turnLabelEl.textContent = turnEl.selectedOptions[0]!.textContent;
turnEl.addEventListener("change", () => {
	writeStore(TURN_KEY, turnEl.value);
	turnLabelEl.textContent = turnEl.selectedOptions[0]!.textContent;
	if (timer) startClock();
});

themeEl.value = readStore(THEME_KEY) ?? "wood";
if (!themeEl.value) themeEl.value = "wood";
document.body.dataset.board = themeEl.value;
themeEl.addEventListener("change", () => {
	document.body.dataset.board = themeEl.value;
	writeStore(THEME_KEY, themeEl.value);
});

drawRecord();
drawGameMode();
render();

const buildInfoEl = document.getElementById("build-info");
if (buildInfoEl) {
	const version =
		typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "develop";
	const commit = typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "dev";
	const time =
		typeof __APP_BUILD_TIME__ === "string"
			? __APP_BUILD_TIME__
			: new Date().toISOString().slice(0, 10);
	buildInfoEl.textContent = `${version} · ${commit} · ${time}`;
}
step();
