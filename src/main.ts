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

const boardEl = document.getElementById("board")!;
const statusEl = document.getElementById("status")!;
const clockEl = document.getElementById("clock")!;
const modeEl = document.getElementById("mode") as HTMLSelectElement;
const depthEl = document.getElementById("depth") as HTMLSelectElement;

let chess = new Chess();
let heat: Heat = {};
let sel: string | null = null;
let busy = false;
let audio: AudioContext | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let left = TURN_SECONDS;

function beep(freq: number, dur: number, type: OscillatorType, gain = 0.12) {
	audio ??= new AudioContext();
	const t = audio.currentTime;
	const osc = audio.createOscillator();
	const amp = audio.createGain();
	osc.type = type;
	osc.frequency.setValueAtTime(freq, t);
	amp.gain.setValueAtTime(gain, t);
	amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	osc.connect(amp).connect(audio.destination);
	osc.start(t);
	osc.stop(t + dur);
}

function playSound(m: Move, overheated: boolean) {
	if (overheated) beep(90, 0.35, "sawtooth", 0.1);
	else if (m.captured) beep(180, 0.14, "square", 0.1);
	else beep(520, 0.06, "triangle");
	if (chess.isCheck()) setTimeout(() => beep(880, 0.12, "sine"), 90);
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
		if (left <= 5 && left > 0) beep(1200, 0.05, "sine", 0.06);
		if (left <= 0) {
			stopClock();
			busy = true;
			const winner = chess.turn() === "w" ? "흑" : "백";
			statusEl.textContent = `시간 초과 — ${winner} 승`;
			beep(110, 0.6, "sawtooth", 0.12);
		}
	}, 1000);
}

function drawClock() {
	clockEl.textContent = `⏱ ${left}`;
	clockEl.classList.toggle("low", left <= 5);
}

function render() {
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
	render();
	step();
});
modeEl.addEventListener("change", () => !busy && step());

render();
step();
