/**
 * Computes the principal complex arctangent `arctan(z)` for a complex number
 * `z = { re, im }` using the logarithmic identity:
 *
 *   arctan(z) = (i / 2) * ln((i + z) / (i - z))
 *
 * with iterative series evaluations and Newton-Raphson refinement for the
 * underlying square root, real/complex natural logarithm, and arctangent.
 *
 * Principal branch:
 * - Branch cuts lie along the imaginary axis for `|im| >= 1` (`(-∞i, -i]` and `[i, +∞i)`).
 * - For `re > 0`, `Re(arctan(z)) ∈ (0, π/2]`; for `re < 0`, `Re(arctan(z)) ∈ [-π/2, 0)`.
 * - On the branch cuts (`re === 0` and `|im| > 1`), continuity follows standard
 *   IEEE 754 / C99 signed-zero convention (`+0` is continuous from the right
 *   half-plane giving `Re = +π/2`; `-0` is continuous from the left giving `Re = -π/2`).
 * - At the logarithmic singularities `z = +i` and `z = -i`, throws a `RangeError`.
 *
 * @param {{ re: number, im: number }} z - Finite complex number `{ re, im }`.
 * @returns {{ re: number, im: number }} Principal value of `arctan(z)` as `{ re, im }`.
 * @throws {TypeError} If `z` is not a non-null plain/record object with numeric `re` and `im`.
 * @throws {RangeError} If `z.re` or `z.im` is non-finite (`NaN`, `±Infinity`), or if `z` is `±i`.
 */
export function arctanComplexIterative(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected a complex number object { re, im }');
	}
	const { re: x, im: y } = z;
	if (typeof x !== 'number' || typeof y !== 'number') {
		throw new TypeError('Expected numeric re and im properties');
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError('Expected finite re and im values');
	}
	if (x === 0 && (y === 1 || y === -1)) {
		throw new RangeError('arctanComplexIterative is undefined at singularities ±i');
	}

	const absX = Math.abs(x);
	const absY = Math.abs(y);

	// 1. Compute Re(ln((i + z) / (i - z))) = ln|(i + z) / (i - z)|.
	// Using conjugate symmetry ln|w(x, -y)| = -ln|w(x, y)|, let p = |y| >= 0.
	// Then |i + (x + ip)| >= |i - (x + ip)| > 0.
	let lnAbsW = 0;
	if (y !== 0) {
		const rNum = hypotIterative(x, 1 + absY);
		const rDen = hypotIterative(x, 1 - absY);
		let mag;
		if (rNum >= 2 * rDen) {
			// Well separated from 1: direct difference has no cancellation and avoids overflow.
			mag = lnPositiveIterative(rNum) - lnPositiveIterative(rDen);
		} else {
			// Close to 1: |w|^2 = 1 + 4p / rDen^2; since rNum < 2*rDen and rNum >= 1, rDen > 0.5.
			const delta = (4 * (absY / rDen)) / rDen;
			mag = 0.5 * ln1pIterative(delta);
		}
		lnAbsW = y < 0 ? -mag : mag;
	}

	// 2. Compute Im(ln((i + z) / (i - z))) = arg((i + z) / (i - z)).
	// Algebraically, (i + z) / (i - z) = ((1 - x^2 - y^2) + i * (-2x)) / (x^2 + (1 - y)^2).
	// Since the denominator is strictly positive, the argument depends only on the numerator (u, v).
	const maxCoord = absX >= absY ? absX : absY;
	let u;
	let v;
	let denomScaled = 0;
	if (maxCoord >= 2) {
		const invS = 1 / maxCoord;
		const xs = x * invS;
		const ys = y * invS;
		u = invS * invS - (xs * xs + ys * ys);
		v = -2 * xs * invS;
		const dy = invS - ys;
		denomScaled = xs * xs + dy * dy;
	} else {
		// Factored form prevents catastrophic cancellation near (±1, 0) and (0, ±1).
		u = absY >= absX
			? (1 - absY) * (1 + absY) - x * x
			: (1 - absX) * (1 + absX) - y * y;
		v = -2 * x;
		const dy = 1 - y;
		denomScaled = x * x + dy * dy;
	}

	let argW = atan2Iterative(v, u);

	// 3. Complex Newton-Raphson refinement on f(L) = exp(L) - w = 0:
	//    L_{k+1} = L_k + w * exp(-L_k) - 1
	// Applied when w = (i + z) / (i - z) is well-conditioned (off the real axis,
	// bounded away from 0, ∞, and 1 where direct w loses relative precision in |w| - 1).
	if (x !== 0 && y !== 0 && maxCoord < 1e6 && denomScaled > 1e-12 && Math.abs(lnAbsW) <= 20) {
		const wRe = u / denomScaled;
		const wIm = v / denomScaled;
		if (Math.abs(wRe - 1) + Math.abs(wIm) >= 0.05) {
			const refined = refineComplexLnNewton(wRe, wIm, lnAbsW, argW);
			lnAbsW = refined.re;
			argW = refined.im;
		}
	}

	// 4. Multiply by (i / 2): (i / 2) * (lnAbsW + i * argW) = (-argW / 2) + i * (lnAbsW / 2).
	const outRe = -0.5 * argW;
	const outIm = 0.5 * lnAbsW;

	return {
		re: outRe === 0 ? 0 : outRe,
		im: outIm === 0 ? 0 : outIm,
	};
}

