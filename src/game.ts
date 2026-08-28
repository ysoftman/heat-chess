import type { Chess, Color, Move, Square } from "chess.js";

export const OVERHEAT = 4;
export const LOCK_TURNS = 2;

// 에어컨 기물 가치 — 잡히면 즉시 패배라 퀸(900)보다 훨씬 높게 둔다.
// 체크메이트 점수(99999)보다는 낮아야 메이트를 우선할 수 있다.
const AIRCON_VALUE = 8000;
// 위협(공격받는 중) 감점 — 값보다 낮게 두어야, 위협만 유지하는 수보다
// 실제로 지키거나 잡는 수를 선호한다 (감점이 값보다 크면 역전된다)
const AIRCON_PRISE = 4000;

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
			// 잠금 해제 시 남은 heat 가 있으면(커피 잠금) 셀을 남겨 열을 복귀시킨다
			if (--c.lock === 0 && c.heat <= 0) delete h[sq];
		} else if (--c.heat <= 0) delete h[sq];
	}
}

function heatUp(
	h: Heat,
	from: string,
	to: string,
	color: Color,
	overheatAt: number,
) {
	const heat = (h[from]?.heat ?? 0) + 1;
	delete h[from];
	h[to] =
		heat >= overheatAt
			? { heat: 0, lock: LOCK_TURNS, color }
			: { heat, lock: 0, color };
}

// 앙파상은 잡힌 폰이 도착 칸과 다른 칸에 있다
export const capturedSquare = (m: Move) =>
	m.flags.includes("e") ? m.to[0]! + m.from[1] : m.to;

// 에어컨 기물 칸을 수를 따라 갱신 — 캐슬링 룩 동행 포함
export function airconAfter(m: Move, sq: string | null): string | null {
	if (sq === m.from) return m.to;
	const rank = m.from[1];
	if (m.flags.includes("k") && sq === "h" + rank) return "f" + rank;
	if (m.flags.includes("q") && sq === "a" + rank) return "d" + rank;
	return sq;
}

