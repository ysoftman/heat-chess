import { expect, test } from "bun:test";
import { Chess } from "chess.js";
import { applyHeat, bestMove, type Heat, legalMoves } from "./game";

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

test("AI 는 과열되지 않은 합법수를 고른다", () => {
	const chess = new Chess();
	const h: Heat = { g1: { heat: 0, lock: 2, color: "w" } };
	const m = bestMove(chess, h, 2)!;
	expect(m.from).not.toBe("g1");
	expect(chess.moves({ verbose: true }).some((x) => x.san === m.san)).toBe(
		true,
	);
});