/**
 * Iterative Heron's method square root for `x >= 0` with power-of-2 scaling
 * across the full IEEE 754 range.
 *
 * @param {number} x - Non-negative finite number.
 * @returns {number} Square root of `x`.
 */
function sqrtIterative(x) {
	if (x === 0) {
		return 0;
	}

	// Scale x = m * 4^k into [0.5, 2] so Heron's iteration always converges in <= 6 steps.
	const SCALE_STEPS = [
		[1.3407807929942597e154, 1.157920892373162e77], // 2^512, 2^256
		[1.157920892373162e77, 3.402823669209385e38],    // 2^256, 2^128
		[3.402823669209385e38, 1.8446744073709552e19],   // 2^128, 2^64
		[1.8446744073709552e19, 4294967296],             // 2^64, 2^32
		[4294967296, 65536],                             // 2^32, 2^16
		[65536, 256],                                    // 2^16, 2^8
		[256, 16],                                       // 2^8, 2^4
		[16, 4],                                         // 2^4, 2^2
		[4, 2],                                          // 2^2, 2^1
	];

	let m = x;
	let factor = 1;
	for (let i = 0; i < SCALE_STEPS.length; i++) {
		const [sq, root] = SCALE_STEPS[i];
		while (m >= sq) {
			m /= sq;
			factor *= root;
		}
		const invSq = 1 / sq;
		while (m < invSq) {
			m *= sq;
			factor /= root;
		}
	}
	if (m < 0.5) {
		m *= 4;
		factor *= 0.5;
	} else if (m > 2) {
		m *= 0.25;
		factor *= 2;
	}

	let g = 0.5 * (m + 1);
	for (let i = 0; i < 12; i++) {
		const next = 0.5 * (g + m / g);
		if (Math.abs(next - g) <= 1e-16 * next) {
			g = next;
			break;
		}
		g = next;
	}
	return g * factor;
}

/**
 * Overflow-safe Euclidean hypotenuse `sqrt(a^2 + b^2)` using `sqrtIterative`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function hypotIterative(a, b) {
	const aa = Math.abs(a);
	const bb = Math.abs(b);
	const hi = aa >= bb ? aa : bb;
	const lo = aa >= bb ? bb : aa;
	if (hi === 0) {
		return 0;
	}
	const ratio = lo / hi;
	return hi * sqrtIterative(1 + ratio * ratio);
}

/**
 * Iterative Taylor series for `exp(x)` on `|x| <= 1`.
 *
 * @param {number} x
 * @returns {number}
 */
function expSmallIterative(x) {
	let sum = 1;
	let term = 1;
	for (let n = 1; n <= 30; n++) {
		term = (term * x) / n;
		sum += term;
		if (Math.abs(term) <= 1e-17 * Math.abs(sum)) {
			break;
		}
	}
	return sum;
}

/**
 * Iterative real exponential `exp(x)` for moderate `|x| <= 50` via range reduction
 * `x = k * ln(2) + r` with `|r| <= ln(2)/2`.
 *
 * @param {number} x
 * @returns {number}
 */
function expModerateIterative(x) {
	const k = Math.round(x / Math.LN2);
	const r = x - k * Math.LN2;
	let val = expSmallIterative(r);
	if (k > 0) {
		for (let i = 0; i < k; i++) {
			val *= 2;
		}
	} else if (k < 0) {
		for (let i = 0; i < -k; i++) {
			val *= 0.5;
		}
	}
	return val;
}