export function applyHeat(
	prev: Heat,
	m: Move,
	noHeat = false,
	overheatAt = OVERHEAT,
): Heat {
	if (noHeat) return prev;
	const h = clone(prev);
	delete h[capturedSquare(m)];
	cool(h, m.color, m.from);
	// 킹은 과열되지 않는다 — 아니면 체크를 피하지 못해 게임이 막힌다
	if (m.piece === "k") delete h[m.from];
	else heatUp(h, m.from, m.to, m.color, overheatAt);
	const rank = m.from[1]!;
	if (m.flags.includes("k"))
		heatUp(h, "h" + rank, "f" + rank, m.color, overheatAt);
	if (m.flags.includes("q"))
		heatUp(h, "a" + rank, "d" + rank, m.color, overheatAt);
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

// ── 아이템 체스 모드 ──────────────────────────────────────

export type Item = "fan" | "coffee" | "dome";

// 아이템 추첨 — fan 80%, coffee 15%, dome 5%. r 은 테스트 주입용
export function rollItem(r = Math.random()): Item {
	if (r < 0.8) return "fan";
	if (r < 0.95) return "coffee";
	return "dome";
}

// 선풍기 — 내(color) 잠긴 기물 전부 즉시 해제 (해제 = heat 0 이므로 셀 제거)
// squares 는 해제된 칸 목록 (애니메이션용). 잠긴 게 없으면 원본 그대로
export function useFan(
	h: Heat,
	color: Color,
): { heat: Heat; squares: string[] } {
	const squares = Object.entries(h)
		.filter(([, c]) => c.color === color && c.lock > 0)
		.map(([sq]) => sq);
	if (squares.length === 0) return { heat: h, squares };
	const next = clone(h);
	for (const sq of squares) delete next[sq];
	return { heat: next, squares };
}

// 커피 후보 — 상대(foe) 기물 중 킹 제외·아직 안 잠긴 것
function coffeeTargets(h: Heat, chess: Chess, foe: Color): string[] {
	return chess
		.board()
		.flat()
		.filter(
			(p): p is NonNullable<typeof p> =>
				p !== null &&
				p.color === foe &&
				p.type !== "k" &&
				!isLocked(h, p.square),
		)
		.map((p) => p.square);
}

// 커피 대상이 있는지 — useCoffee 와 동일 기준 (대상 없으면 아이템 소모 안 함)
export function hasCoffeeTarget(h: Heat, chess: Chess, foe: Color): boolean {
	return coffeeTargets(h, chess, foe).length > 0;
}

// 뜨거운 아메리카노 — 후보 하나를 랜덤으로 골라 LOCK_TURNS 만큼 잠근다.
// 이후엔 기존 cool() 이 foe 턴마다 lock 을 줄여 자연 해제한다. r 은 테스트 주입용
export function useCoffee(
	h: Heat,
	chess: Chess,
	foe: Color,
	r = Math.random(),
): { heat: Heat; square: string | null } {
	const targets = coffeeTargets(h, chess, foe);
	// 대상이 없으면 인덱스가 undefined — null 로 알린다
	const square = targets[Math.floor(r * targets.length)];
	if (!square) return { heat: h, square: null };
	const next = clone(h);
	// 누적 heat 은 보존한다 — 잠금이 풀리면 원래 열로 복귀
	next[square] = { heat: h[square]?.heat ?? 0, lock: LOCK_TURNS, color: foe };
	return { heat: next, square };
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

// 중앙 접근 보너스 가중치 (칸당 0~6 곱). 킹은 음수 — 구석에 머물게
const CENT: Record<string, number> = { p: 2, n: 5, b: 4, r: 1, q: 1, k: -4 };

function evaluate(chess: Chess, h: Heat, aircon: string | null): number {
	const me = chess.turn();
	let s = 0;
	// 탐색 핫패스 — 클로저(forEach) 대신 인덱스 루프
	const board = chess.board();
	for (let r = 0; r < 8; r++) {
		const row = board[r]!;
		for (let f = 0; f < 8; f++) {
			const p = row[f];
			if (!p) continue;
			const cent = 7 - Math.abs(2 * f - 7) / 2 - Math.abs(2 * r - 7) / 2;
			let v = VALUE[p.type]! + CENT[p.type]! * cent;
			// 폰 전진 보너스 — 승격 방향으로 한 칸당 5점
			if (p.type === "p") v += 5 * (p.color === "w" ? 6 - r : r - 1);
			s += p.color === me ? v : -v;
		}
	}
	for (const c of Object.values(h))
		s += (c.color === me ? -1 : 1) * (c.lock > 0 ? 60 : c.heat * 10);
	// AI 는 자기 에어컨 기물을 알고 있으니 지키도록 평가에 넣는다 — aircon 은
	// 항상 AI 자신의 칸. 상대 에어컨은 비밀이므로 잡는 쪽은 보너스가 없다
	if (aircon) {
		const p = chess.get(aircon as Square);
		if (p) {
			const dir = me === p.color ? 1 : -1;
			s += dir * AIRCON_VALUE;
			if (chess.isAttacked(aircon as Square, p.color === "w" ? "b" : "w"))
				s -= dir * AIRCON_PRISE;
		}
	}
	return s;
}

// MVV-LVA: 큰 기물을 작은 기물로 잡는 수부터
const orderCaptures = (a: Move, b: Move) =>
	(b.captured ? VALUE[b.captured]! - VALUE[b.piece]! / 10 : 0) -
	(a.captured ? VALUE[a.captured]! - VALUE[a.piece]! / 10 : 0);

// depth 소진 후 캡처만 이어서 탐색 — 교환 도중에 평가가 끊기는 horizon 방지
// 캡처 4수 제한 + delta pruning 으로 폭발 방지
function quiesce(
	chess: Chess,
	h: Heat,
	alpha: number,
	beta: number,
	noHeat: boolean,
	aircon: string | null,
	overheatAt: number,
	depth = 4,
	preMoves?: Move[], // 호출자가 이미 생성한 수 목록 재활용 (수 생성이 제일 비싸다)
): number {
	if ((++nodes & 63) === 0 && performance.now() > deadline) throw ABORT;
	const stand = evaluate(chess, h, aircon);
	if (depth === 0 || stand >= beta) return stand;
	if (stand > alpha) alpha = stand;
	const moves = (preMoves ?? legalMoves(chess, h))
		.filter((m) => m.captured)
		.sort(orderCaptures);
	let best = stand;
	for (const m of moves) {
		// delta pruning: 잡아도 alpha 에 못 미치는 캡처는 건너뛴다
		if (stand + VALUE[m.captured!]! + 200 <= alpha) continue;
		chess.move({ from: m.from, to: m.to, promotion: m.promotion ?? "q" });
		let score: number;
		try {
			score = -quiesce(
				chess,
				applyHeat(h, m, noHeat, overheatAt),
				-beta,
				-alpha,
				noHeat,
				airconAfter(m, aircon),
				overheatAt,
				depth - 1,
			);
		} finally {
			chess.undo();
		}
		if (score > best) best = score;
		if (best > alpha) alpha = best;
		if (alpha >= beta) break;
	}
	return best;
}

function negamax(
	chess: Chess,
	h: Heat,
	depth: number,
	alpha: number,
	beta: number,
	noHeat: boolean,
	aircon: string | null,
	overheatAt: number,
): number {
	const moves = legalMoves(chess, h);
	if (moves.length === 0) {
		if (chess.isCheck()) return -99999 - depth;
		if (chess.moves().length === 0) return 0;
		return evaluate(chess, h, aircon);
	}
	if (depth === 0)
		return quiesce(chess, h, alpha, beta, noHeat, aircon, overheatAt, 4, moves);
	// 시간 제한 초과 시 탐색 중단 — try/finally 로 보드 상태는 복원된다
	if ((++nodes & 63) === 0 && performance.now() > deadline) throw ABORT;
	moves.sort(orderCaptures);
	let best = -Infinity;
	for (const m of moves) {
		chess.move({ from: m.from, to: m.to, promotion: m.promotion ?? "q" });
		let score: number;
		try {
			score = -negamax(
				chess,
				applyHeat(h, m, noHeat, overheatAt),
				depth - 1,
				-beta,
				-alpha,
				noHeat,
				airconAfter(m, aircon),
				overheatAt,
			);
		} finally {
			chess.undo();
		}
		if (score > best) best = score;
		if (best > alpha) alpha = best;
		if (alpha >= beta) break;
	}
	return best;
}

const ABORT = Symbol("timeout");
let deadline = Infinity;
let nodes = 0;

// iterative deepening: depth 1부터 올려가며 탐색, timeMs 초과 시 마지막
// 완료 depth 의 결과 사용. 이전 반복 점수순 정렬이 가지치기를 크게 돕는다.
export function bestMove(
	chess: Chess,
	h: Heat,
	depth = 3,
	noHeat = false,
	aircon: string | null = null,
	timeMs = 0,
	overheatAt = OVERHEAT,
): Move | null {
	const moves = legalMoves(chess, h);
	if (moves.length === 0) return null;
	deadline = timeMs > 0 ? performance.now() + timeMs : Infinity;
	nodes = 0;
	let best = moves[0]!;
	const scores = new Map<Move, number>();
	for (let d = 1; d <= depth; d++) {
		const dStart = performance.now();
		let iterBest = null;
		let iterScore = -Infinity;
		try {
			for (const m of moves) {
				chess.move({ from: m.from, to: m.to, promotion: m.promotion ?? "q" });
				let score: number;
				try {
					score = -negamax(
						chess,
						applyHeat(h, m, noHeat, overheatAt),
						d - 1,
						-Infinity,
						-iterScore,
						noHeat,
						airconAfter(m, aircon),
						overheatAt,
					);
				} finally {
					chess.undo();
				}
				scores.set(m, score);
				if (score > iterScore) {
					iterScore = score;
					iterBest = m;
				}
			}
		} catch (e) {
			if (e !== ABORT) throw e;
			break; // 시간 초과 — 이번 depth 는 버리고 직전 결과 유지
		}
		if (iterBest) best = iterBest;
		moves.sort(
			(a, b) => (scores.get(b) ?? -Infinity) - (scores.get(a) ?? -Infinity),
		);
		// 다음 depth 는 통상 직전의 수 배 — 남은 예산이 직전 소요의 2배 미만이면
		// 어차피 못 끝내므로 여기서 멈춰 예산 낭비를 줄인다 (timeMs=0 이면 무제한)
		const now = performance.now();
		if (now + (now - dStart) * 2 > deadline) break;
	}
	return best;
}
