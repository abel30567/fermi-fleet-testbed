/**
 * Element-wise power (`bases[i] ** exponents[i]`) over `Float64Array` inputs
 * using a numerically robust double-double (compensated) algorithm with
 * binary exponent scaling (`frexp`/`ldexp` range reduction).
 *
 * By decomposing `|x| = m * 2^k` with `m` in `[sqrt(1/2), sqrt(2)]`,
 * evaluating `ln(|x|) = k * ln(2) + ln(m)` and `y * ln(|x|)` in ~106-bit
 * double-double arithmetic, and reducing `exp(p)` around `N * ln(2)` before
 * exact power-of-two scaling, this avoids catastrophic cancellation near
 * `x = 1` with large `|y|` as well as intermediate overflow/underflow near
 * the IEEE 754 normal and subnormal boundaries.
 *
 * @param {Float64Array} bases - Base values.
 * @param {Float64Array} exponents - Exponent values (must match `bases.length`).
 * @returns {Float64Array} New `Float64Array` containing element-wise `bases[i] ** exponents[i]`.
 * @throws {TypeError} If `bases` or `exponents` is not a `Float64Array`.
 * @throws {RangeError} If `bases` and `exponents` have different lengths.
 */

// Double-double representation of ln(2): LN2_HI + LN2_LO = ln(2) to ~106 bits.
const LN2_HI = 0.6931471805599453; // exact float64 Math.LN2
const LN2_LO = 2.3190468138462996e-17;

// Veltkamp split constant 2^27 + 1 for Dekker's exact multiplication.
const SPLIT = 134217729;

// Reusable 8-byte buffer for bit-exact IEEE 754 exponent extraction and scaling.
const BIT_BUF = new ArrayBuffer(8);
const BIT_F64 = new Float64Array(BIT_BUF);
const BIT_U64 = new BigUint64Array(BIT_BUF);

const MANTISSA_MASK = 0x000fffffffffffffn;
const EXP_ZERO_BITS = 0x3ff0000000000000n;
const SUBNORMAL_SCALE = 18014398509481984; // 2^54

/**
 * Exact two-sum assuming `|a| >= |b|`.
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function quickTwoSum(a, b) {
	const s = a + b;
	const e = b - (s - a);
	return [s, e];
}

/**
 * Knuth's error-free two-sum (`a + b = s + e`).
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoSum(a, b) {
	const s = a + b;
	const bb = s - a;
	const e = (a - (s - bb)) + (b - bb);
	return [s, e];
}

/**
 * Veltkamp-Dekker error-free multiplication (`a * b = p + e`).
 * Safe for all inputs well inside `[1e-140, 1e140]`.
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoProd(a, b) {
	const p = a * b;
	const ca = SPLIT * a;
	const ah = ca - (ca - a);
	const al = a - ah;
	const cb = SPLIT * b;
	const bh = cb - (cb - b);
	const bl = b - bh;
	const e = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
	return [p, e];
}

/**
 * IEEE-accurate double-double addition `(ah, al) + (bh, bl)`.
 * @param {number} ah
 * @param {number} al
 * @param {number} bh
 * @param {number} bl
 * @returns {[number, number]}
 */
function ddAdd(ah, al, bh, bl) {
	const s = ah + bh;
	const sb = s - ah;
	const se = (ah - (s - sb)) + (bh - sb);
	const t = al + bl;
	const tb = t - al;
	const te = (al - (t - tb)) + (bl - tb);
	const c = se + t;
	const vh = s + c;
	const vl = c - (vh - s);
	const w = te + vl;
	const zh = vh + w;
	const zl = w - (zh - vh);
	return [zh, zl];
}

/**
 * Double-double subtraction `(ah, al) - (bh, bl)`.
 * @param {number} ah
 * @param {number} al
 * @param {number} bh
 * @param {number} bl
 * @returns {[number, number]}
 */
function ddSub(ah, al, bh, bl) {
	return ddAdd(ah, al, -bh, -bl);
}

/**
 * Double-double multiplication `(ah, al) * (bh, bl)`.
 * @param {number} ah
 * @param {number} al
 * @param {number} bh
 * @param {number} bl
 * @returns {[number, number]}
 */
function ddMul(ah, al, bh, bl) {
	const [ph, pl] = twoProd(ah, bh);
	const e = pl + ah * bl + al * bh;
	return quickTwoSum(ph, e);
}

/**
 * Double-double times float64 `(ah, al) * b`.
 * @param {number} ah
 * @param {number} al
 * @param {number} b
 * @returns {[number, number]}
 */
function ddMulDouble(ah, al, b) {
	const [ph, pl] = twoProd(ah, b);
	const e = pl + al * b;
	return quickTwoSum(ph, e);
}

/**
 * Double-double division `(ah, al) / (bh, bl)` via 3-step quotient refinement.
 * @param {number} ah
 * @param {number} al
 * @param {number} bh
 * @param {number} bl
 * @returns {[number, number]}
 */
