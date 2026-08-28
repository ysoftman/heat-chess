// 아이템 발동 연출 — 선풍기(fanFx) / 뜨거운 아메리카노(coffeeFx) / 이중열돔(domeFx).
import fanSvg from "./fan.svg";

// CSS 는 모듈 로드 시 <style> 로 1회 주입하고, 일시 연출 노드는 타이머로 스스로 제거한다.
// (reduced-motion 에서 animation 이 꺼지면 animationend 가 안 오므로 타이머 제거가 안전하다)

const FX_MS = 1500;

const CSS = `
/* 칸(.sq, position:relative) 위에 얹는 일시 오버레이 공통 */
.fx-fan,
.fx-coffee {
	position: absolute;
	inset: 0;
	overflow: hidden;
	pointer-events: none;
	z-index: 3;
}
/* 선풍기 — 회전하는 팬 SVG(fan.svg) + 퍼지는 바람 링 (바람 링은 에어콘과 같은 한색 계열) */
.fx-fan {
	display: grid;
	place-items: center;
}
.fx-fan img {
	width: 48%;
	filter: drop-shadow(0 0 6px #6fd3ff) drop-shadow(0 0 14px #4fb8ff88);
	animation: fx-spin 0.5s linear 3;
}
.fx-fan::after {
	content: "";
	position: absolute;
	inset: 18%;
	border-radius: 50%;
	border: 2px solid #6fd3ffaa;
	opacity: 0;
	animation: fx-wind-ring 0.75s ease-out 2;
}
@keyframes fx-spin {
	to {
		transform: rotate(360deg);
	}
}
@keyframes fx-wind-ring {
	0% {
		transform: scale(0.35);
		opacity: 0.9;
	}
	100% {
		transform: scale(1.5);
		opacity: 0;
	}
}
/* 아메리카노 — ☕ 가 기울며 쏟아지고, 바닥에 갈색 얼룩이 번지고, 김이 오른다 */
.fx-coffee::before {
	content: "☕";
	position: absolute;
	top: 4%;
	left: 50%;
	font-size: min(5.5vw, 26px);
	line-height: 1;
	transform-origin: 80% 90%;
	animation: fx-pour ${FX_MS}ms ease-in forwards;
}
.fx-coffee::after {
	content: "";
	position: absolute;
	left: 12%;
	right: 12%;
	bottom: 6%;
	height: 36%;
	border-radius: 50%;
	background: radial-gradient(
		ellipse at center,
		#4a2a12e6 0%,
		#5c351bcc 55%,
		transparent 78%
	);
	opacity: 0;
	animation: fx-stain ${FX_MS}ms ease-out forwards;
}
@keyframes fx-pour {
	0% {
		transform: translateX(-50%) rotate(0deg);
		opacity: 1;
	}
	35%,
	80% {
		transform: translateX(-50%) rotate(105deg);
		opacity: 1;
	}
	100% {
		transform: translateX(-50%) rotate(105deg);
		opacity: 0;
	}
}
@keyframes fx-stain {
	0% {
		transform: scale(0.15);
		opacity: 0;
	}
	30% {
		opacity: 0.95;
	}
	75% {
		transform: scale(1);
		opacity: 0.95;
	}
	100% {
		transform: scale(1.05);
		opacity: 0;
	}
}
/* 김 줄기 — 기존 .steam 과 같은 상승 패턴이되 커피색, 1회성 */
.fx-coffee-steam {
	position: absolute;
	inset: 0;
	overflow: hidden;
}
.fx-coffee-steam::before,
.fx-coffee-steam::after {
	content: "~";
	position: absolute;
	left: 30%;
	bottom: 28%;
	font-size: min(3.5vw, 18px);
	line-height: 1;
	color: #e8d9c8;
	text-shadow: 0 0 6px #fff6;
	opacity: 0;
	animation: fx-coffee-rise 1s linear 1;
}
.fx-coffee-steam::after {
	left: 58%;
	animation-delay: 0.4s;
}
@keyframes fx-coffee-rise {
	0% {
		transform: translateY(0) scale(0.7);
		opacity: 0;
	}
	25% {
		opacity: 0.9;
	}
	100% {
		transform: translateY(-160%) scale(1.15);
		opacity: 0;
	}
}
/* 이중열돔 발동 순간 — 보드 전체를 덮치는 열 플래시 (boardEl 직속 자식) */
.fx-dome-burst {
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 6;
	background: radial-gradient(circle, #ffb35c22 0%, #ff5a0044 55%, #ff3d0077 100%);
	opacity: 0;
	animation: fx-dome-burst 0.9s ease-out forwards;
}
@keyframes fx-dome-burst {
	0% {
		transform: scale(0.6);
		opacity: 0;
	}
	25% {
		opacity: 1;
	}
	100% {
		transform: scale(1);
		opacity: 0;
	}
}
/* 이중열돔 지속 — 보드 테두리를 감싸는 뜨거운 아지랑이.
   바깥 글로우는 box-shadow 맥동(#board 원래 그림자 유지), 안쪽은 ::after 의 inset 글로우 */
.dome-on {
	position: relative;
	animation: fx-dome-glow 2.4s ease-in-out infinite;
}
.dome-on::after {
	content: "";
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 5;
	border-radius: inherit;
	box-shadow:
		inset 0 0 26px #ff5a0055,
		inset 0 0 10px #ff7a1a66;
	animation: fx-dome-haze 2.4s ease-in-out infinite;
}
@keyframes fx-dome-glow {
	0%,
	100% {
		box-shadow:
			0 24px 60px -16px #000d,
			0 0 16px 2px #ff5a0066,
			0 0 40px 8px #ff7a1a33;
	}
	50% {
		box-shadow:
			0 24px 60px -16px #000d,
			0 0 26px 6px #ff5a00aa,
			0 0 60px 14px #ff7a1a55;
	}
}
@keyframes fx-dome-haze {
	0%,
	100% {
		opacity: 0.55;
	}
	50% {
		opacity: 1;
	}
}
@media (prefers-reduced-motion: reduce) {
	/* 무한 반복(열돔)은 정적 글로우로 고정, 일시 연출도 움직임 없이 잠깐 보이고 사라진다 */
	.fx-fan img,
	.fx-fan::after,
	.fx-coffee::before,
	.fx-coffee::after,
	.fx-coffee-steam::before,
	.fx-coffee-steam::after,
	.fx-dome-burst,
	.dome-on,
	.dome-on::after {
		animation: none;
	}
	.fx-fan::after {
		opacity: 0.7;
		transform: scale(1.2);
	}
	.fx-coffee::before {
		transform: translateX(-50%) rotate(105deg);
	}
	.fx-coffee::after {
		opacity: 0.85;
	}
	.fx-coffee-steam::before,
	.fx-coffee-steam::after {
		opacity: 0.6;
		transform: translateY(-90%);
	}
	.fx-dome-burst {
		opacity: 0;
	}
	.dome-on {
		box-shadow:
			0 24px 60px -16px #000d,
			0 0 20px 4px #ff5a0088,
			0 0 48px 10px #ff7a1a44;
	}
	.dome-on::after {
		opacity: 0.8;
	}
}
`;