/**
 * Iterative Taylor series for `sin(x)` and `cos(x)` on `|x| <= π/4`.
 *
 * @param {number} x
 * @returns {{ sin: number, cos: number }}
 */
function sinCosSmallIterative(x) {
	const x2 = x * x;
	let sinSum = x;
	let sinTerm = x;
	for (let n = 1; n <= 16; n++) {
		sinTerm = (-sinTerm * x2) / ((2 * n) * (2 * n + 1));
		sinSum += sinTerm;
		if (Math.abs(sinTerm) <= 1e-17 * Math.abs(sinSum)) {
			break;
		}
	}

	let cosSum = 1;
	let cosTerm = 1;
	for (let n = 1; n <= 16; n++) {
		cosTerm = (-cosTerm * x2) / ((2 * n - 1) * (2 * n));
		cosSum += cosTerm;
		if (Math.abs(cosTerm) <= 1e-17 * Math.abs(cosSum)) {
			break;
		}
	}

	return { sin: sinSum, cos: cosSum };
}

/**
 * Iterative `sin(x)` and `cos(x)` for `x ∈ [-π, π]` using octant reduction.
 *
 * @param {number} x
 * @returns {{ sin: number, cos: number }}
 */
function sinCosIterative(x) {
	const sign = x < 0 ? -1 : 1;
	const ax = Math.abs(x);
	const quarterPi = 0.25 * Math.PI;
	const halfPi = 0.5 * Math.PI;

	if (ax <= quarterPi) {
		const { sin, cos } = sinCosSmallIterative(ax);
		return { sin: sign * sin, cos };
	}
	if (ax <= 3 * quarterPi) {
		const { sin, cos } = sinCosSmallIterative(halfPi - ax);
		return { sin: sign * cos, cos: sin };
	}
	const { sin, cos } = sinCosSmallIterative(Math.PI - ax);
	return { sin: sign * sin, cos: -cos };
}

/**
 * Iterative natural logarithm `ln(x)` for `x > 0` using binary range reduction
 * into `[sqrt(0.5), sqrt(2)]`, the `artanh` series, and Newton-Raphson refinement.
 *
 * @param {number} x - Strictly positive finite number.
 * @returns {number}
 */
function lnPositiveIterative(x) {
	const EXP_STEPS = [
		[1.3407807929942597e154, 512],
		[1.157920892373162e77, 256],
		[3.402823669209385e38, 128],
		[1.8446744073709552e19, 64],
		[4294967296, 32],
		[65536, 16],
		[256, 8],
		[16, 4],
		[4, 2],
		[2, 1],
	];

	let m = x;
	let k = 0;
	for (let i = 0; i < EXP_STEPS.length; i++) {
		const [pow2, exp] = EXP_STEPS[i];
		while (m >= pow2) {
			m /= pow2;
			k += exp;
		}
		const invPow2 = 1 / pow2;
		while (m < invPow2) {
			m *= pow2;
			k -= exp;
		}
	}

	if (m > Math.SQRT2) {
		m *= 0.5;
		k += 1;
	} else if (m < Math.SQRT1_2) {
		m *= 2;
		k -= 1;
	}

	// Series ln(m) = 2 * sum_{n>=0} s^(2n+1) / (2n+1), with |s| <= 3 - 2*sqrt(2) ≈ 0.1716.
	const s = (m - 1) / (m + 1);
	const s2 = s * s;
	let term = s;
	let sum = s;
	for (let n = 1; n <= 30; n++) {
		term *= s2;
		const add = term / (2 * n + 1);
		sum += add;
		if (Math.abs(add) <= 1e-17 * Math.abs(sum)) {
			break;
		}
	}
	let y = 2 * sum;

	// Newton-Raphson refinement on exp(y) - m = 0 => y <- y + m * exp(-y) - 1.
	for (let i = 0; i < 4; i++) {
		const err = m * expSmallIterative(-y) - 1;
		y += err;
		if (Math.abs(err) <= 1e-16) {
			break;
		}
	}

	return y + k * Math.LN2;
}

/**
 * Iterative `ln(1 + delta)` for `delta >= 0`, avoiding cancellation near `delta = 0`.
 *
 * @param {number} delta - Non-negative finite number.
 * @returns {number}
 */
