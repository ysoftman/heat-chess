import type { Chess, Color, Move } from "chess.js";

export const OVERHEAT = 4;
export const LOCK_TURNS = 2;

export type Cell = { heat: number; lock: number; color: Color };
export type Heat = Record<string, Cell>;

const clone = (h: Heat): Heat =>
	Object.fromEntries(Object.entries(h).map(([k, v]) => [k, { ...v }]));

export const isLocked = (h: Heat, sq: string) => (h[sq]?.lock ?? 0) > 0;

export function legalMoves(chess: Chess, h: Heat): Move[] {
	return chess.moves({ verbose: true }).filter((m) => !isLocked(h, m.from));
}

// 이번 턴에 움직이지 않은 같은 편 기물 냉각
function cool(h: Heat, color: Color, moved?: string) {
	for (const [sq, c] of Object.entries(h)) {
		if (c.color !== color || sq === moved) continue;
		if (c.lock > 0) {
			if (--c.lock === 0) delete h[sq];
		} else if (--c.heat <= 0) delete h[sq];
	}
}

function heatUp(h: Heat, from: string, to: string, color: Color) {
	const heat = (h[from]?.heat ?? 0) + 1;
	delete h[from];
	h[to] =
		heat >= OVERHEAT
			? { heat: 0, lock: LOCK_TURNS, color }
			: { heat, lock: 0, color };
}

// 앙파상은 잡힌 폰이 도착 칸과 다른 칸에 있다
export const capturedSquare = (m: Move) =>
	m.flags.includes("e") ? m.to[0]! + m.from[1] : m.to;

// 에어콘 기물 칸을 수를 따라 갱신 — 캐슬링 룩 동행 포함
export function airconAfter(m: Move, sq: string | null): string | null {
	if (sq === m.from) return m.to;
	const rank = m.from[1];
	if (m.flags.includes("k") && sq === "h" + rank) return "f" + rank;
	if (m.flags.includes("q") && sq === "a" + rank) return "d" + rank;
	return sq;
}

export function applyHeat(prev: Heat, m: Move, noHeat = false): Heat {
	if (noHeat) return prev;
	const h = clone(prev);
	delete h[capturedSquare(m)];
	cool(h, m.color, m.from);
	// 킹은 과열되지 않는다 — 아니면 체크를 피하지 못해 게임이 막힌다
	if (m.piece === "k") delete h[m.from];
	else heatUp(h, m.from, m.to, m.color);
	const rank = m.from[1]!;
	if (m.flags.includes("k")) heatUp(h, "h" + rank, "f" + rank, m.color);
	if (m.flags.includes("q")) heatUp(h, "a" + rank, "d" + rank, m.color);
	return h;
}

// 둘 수 있는 수가 전부 과열로 막혔을 때 턴만 넘긴다
export function pass(chess: Chess, prev: Heat): Heat {
	const f = chess.fen().split(" ");
	const color = f[1] as Color;
	f[1] = color === "w" ? "b" : "w";
	f[3] = "-";
	// 패스도 폰 이동/캡처 없는 반수 — 50수 규칙 카운터를 계속 올린다
	f[4] = String(Number(f[4]) + 1);
	if (color === "b") f[5] = String(Number(f[5]) + 1);
	chess.load(f.join(" "));
	const h = clone(prev);
	cool(h, color);
	return h;
}

export type Status = { over: boolean; text: string; mustPass: boolean };

export function status(chess: Chess, h: Heat): Status {
	const side = chess.turn() === "w" ? "백" : "흑";
	const other = chess.turn() === "w" ? "흑" : "백";
	if (chess.isCheckmate())
		return { over: true, text: `체크메이트 — ${other} 승`, mustPass: false };
	if (chess.isDraw() || chess.isStalemate())
		return { over: true, text: "무승부", mustPass: false };
	if (legalMoves(chess, h).length === 0) {
		return chess.isCheck()
			? { over: true, text: `히트메이트 — ${other} 승`, mustPass: false }
			: { over: false, text: `${side}: 전부 과열, 한 턴 쉼`, mustPass: true };
	}
	return {
		over: false,
		text: chess.isCheck() ? `${side} 체크!` : `${side} 차례`,
		mustPass: false,
	};
}

const VALUE: Record<string, number> = {
	p: 100,
	n: 320,
	b: 330,
	r: 500,
	q: 900,
	k: 0,
};

function evaluate(chess: Chess, h: Heat): number {
	const me = chess.turn();
	let s = 0;
	for (const row of chess.board())
		for (const p of row) if (p) s += (p.color === me ? 1 : -1) * VALUE[p.type]!;
	for (const c of Object.values(h))
		s += (c.color === me ? -1 : 1) * (c.lock > 0 ? 60 : c.heat * 10);
	return s;
}

function negamax(
	chess: Chess,
	h: Heat,
	depth: number,
	alpha: number,
	beta: number,
	noHeat: boolean,
): number {
	const moves = legalMoves(chess, h);
	if (moves.length === 0) {
		if (chess.isCheck()) return -99999 - depth;
		if (chess.moves().length === 0) return 0;
		return evaluate(chess, h);
	}
	if (depth === 0) return evaluate(chess, h);
	moves.sort(
		(a, b) =>
			(b.captured ? VALUE[b.captured]! : 0) -
			(a.captured ? VALUE[a.captured]! : 0),
	);
	let best = -Infinity;
	for (const m of moves) {
		chess.move({ from: m.from, to: m.to, promotion: m.promotion ?? "q" });
		const score = -negamax(
			chess,
			applyHeat(h, m, noHeat),
			depth - 1,
			-beta,
			-alpha,
			noHeat,
		);
		chess.undo();
		if (score > best) best = score;
		if (best > alpha) alpha = best;
		if (alpha >= beta) break;
	}
	return best;
}

export function bestMove(
	chess: Chess,
	h: Heat,
	depth = 3,
	noHeat = false,
): Move | null {
	const moves = legalMoves(chess, h);
	if (moves.length === 0) return null;
	let best = moves[0]!;
	let bestScore = -Infinity;
	for (const m of moves) {
		chess.move({ from: m.from, to: m.to, promotion: m.promotion ?? "q" });
		const score = -negamax(
			chess,
			applyHeat(h, m, noHeat),
			depth - 1,
			-Infinity,
			-bestScore,
			noHeat,
		);
		chess.undo();
		if (score > bestScore) {
			bestScore = score;
			best = m;
		}
	}
	return best;
}
