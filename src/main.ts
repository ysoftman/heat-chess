import { Chess } from "chess.js";
import {
	applyHeat,
	bestMove,
	type Heat,
	legalMoves,
	pass,
	status,
} from "./game";

const GLYPH: Record<string, string> = {
	wk: "♔",
	wq: "♕",
	wr: "♖",
	wb: "♗",
	wn: "♘",
	wp: "♙",
	bk: "♚",
	bq: "♛",
	br: "♜",
	bb: "♝",
	bn: "♞",
	bp: "♟",
};

const boardEl = document.getElementById("board")!;
const statusEl = document.getElementById("status")!;
const modeEl = document.getElementById("mode") as HTMLSelectElement;
const depthEl = document.getElementById("depth") as HTMLSelectElement;

let chess = new Chess();
let heat: Heat = {};
let sel: string | null = null;
let busy = false;

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
					const pc = document.createElement("span");
					pc.className = `pc ${piece.color === "w" ? "w" : ""}`;
					pc.textContent = GLYPH[piece.color + piece.type]!;
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
	heat = applyHeat(heat, chess.move({ from, to, promotion: "q" }));
	sel = null;
	render();
	setTimeout(step, 20);
}

function step() {
	const st = status(chess, heat);
	statusEl.textContent = st.text;
	if (st.over) {
		busy = true;
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
		statusEl.textContent = "AI 생각 중…";
		setTimeout(() => {
			const m = bestMove(chess, heat, Number(depthEl.value));
			busy = false;
			if (m) doMove(m.from, m.to);
		}, 30);
	}
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