const style = document.createElement("style");
style.textContent = CSS;
document.head.append(style);

// 칸 위에 일시 오버레이를 얹고 FX_MS 뒤 스스로 제거한다.
// render() 의 replaceChildren 으로 칸이 먼저 사라져도 detached 노드의 remove() 는 no-op.
function overlay(boardEl: HTMLElement, sq: string, className: string) {
	const cell = boardEl.querySelector<HTMLElement>(`[data-sq="${sq}"]`);
	if (!cell) return null;
	const el = document.createElement("span");
	el.className = className;
	el.setAttribute("aria-hidden", "true");
	cell.append(el);
	setTimeout(() => el.remove(), FX_MS);
	return el;
}

// 선풍기: squares 의 각 칸 위에 팬(SVG)이 돌며 바람이 부는 연출 (~1.5초 후 자동 제거)
export function fanFx(boardEl: HTMLElement, squares: string[]): void {
	for (const sq of squares) {
		const el = overlay(boardEl, sq, "fx-fan");
		if (!el) continue;
		const img = document.createElement("img");
		img.src = fanSvg;
		img.alt = "";
		el.append(img);
	}
}

// 뜨거운 아메리카노: square 칸에 김이 나는 커피를 쏟는 연출 (~1.5초 후 자동 제거)
export function coffeeFx(boardEl: HTMLElement, square: string): void {
	const el = overlay(boardEl, square, "fx-coffee");
	if (!el) return;
	const steam = document.createElement("i");
	steam.className = "fx-coffee-steam";
	el.append(steam);
}

// 이중열돔: 발동 순간 플래시 + boardEl 에 dome-on 클래스(게임 끝까지 지속되는 아지랑이).
// 해제는 호출 측이 boardEl.classList.remove("dome-on") 으로 한다.
export function domeFx(boardEl: HTMLElement): void {
	boardEl.classList.add("dome-on");
	const burst = document.createElement("span");
	burst.className = "fx-dome-burst";
	burst.setAttribute("aria-hidden", "true");
	boardEl.append(burst);
	setTimeout(() => burst.remove(), FX_MS);
}
