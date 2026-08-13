import { Chess, type Move } from "chess.js";
import {
	applyHeat,
	bestMove,
	type Heat,
	legalMoves,
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

const TURN_SECONDS = 30;

// 승격을 감안해 부족분만 센다
const FULL: Record<string, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 };
const PAWNS: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };

const RECORD_KEY = "heat-chess-record";

const boardEl = document.getElementById("board")!;
const takenTopEl = document.getElementById("taken-top")!;
const takenBottomEl = document.getElementById("taken-bottom")!;
const statusEl = document.getElementById("status")!;
const clockEl = document.getElementById("clock")!;
const recordEl = document.getElementById("record")!;
const modeEl = document.getElementById("mode") as HTMLSelectElement;
const depthEl = document.getElementById("depth") as HTMLSelectElement;

let chess = new Chess();
let heat: Heat = {};
let sel: string | null = null;
let busy = false;
let audio: AudioContext | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let left = TURN_SECONDS;
let record = loadRecord();
let recorded = false;

// localStorage 는 사용자가 직접 고칠 수 있으니 값을 믿지 않는다
function loadRecord() {
	try {
		const r = JSON.parse(localStorage.getItem(RECORD_KEY) ?? "{}");
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
	try {
		localStorage.setItem(RECORD_KEY, JSON.stringify(record));
	} catch {
		// 저장이 막힌 브라우저에서도 이번 판 집계는 화면에 남긴다
	}
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
	left = TURN_SECONDS;
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
	clockEl.textContent = `⏱ ${left}`;
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
				return el;
			}),
		),
	);
}

function doMove(from: string, to: string) {
	const move = chess.move({ from, to, promotion: "q" });
	heat = applyHeat(heat, move);
	sel = null;
	render();
	playSound(move, (heat[to]?.lock ?? 0) > 0);
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
			const m = bestMove(chess, heat, Number(depthEl.value));
			busy = false;
			if (m) doMove(m.from, m.to);
		}, 30);
	} else startClock();
}

boardEl.addEventListener("click", (e) => {
	if (busy) return;
	const sq = (e.target as HTMLElement).closest<HTMLElement>(".sq")?.dataset.sq;
	if (!sq) return;
	const moves = legalMoves(chess, heat);
	if (sel && moves.some((m) => m.from === sel && m.to === sq)) doMove(sel, sq);
	else {
		sel = moves.some((m) => m.from === sq) ? sq : null;
		render();
	}
});

document.getElementById("new")!.addEventListener("click", () => {
	chess = new Chess();
	heat = {};
	sel = null;
	busy = false;
	recorded = false;
	render();
	step();
});
modeEl.addEventListener("change", () => !busy && step());

recordEl.addEventListener("click", () => {
	if (!confirm("전적을 지울까요?")) return;
	record = { w: 0, l: 0, d: 0 };
	try {
		localStorage.removeItem(RECORD_KEY);
	} catch {
		// 지우지 못해도 화면 표시는 초기화한다
	}
	drawRecord();
});

drawRecord();
render();
step();
