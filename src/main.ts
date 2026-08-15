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

// 승격을 감안해 부족분만 센다
const FULL: Record<string, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 };
const PAWNS: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };

const RECORD_KEY = "heat-chess-record";
const THEME_KEY = "heat-chess-board";
const TURN_KEY = "heat-chess-turn";

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
const depthEl = document.getElementById("depth") as HTMLSelectElement;
const themeEl = document.getElementById("theme") as HTMLSelectElement;
const turnEl = document.getElementById("turn") as HTMLSelectElement;
const turnLabelEl = document.getElementById("turn-label")!;

let chess = new Chess();
let heat: Heat = {};
let sel: string | null = null;
let busy = false;
let airconOn = false;
let airconSq: Record<"w" | "b", string | null> = { w: null, b: null };
let picking: "w" | "b" | null = null;
let audio: AudioContext | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let left = 0;
let record = loadRecord();
let recorded = false;

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
	if (recorded || modeEl.value !== "ai") return;
	recorded = true;
	record[result]++;
	writeStore(RECORD_KEY, JSON.stringify(record));
	drawRecord();
}

// 무게감은 낮은 기본음 + 피치 하강 + 로우패스에서 나온다
function thud(freq: number, dur: number, type: OscillatorType, gain = 0.3) {
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

function stopClock() {
	clearInterval(timer);
	timer = undefined;
	clockEl.textContent = "";
}

// 제한 시간을 넘기면 그 자리에서 진다
function startClock() {
	clearInterval(timer);
	left = Number(turnEl.value);
	drawClock();
	timer = setInterval(() => {
		left--;
		drawClock();
		if (left <= 5 && left > 0) thud(220, 0.12, "sine", 0.18);
		if (left <= 0) {
			stopClock();
			busy = true;
			const winner = chess.turn() === "w" ? "흑" : "백";
			statusEl.textContent = `시간 초과 — ${winner} 승`;
			finish(chess.turn() === "w" ? "l" : "w");
			thud(42, 1.2, "sawtooth", 0.32);
		}
	}, 1000);
}

function drawClock() {
	const min = Math.floor(left / 60);
	clockEl.textContent = min
		? `⏱ ${min}:${String(left % 60).padStart(2, "0")}`
		: `⏱ ${left}`;
	clockEl.classList.toggle("low", left <= 5);
}

// 히스토리는 pass() 의 FEN 재적재로 날아가므로 남은 기물에서 역산한다
function lost(color: "w" | "b") {
	const have: Record<string, number> = {};
	for (const row of chess.board())
		for (const p of row)
			if (p?.color === color) have[p.type] = (have[p.type] ?? 0) + 1;
	const gone: string[] = [];
	for (const [type, full] of Object.entries(FULL))
		for (let i = have[type] ?? 0; i < full; i++) gone.push(type);
	return gone;
}

function renderTaken() {
	const lostW = lost("w");
	const lostB = lost("b");
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

function render() {
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
					if (cell?.lock) pc.classList.add("locked");
					else if (cell?.heat) {
						pc.classList.add("hot");
						pc.style.setProperty("--h", String(cell.heat));
					}
					el.append(pc);
					if (cell?.lock || cell?.heat) {
						const badge = document.createElement("span");
						badge.className = `badge ${cell.lock ? "cold" : ""}`;
						badge.textContent = cell.lock ? `❄${cell.lock}` : String(cell.heat);
						el.append(badge);
					}
				}
				// 내 에어콘 기물 표시 — vs AI 에서만. 2인 플레이는 화면을 같이 보므로 숨긴다
				if (sq === airconSq.w && modeEl.value === "ai") {
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

function doMove(from: string, to: string) {
	const move = chess.move({ from, to, promotion: "q" });
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
		statusEl.textContent = `❄ 에어콘 기물 격추 — ${move.color === "w" ? "백" : "흑"} 승`;
		finish(move.color === "w" ? "w" : "l");
		thud(42, 1.2, "sawtooth", 0.32);
		return;
	}
	setTimeout(step, 20);
}

function step() {
	const st = status(chess, heat);
	statusEl.textContent = st.text;
	if (st.over) {
		busy = true;
		stopClock();
		const draw = chess.isDraw() || chess.isStalemate();
		finish(draw ? "d" : chess.turn() === "w" ? "l" : "w");
		return;
	}
	if (st.mustPass) {
		heat = pass(chess, heat);
		render();
		setTimeout(step, 700);
		return;
	}
	if (modeEl.value === "ai" && chess.turn() === "b") {
		busy = true;
		stopClock();
		statusEl.textContent = "AI 생각 중…";
		setTimeout(() => {
			const m = bestMove(chess, heat, Number(depthEl.value), airconOn);
			busy = false;
			if (m) doMove(m.from, m.to);
		}, 30);
	} else startClock();
}

const pickText = () =>
	modeEl.value === "ai"
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

boardEl.addEventListener("click", (e) => {
	if (busy) return;
	const sq = (e.target as HTMLElement).closest<HTMLElement>(".sq")?.dataset.sq;
	if (!sq) return;
	if (picking) {
		const p = chess.get(sq as Square);
		if (!p || p.color !== picking || p.type === "k") return;
		airconSq[picking] = sq;
		if (modeEl.value === "ai") {
			airconSq.b = randomAircon("b");
			picking = null;
		} else picking = picking === "w" ? "b" : null;
		render();
		if (picking) statusEl.textContent = pickText();
		else step();
		return;
	}
	const moves = legalMoves(chess, heat);
	if (sel && moves.some((m) => m.from === sel && m.to === sq)) doMove(sel, sq);
	else {
		sel = moves.some((m) => m.from === sq) ? sq : null;
		render();
	}
});

function newGame() {
	chess = new Chess();
	heat = {};
	sel = null;
	busy = false;
	recorded = false;
	airconSq = { w: null, b: null };
	picking = airconOn ? "w" : null;
	stopClock();
	render();
	if (picking) statusEl.textContent = pickText();
	else step();
}

modeEl.addEventListener("change", () => !busy && !picking && step());

// 게임 모드 토글 — 라벨은 현재 모드를 보여주고, 클릭하면 모드를 바꾸며 새 게임을 시작한다
const gameModeEl = document.getElementById("game-mode")!;
function drawGameMode() {
	gameModeEl.textContent = airconOn ? "🌬️ 에어콘" : "🔥 히트";
	gameModeEl.classList.toggle("on", airconOn);
}
gameModeEl.addEventListener("click", () => {
	airconOn = !airconOn;
	drawGameMode();
	newGame();
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
document.body.dataset.board = themeEl.value;
themeEl.addEventListener("change", () => {
	document.body.dataset.board = themeEl.value;
	writeStore(THEME_KEY, themeEl.value);
});

drawRecord();
drawGameMode();
render();
step();