function ddDiv(ah, al, bh, bl) {
	const q1 = ah / bh;
	const [p1h, p1l] = ddMulDouble(bh, bl, q1);
	const [r1h, r1l] = ddSub(ah, al, p1h, p1l);
	const q2 = r1h / bh;
	const [p2h, p2l] = ddMulDouble(bh, bl, q2);
	const [r2h, r2l] = ddSub(r1h, r1l, p2h, p2l);
	const q3 = r2h / bh;
	const [sh, sl] = quickTwoSum(q1, q2);
	return ddAdd(sh, sl, q3, 0);
}

/**
 * Exact IEEE 754 power of two `2^n` for integer `n` in `[-1074, 1023]`.
 * @param {number} n
 * @returns {number}
 */
function pow2Exact(n) {
	if (n >= -1022) {
		BIT_U64[0] = BigInt(n + 1023) << 52n;
	} else {
		BIT_U64[0] = 1n << BigInt(n + 1074);
	}
	return BIT_F64[0];
}

/**
 * Decompose finite positive float64 `x` into `x = m * 2^k` with
 * `m` in `[Math.SQRT1_2, Math.SQRT2]` (exact, zero rounding error).
 * @param {number} x
 * @returns {[number, number]} `[m, k]`
 */
function decomposePos(x) {
	BIT_F64[0] = x;
	let bits = BIT_U64[0];
	let exp = Number((bits >> 52n) & 0x7ffn);
	let k;
	if (exp === 0) {
		// Subnormal: scale up into normal range without rounding.
		BIT_F64[0] = x * SUBNORMAL_SCALE;
		bits = BIT_U64[0];
		exp = Number((bits >> 52n) & 0x7ffn);
		k = exp - 1023 - 54;
	} else {
		k = exp - 1023;
	}
	BIT_U64[0] = (bits & MANTISSA_MASK) | EXP_ZERO_BITS;
	let m = BIT_F64[0];
	if (m > Math.SQRT2) {
		m *= 0.5;
		k += 1;
	}
	return [m, k];
}

/**
 * Compute `ln(m)` in double-double precision for `m` in `[sqrt(1/2), sqrt(2)]`
 * using `ln(m) = 2 * sum_{j>=0} u^(2j+1) / (2j+1)` where `u = (m - 1) / (m + 1)`.
 * Since `|u| <= 3 - 2*sqrt(2) ~= 0.1716`, the series converges to >106 bits
 * within at most 21 terms and avoids cancellation near `m = 1`.
 * @param {number} m
 * @returns {[number, number]}
 */
function ddLogNearOne(m) {
	if (m === 1) return [0, 0];
	const [numH, numL] = twoSum(m, -1);
	const [denH, denL] = twoSum(m, 1);
	const [uh, ul] = ddDiv(numH, numL, denH, denL);
	const [u2h, u2l] = ddMul(uh, ul, uh, ul);

	let sumH = uh;
	let sumL = ul;
	let powH = uh;
	let powL = ul;

	for (let d = 3; d <= 45; d += 2) {
		[powH, powL] = ddMul(powH, powL, u2h, u2l);
		const [termH, termL] = ddDiv(powH, powL, d, 0);
		[sumH, sumL] = ddAdd(sumH, sumL, termH, termL);
		if (Math.abs(termH) <= Math.abs(sumH) * 1e-33) {
			break;
		}
	}
	return [2 * sumH, 2 * sumL];
}

/**
 * Compute `exp(r)` in double-double precision for `|r| <= ln(2)/2 ~= 0.3466`.
 * @param {number} rh
 * @param {number} rl
 * @returns {[number, number]}
 */
function ddExpSmall(rh, rl) {
	let sumH = 1;
	let sumL = 0;
	let termH = 1;
	let termL = 0;

	for (let k = 1; k <= 28; k += 1) {
		[termH, termL] = ddMul(termH, termL, rh, rl);
		[termH, termL] = ddDiv(termH, termL, k, 0);
		[sumH, sumL] = ddAdd(sumH, sumL, termH, termL);
		if (Math.abs(termH) <= 1e-33) {
			break;
		}
	}
	return [sumH, sumL];
}

/**
 * Return true iff `y` is a finite odd integer.
 * Note: all float64 integers with `|y| >= 2^53` are even because ULP >= 2.
 * @param {number} y
 * @returns {boolean}
 */
function isOddInteger(y) {
	if (!Number.isInteger(y)) return false;
	const ay = Math.abs(y);
	return ay < 9007199254740992 && ay % 2 === 1;
}

