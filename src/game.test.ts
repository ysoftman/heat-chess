import { expect, test } from "bun:test";
import { Chess } from "chess.js";
import {
	airconAfter,
	applyHeat,
	bestMove,
	capturedSquare,
	type Heat,
	legalMoves,
	pass,
	status,
} from "./game";

function play(sans: string[]) {
	const chess = new Chess();
	let h: Heat = {};
	for (const san of sans) h = applyHeat(h, chess.move(san));
	return { chess, h };
}

test("움직인 기물은 달아오르고 쉰 기물은 식는다", () => {
	const { h } = play(["Nf3", "Nf6", "e4", "e5"]);
	expect(h.f3).toBeUndefined(); // 나이트는 한 턴 쉬어 heat 1 → 0
	expect(h.e4!.heat).toBe(1);
});

test("네 번 움직이면 과열되어 두 턴 쉰다", () => {
	const chess = new Chess();
	let h: Heat = {};
	const mv = (san: string) => (h = applyHeat(h, chess.move(san)));
	const canMoveG1 = () => legalMoves(chess, h).some((m) => m.from === "g1");

	mv("Nf3");
	mv("Nf6");
	mv("Ng1");
	mv("Ng8");
	mv("Nf3");
	mv("Nf6");
	expect(h.f3!.heat).toBe(3);
	mv("Ng1"); // 4회째 → 과열
	expect(h.g1).toEqual({ heat: 0, lock: 2, color: "w" });

	mv("Ng8");
	expect(canMoveG1()).toBe(false);
	mv("e4");
	mv("e5");
	expect(h.g1!.lock).toBe(1);
	expect(canMoveG1()).toBe(false);
	mv("d4");
	mv("d5");
	expect(h.g1).toBeUndefined();
	expect(canMoveG1()).toBe(true);
});

test("킹은 과열되지 않는다", () => {
	const { h } = play(["e4", "e5", "Ke2", "Ke7"]);
	expect(h.e2).toBeUndefined();
	expect(h.e7).toBeUndefined();
});

test("앙파상으로 잡힌 폰의 heat 도 사라진다", () => {
	const { h } = play(["e4", "a6", "e5", "d5", "exd6"]);
	expect(h.d5).toBeUndefined();
	expect(h.d6!.heat).toBe(3);
});

test("에어콘 기물 칸은 이동과 캐슬링 룩을 따라간다", () => {
	const chess = new Chess();
	let rook: string | null = "h1"; // 백 h룩을 에어콘으로
	let pawn: string | null = "e2"; // 백 e폰을 에어콘으로
	for (const san of ["e4", "e5", "Nf3", "Nf6", "Bc4", "Bc5", "O-O"]) {
		const m = chess.move(san);
		if (m.color !== "w") continue;
		rook = airconAfter(m, rook);
		pawn = airconAfter(m, pawn);
	}
	expect(rook).toBe("f1");
	expect(pawn).toBe("e4");
});

test("앙파상의 실제 잡힌 칸을 알아낸다", () => {
	const chess = new Chess();
	for (const san of ["e4", "a6", "e5", "d5"]) chess.move(san);
	expect(capturedSquare(chess.move("exd6"))).toBe("d5");
});

test("에어콘 모드(noHeat)에서는 열이 쌓이지 않아 잠기지 않는다", () => {
	const chess = new Chess();
	let h: Heat = {};
	const mv = (san: string) => (h = applyHeat(h, chess.move(san), true));

	for (const san of ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1"]) mv(san);
	expect(h).toEqual({}); // 일반 모드였다면 4회째에 잠겼을 자리에도 열이 없다
	mv("e5"); // 흑 차례라 한 수 더 둔 뒤 백 기물 이동 가능 여부를 본다
	expect(legalMoves(chess, h).some((m) => m.from === "g1")).toBe(true);
});

test("체크 중 전부 과열이면 히트메이트로 진다", () => {
	// 흑 비숍 b7 이 h1 킹을 체크 — 유일한 응수 Nf3 의 나이트가 잠겨 있다
	const chess = new Chess("7k/1b6/8/8/8/8/7P/6NK w - - 0 1");
	const h: Heat = { g1: { heat: 0, lock: 2, color: "w" } };
	const st = status(chess, h);
	expect(st.over).toBe(true);
	expect(st.text).toContain("히트메이트");
});

test("체크가 아니면 전부 과열은 한 턴 쉼이다", () => {
	const chess = new Chess("7k/8/8/8/8/8/6PP/6NK w - - 0 1");
	const h: Heat = {
		g1: { heat: 0, lock: 2, color: "w" },
		g2: { heat: 0, lock: 2, color: "w" },
		h2: { heat: 0, lock: 2, color: "w" },
	};
	const st = status(chess, h);
	expect(st.over).toBe(false);
	expect(st.mustPass).toBe(true);
});

test("pass 는 차례만 넘기고 내 기물을 식힌다", () => {
	const chess = new Chess("7k/8/8/8/8/8/6PP/6NK w - - 0 1");
	const h = pass(chess, {
		g1: { heat: 0, lock: 2, color: "w" },
		h2: { heat: 2, lock: 0, color: "w" },
	});
	const f = chess.fen().split(" ");
	expect(chess.turn()).toBe("b");
	expect(f[3]).toBe("-"); // 앙파상 소멸
	expect(f[4]).toBe("1"); // 50수 규칙 카운터는 계속 간다
	expect(f[5]).toBe("1"); // 백 패스로는 수 번호가 늘지 않는다
	expect(h.g1!.lock).toBe(1);
	expect(h.h2!.heat).toBe(1);
});

test("AI 는 과열되지 않은 합법수를 고른다", () => {
	const chess = new Chess();
	const h: Heat = { g1: { heat: 0, lock: 2, color: "w" } };
	const m = bestMove(chess, h, 2)!;
	expect(m.from).not.toBe("g1");
	expect(chess.moves({ verbose: true }).some((x) => x.san === m.san)).toBe(
		true,
	);
});

// 백 비숍 b6 이 에어콘 폰(a7)을 위협, 흑 나이트 e2 는 백 퀸(f4)을 먹을 수 있다
const AIRCON_TRAP = "7k/p7/1B6/8/5Q2/8/4n3/7K b - - 0 1";

test("에어콘 인식이 없으면 AI 는 퀸을 먹는 수를 고른다", () => {
	const m = bestMove(new Chess(AIRCON_TRAP), {}, 2)!;
	expect(m.from).toBe("e2"); // Nxf4 — 기물 교환으론 이득
});

test("에어콘 인식이 있으면 AI 는 퀸을 포기하고도 에어콘 기물을 지킨다", () => {
	const m = bestMove(new Chess(AIRCON_TRAP), {}, 2, false, "a7")!;
	expect(m.from).toBe("a7"); // axb6 — 비숍을 잡아 폰을 살린다
	expect(m.to).toBe("b6");
});