function ln1pIterative(delta) {
	if (delta === 0) {
		return 0;
	}
	if (delta > 0.5) {
		return lnPositiveIterative(1 + delta);
	}
	const s = delta / (2 + delta);
	const s2 = s * s;
	let term = s;
	let sum = s;
	for (let n = 1; n <= 30; n++) {
		term *= s2;
		const add = term / (2 * n + 1);
		sum += add;
		if (Math.abs(add) <= 1e-17 * Math.abs(sum)) {
			break;
		}
	}
	return 2 * sum;
}

/**
 * Iterative real arctangent `arctan(t)` for `t ∈ [0, 1]` using half-angle
 * argument reduction, alternating Taylor series, and Newton-Raphson refinement.
 *
 * @param {number} t - Finite number in `[0, 1]`.
 * @returns {number}
 */
function atanUnitIterative(t) {
	if (t === 0) {
		return 0;
	}

	// 4 half-angle reductions map [0, 1] into [0, tan(π/64)] ≈ [0, 0.0491].
	let r = t;
	for (let i = 0; i < 4; i++) {
		r = r / (1 + sqrtIterative(1 + r * r));
	}

	const r2 = r * r;
	let term = r;
	let sum = r;
	for (let n = 1; n <= 20; n++) {
		term *= -r2;
		const add = term / (2 * n + 1);
		sum += add;
		if (Math.abs(add) <= 1e-17 * Math.abs(sum)) {
			break;
		}
	}
	let theta = 16 * sum;

	// Newton-Raphson refinement on tan(theta) - t = 0:
	// theta <- theta - (sin(theta) - t * cos(theta)) * cos(theta).
	if (t > 1e-8) {
		for (let i = 0; i < 4; i++) {
			const { sin, cos } = sinCosSmallIterative(theta);
			const delta = (sin - t * cos) * cos;
			theta -= delta;
			if (Math.abs(delta) <= 1e-16 * Math.abs(theta)) {
				break;
			}
		}
	}

	return theta;
}

/**
 * Iterative four-quadrant argument `atan2(v, u) ∈ (-π, π]` preserving IEEE 754
 * signed-zero branch-cut behavior on the negative real axis.
 *
 * @param {number} v - Imaginary part.
 * @param {number} u - Real part.
 * @returns {number}
 */
function atan2Iterative(v, u) {
	const negV = v < 0 || Object.is(v, -0);
	const au = Math.abs(u);
	const av = Math.abs(v);

	let theta;
	if (au === 0) {
		theta = 0.5 * Math.PI;
	} else if (av === 0) {
		theta = 0;
	} else if (av <= au) {
		theta = atanUnitIterative(av / au);
	} else {
		theta = 0.5 * Math.PI - atanUnitIterative(au / av);
	}

	if (u >= 0) {
		return negV ? -theta : theta;
	}
	const angle = Math.PI - theta;
	return negV ? -angle : angle;
}

/**
 * Complex Newton-Raphson refinement for `L = ln(w)` solving `exp(L) - w = 0`
 * via `L_{k+1} = L_k + w * exp(-L_k) - 1`.
 *
 * @param {number} wRe
 * @param {number} wIm
 * @param {number} initRe
 * @param {number} initIm
 * @returns {{ re: number, im: number }}
 */
function refineComplexLnNewton(wRe, wIm, initRe, initIm) {
	let re = initRe;
	let im = initIm;
	let prevErr = Infinity;

	for (let i = 0; i < 4; i++) {
		const expNegRe = expModerateIterative(-re);
		const { sin, cos } = sinCosIterative(im);
		// exp(-L) = exp(-re) * (cos(im) - i * sin(im))
		const eRe = expNegRe * cos;
		const eIm = -expNegRe * sin;

		// delta = w * exp(-L) - 1
		const dRe = wRe * eRe - wIm * eIm - 1;
		const dIm = wRe * eIm + wIm * eRe;
		const err = Math.abs(dRe) + Math.abs(dIm);

		if (!(err < 1e-6) || err >= prevErr) {
			break;
		}

		const nextIm = im + dIm;
		if (Math.abs(nextIm) > Math.PI) {
			break;
		}

		re += dRe;
		im = nextIm;
		prevErr = err;

		if (err <= 1e-15) {
			break;
		}
	}

	return { re, im };
}