/**
 * Compute `x ** y` for scalar IEEE 754 float64 values using double-double
 * arithmetic and exact power-of-two scaling.
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function powScalarStable(x, y) {
	// ECMAScript / IEEE 754 special cases.
	if (Number.isNaN(y)) return NaN;
	if (y === 0) return 1;
	if (Number.isNaN(x)) return NaN;

	if (x === 1) {
		return Number.isFinite(y) ? 1 : NaN;
	}
	if (x === -1) {
		if (!Number.isFinite(y) || !Number.isInteger(y)) return NaN;
		return isOddInteger(y) ? -1 : 1;
	}

	if (!Number.isFinite(y)) {
		const ax = Math.abs(x);
		if (y > 0) return ax > 1 ? Infinity : 0;
		return ax > 1 ? 0 : Infinity;
	}

	if (!Number.isFinite(x)) {
		if (x > 0) return y > 0 ? Infinity : 0;
		const odd = isOddInteger(y);
		if (y > 0) return odd ? -Infinity : Infinity;
		return odd ? -0 : 0;
	}

	if (x === 0) {
		const negZero = 1 / x === -Infinity;
		const odd = isOddInteger(y);
		if (y > 0) return negZero && odd ? -0 : 0;
		return negZero && odd ? -Infinity : Infinity;
	}

	// Handle negative finite bases.
	let negate = false;
	let ax = x;
	if (x < 0) {
		if (!Number.isInteger(y)) return NaN;
		negate = isOddInteger(y);
		ax = -x;
	}

	// Fast exact paths for common exponents.
	if (y === 1) return negate ? -ax : ax;
	if (y === -1) return negate ? -(1 / ax) : 1 / ax;
	if (y === 2) return ax * ax;
	if (y === 0.5) return Math.sqrt(ax);

	// Decompose |x| = m * 2^k with m in [sqrt(1/2), sqrt(2)].
	const [m, k] = decomposePos(ax);

	// Exact power-of-two base with integer exponent: (2^k)^y = 2^(k*y).
	if (m === 1 && Number.isInteger(y)) {
		const exp2 = k * y;
		let res;
		if (exp2 > 1023) {
			res = Infinity;
		} else if (exp2 < -1074) {
			res = 0;
		} else {
			res = pow2Exact(exp2);
		}
		return negate ? -res : res;
	}

	// Double-double ln(|x|) = k * ln(2) + ln(m).
	const [logMH, logML] = ddLogNearOne(m);
	const [kLn2H, kLn2L] = ddMulDouble(LN2_HI, LN2_LO, k);
	const [logH, logL] = ddAdd(kLn2H, kLn2L, logMH, logML);

	// Guard overflow, underflow, and sub-half-ULP exponents around 1.
	// This also guarantees Dekker's twoProd operates well inside safe bounds.
	const approx = y * logH;
	if (approx > 710) return negate ? -Infinity : Infinity;
	if (approx < -746) return negate ? -0 : 0;
	if (Math.abs(approx) < 1e-17) return negate ? -1 : 1;

	// Double-double product p = y * ln(|x|).
	const [pH, pL] = ddMulDouble(logH, logL, y);

	// Range reduction: p = N * ln(2) + r, with |r| <= ln(2)/2.
	const n = Math.round(pH / LN2_HI);
	const [nLn2H, nLn2L] = ddMulDouble(LN2_HI, LN2_LO, n);
	const [rH, rL] = ddSub(pH, pL, nLn2H, nLn2L);

	// Evaluate exp(r) in double-double precision and normalize into [1, 2).
	let [eH, eL] = ddExpSmall(rH, rL);
	[eH, eL] = quickTwoSum(eH, eL);
	let scaleExp = n;
	if (eH >= 2) {
		eH *= 0.5;
		eL *= 0.5;
		scaleExp += 1;
	} else if (eH < 1) {
		eH *= 2;
		eL *= 2;
		scaleExp -= 1;
	}

	// Scale by 2^scaleExp safely across normal and subnormal ranges.
	let res;
	if (scaleExp > 1023) {
		res = Infinity;
	} else if (scaleExp < -1075) {
		res = 0;
	} else if (scaleExp === -1075) {
		// Halfway to Number.MIN_VALUE (2^-1074): ties round to even (0).
		res = eH > 1 || (eH === 1 && eL > 0) ? Number.MIN_VALUE : 0;
	} else {
		res = (eH + eL) * pow2Exact(scaleExp);
	}

	return negate ? -res : res;
}

/**
 * Compute element-wise power `bases[i] ** exponents[i]` over `Float64Array`
 * inputs using a numerically robust double-double algorithm with range
 * reduction and exact power-of-two scaling.
 *
 * @param {Float64Array} bases - Input base values.
 * @param {Float64Array} exponents - Input exponent values of equal length.
 * @returns {Float64Array} New `Float64Array` of element-wise powers.
 * @throws {TypeError} If either input is not a `Float64Array`.
 * @throws {RangeError} If `bases.length !== exponents.length`.
 */
export function powerTypedStable(bases, exponents) {
	if (!(bases instanceof Float64Array)) {
		throw new TypeError('bases must be a Float64Array');
	}
	if (!(exponents instanceof Float64Array)) {
		throw new TypeError('exponents must be a Float64Array');
	}
	if (bases.length !== exponents.length) {
		throw new RangeError(
			`Length mismatch: bases (${bases.length}) !== exponents (${exponents.length})`
		);
	}

	const len = bases.length;
	const out = new Float64Array(len);
	for (let i = 0; i < len; i += 1) {
		out[i] = powScalarStable(bases[i], exponents[i]);
	}
	return out;
}
