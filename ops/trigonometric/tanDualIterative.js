/**
 * High-precision 4-part Cody-Waite split of π/2.
 * Each of PI_HALF_C1, PI_HALF_C2, PI_HALF_C3 has at most 24 significant bits
 * so multiplication by 24-bit / 29-bit split parts of the quadrant index `k`
 * is exact in IEEE-754 double precision.
 */
const PI_HALF_C1 = 1.5707963705062866;
const PI_HALF_C2 = -4.371138828673793e-8;
const PI_HALF_C3 = -1.7151245100058819e-15;
const PI_HALF_C4 = 1.0562999066987428e-23;

const INV_PI_HALF = 2 / Math.PI;
const TWO_POW_24 = 16777216;
const POLE_EPSILON = 1e-15;
const TAYLOR_EPSILON = 1e-17;
const MAX_TAYLOR_TERMS = 16;

/**
 * Computes `sin(v)` and `cos(v)` iteratively via Cody-Waite quadrant range
 * reduction into `[-π/4, π/4]` followed by iterative Taylor series evaluation.
 *
 * @param {number} v - Finite angle in radians.
 * @returns {{ s: number, c: number }} Approximate sine and cosine of `v`.
 */
function sinCosIterative(v) {
	const k = Math.round(v * INV_PI_HALF);
	const kHi = Math.trunc(k / TWO_POW_24) * TWO_POW_24;
	const kLo = k - kHi;

	let r = v - kHi * PI_HALF_C1 - kLo * PI_HALF_C1;
	r = r - kHi * PI_HALF_C2 - kLo * PI_HALF_C2;
	r = r - kHi * PI_HALF_C3 - kLo * PI_HALF_C3;
	r = r - k * PI_HALF_C4;

	const r2 = r * r;
	let sinR = r;
	let sinTerm = r;
	let cosR = 1;
	let cosTerm = 1;

	for (let n = 1; n <= MAX_TAYLOR_TERMS; n += 1) {
		const twoN = 2 * n;
		cosTerm = (-cosTerm * r2) / ((twoN - 1) * twoN);
		cosR += cosTerm;

		sinTerm = (-sinTerm * r2) / (twoN * (twoN + 1));
		sinR += sinTerm;

		if (Math.abs(cosTerm) <= TAYLOR_EPSILON && Math.abs(sinTerm) <= TAYLOR_EPSILON) {
			break;
		}
	}

	const quadrant = ((k % 4) + 4) % 4;
	if (quadrant === 0) {
		return { s: sinR, c: cosR };
	}
	if (quadrant === 1) {
		return { s: cosR, c: -sinR };
	}
	if (quadrant === 2) {
		return { s: -sinR, c: -cosR };
	}
	return { s: -cosR, c: sinR };
}

/**
 * Computes the tangent `tan(x)` over dual numbers `{ v, d }` carrying a
 * forward-mode derivative alongside the primal value, using an iterative
 * range-reduced Taylor series for sine and cosine.
 *
 * For a dual number `x = v + d·ε` (with `ε² = 0`):
 *   `tan(v + d·ε) = tan(v) + (sec²(v) · d)·ε = (sin(v)/cos(v)) + (d / cos²(v))·ε`
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite primal `v` (radians) and derivative `d`.
 * @returns {{ v: number, d: number }} Dual number `{ v: tan(x.v), d: sec²(x.v) * x.d }`.
 * @throws {TypeError} If `x` is not a non-null plain object or if `x.v` or `x.d` is not a finite number.
 * @throws {RangeError} If `x.v` is at or effectively at a pole of `tan` (`|cos(x.v)| < 1e-15`), or if the result overflows to a non-finite number.
 */
export function tanDualIterative(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected dual number object { v, d }');
	}

	const { v, d } = x;

	if (typeof v !== 'number' || !Number.isFinite(v)) {
		throw new TypeError('Expected dual number primal `v` to be a finite number');
	}

	if (typeof d !== 'number' || !Number.isFinite(d)) {
		throw new TypeError('Expected dual number derivative `d` to be a finite number');
	}

	const { s, c } = sinCosIterative(v);

	if (Math.abs(c) < POLE_EPSILON) {
		throw new RangeError(
			`tanDualIterative pole encountered: |cos(${v})| < ${POLE_EPSILON}`
		);
	}

	const tanVal = s / c;
	const tanDeriv = d / (c * c);

	if (!Number.isFinite(tanVal) || !Number.isFinite(tanDeriv)) {
		throw new RangeError(
			`tanDualIterative overflowed to non-finite result for v=${v}, d=${d}`
		);
	}

	return { v: tanVal, d: tanDeriv };
}
