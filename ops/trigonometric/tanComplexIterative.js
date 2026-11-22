/**
 * Computes the trigonometric tangent of a complex number `z = { re, im }`
 * using a straightforward iterative implementation (range-reduced Taylor series
 * for real trigonometric and hyperbolic components, with overflow-safe
 * exponential scaling for large imaginary parts).
 *
 * Mathematically:
 *   tan(x + iy) = (sin(x)cos(x) + i*sinh(y)cosh(y)) / (cos^2(x) + sinh^2(y))
 *
 * For large |y|, rewriting in terms of u = exp(-2|y|) avoids overflow:
 *   tan(x + iy) = (4*u*sin(x)cos(x) + i*sign(y)*(1 - u^2)) / (4*u*cos^2(x) + (1 - u)^2)
 * which smoothly converges to +/- i as y -> +/- infinity.
 *
 * @param {{ re: number, im: number }} z - Complex input with finite real and imaginary parts.
 * @returns {{ re: number, im: number }} The complex tangent tan(z).
 * @throws {TypeError} If `z` is not a non-null plain object or if `z.re` / `z.im` are not numbers.
 * @throws {RangeError} If `z.re` or `z.im` is NaN/non-finite, if `z` lies on a pole
 *   (`re = pi/2 + k*pi, im = 0`), or if the denominator is zero / result overflows.
 */

// Multi-part Cody-Waite constants for pi/2 (each leading part has >= 20 trailing zero bits)
const HALF_PI = Math.PI / 2;
const TWO_PI = 2 * Math.PI;
const PIO2_1 = 1.57079632673412561417e+00; // 0x3FF921FB54400000
const PIO2_2 = 6.07710050630396597660e-11; // 0x3DD0B4611A600000
const PIO2_3 = 2.02226624871116645580e-21; // 0x3BA3198A2E000000
const PIO2_3T = 8.47842766036889956997e-32; // 0x397B839A252049C1

// Split constants for ln(2) so k * LN2_HI is exact for all k <= 2^21
const LN2_HI = 6.93147180369123816490e-01; // 0x3FE62E42FEE00000
const LN2_LO = 1.90821492927058770002e-10; // 0x3DEA39EF35793C76

const MAX_SERIES_ITERS = 100;
const LARGE_IMAG_CUTOFF = 375; // exp(-2 * 375) = exp(-750) underflows to 0 in IEEE-754 float64
const POLE_MAX_TOL = 1e-12;
const POLE_REL_TOL = 4 * Number.EPSILON;

/**
 * Iteratively computes sin(x) and cos(x) for finite real x via quadrant range
 * reduction and Maclaurin power series.
 *
 * @param {number} x
 * @returns {{ sin: number, cos: number }}
 */
function sinCosIterative(x) {
	if (x === 0) {
		return { sin: 0, cos: 1 };
	}

	const sign = x < 0 ? -1 : 1;
	let ax = Math.abs(x);

	// Reduce very large arguments to keep quadrant index within exact Cody-Waite range
	if (ax > 1e6) {
		ax -= Math.floor(ax / TWO_PI) * TWO_PI;
	}

	const q = Math.round(ax / HALF_PI);
	const r = (((ax - q * PIO2_1) - q * PIO2_2) - q * PIO2_3) - q * PIO2_3T;
	const r2 = r * r;

	// Iterative Maclaurin series for sin(r) = sum_{k>=0} (-1)^k r^(2k+1) / (2k+1)!
	let sinSum = r;
	let sinTerm = r;
	for (let k = 1; k <= MAX_SERIES_ITERS; k++) {
		sinTerm = (-sinTerm * r2) / ((2 * k) * (2 * k + 1));
		const next = sinSum + sinTerm;
		if (next === sinSum) {
			break;
		}
		sinSum = next;
	}

	// Iterative Maclaurin series for cos(r) = sum_{k>=0} (-1)^k r^(2k) / (2k)!
	let cosSum = 1;
	let cosTerm = 1;
	for (let k = 1; k <= MAX_SERIES_ITERS; k++) {
		cosTerm = (-cosTerm * r2) / ((2 * k - 1) * (2 * k));
		const next = cosSum + cosTerm;
		if (next === cosSum) {
			break;
		}
		cosSum = next;
	}

	const quad = ((q % 4) + 4) % 4;
	let sinAbs;
	let cosAbs;
	if (quad === 0) {
		sinAbs = sinSum;
		cosAbs = cosSum;
	} else if (quad === 1) {
		sinAbs = cosSum;
		cosAbs = -sinSum;
	} else if (quad === 2) {
		sinAbs = -sinSum;
		cosAbs = -cosSum;
	} else {
		sinAbs = -cosSum;
		cosAbs = sinSum;
	}

	return {
		sin: sign * sinAbs,
		cos: cosAbs,
	};
}

/**
 * Iteratively computes sinh(ay) and cosh(ay) for 0 <= ay <= 1 via Taylor series.
 * All series terms are non-negative, avoiding cancellation.
 *
 * @param {number} ay
 * @returns {{ sinh: number, cosh: number }}
 */
function sinhCoshIterative(ay) {
	const y2 = ay * ay;

	let sinhSum = ay;
	let sinhTerm = ay;
	for (let k = 1; k <= MAX_SERIES_ITERS; k++) {
		sinhTerm = (sinhTerm * y2) / ((2 * k) * (2 * k + 1));
		const next = sinhSum + sinhTerm;
		if (next === sinhSum) {
			break;
		}
		sinhSum = next;
	}

	let coshSum = 1;
	let coshTerm = 1;
	for (let k = 1; k <= MAX_SERIES_ITERS; k++) {
		coshTerm = (coshTerm * y2) / ((2 * k - 1) * (2 * k));
		const next = coshSum + coshTerm;
		if (next === coshSum) {
			break;
		}
		coshSum = next;
	}

	return { sinh: sinhSum, cosh: coshSum };
}

/**
 * Iteratively computes exp(-t) for t >= 0 via range reduction t = k*ln(2) + r
 * and Maclaurin series for exp(-r), followed by exact power-of-2 scaling.
 *
 * @param {number} t
 * @returns {number}
 */
function expNegIterative(t) {
	const k = Math.round(t / Math.LN2);
	const r = (t - k * LN2_HI) - k * LN2_LO;

	let sum = 1;
	let term = 1;
	for (let n = 1; n <= MAX_SERIES_ITERS; n++) {
		term = (-term * r) / n;
		const next = sum + term;
		if (next === sum) {
			break;
		}
		sum = next;
	}

	// Scale by 2^(-k) in exact power-of-2 chunks to avoid intermediate underflow
	let result = sum;
	let rem = k;
	while (rem > 512) {
		result *= 2 ** -512;
		rem -= 512;
	}
	if (rem > 0) {
		result *= 2 ** -rem;
	} else if (rem < 0) {
		result *= 2 ** (-rem);
	}
	return result;
}

export function tanComplexIterative(z) {
	if (typeof z !== 'object' || z === null || Array.isArray(z)) {
		throw new TypeError('tanComplexIterative: expected a complex object { re, im }');
	}
	const { re, im } = z;
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('tanComplexIterative: z.re and z.im must be numbers');
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('tanComplexIterative: z.re and z.im must be finite numbers');
	}

	// Detect poles at re = pi/2 + k*pi, im = 0
	if (im === 0) {
		const k = Math.round(re / Math.PI - 0.5);
		const pole = (k + 0.5) * Math.PI;
		const tol = Math.min(POLE_MAX_TOL, POLE_REL_TOL * Math.max(1, Math.abs(re)));
		if (Math.abs(re - pole) <= tol) {
			throw new RangeError('tanComplexIterative: pole at re = pi/2 + k*pi, im = 0');
		}
	}

	const ay = Math.abs(im);
	const signY = im < 0 ? -1 : 1;

	if (ay > LARGE_IMAG_CUTOFF) {
		return { re: 0, im: signY };
	}

	const { sin: sinX, cos: cosX } = sinCosIterative(re);
	let outRe;
	let outIm;

	if (ay === 0) {
		if (cosX === 0) {
			throw new RangeError('tanComplexIterative: exact zero denominator at pole');
		}
		outRe = sinX / cosX;
		outIm = 0;
	} else if (ay <= 1) {
		const { sinh, cosh } = sinhCoshIterative(ay);
		const denom = cosX * cosX + sinh * sinh;
		if (denom === 0) {
			throw new RangeError('tanComplexIterative: zero denominator');
		}
		outRe = (sinX * cosX) / denom;
		outIm = (signY * sinh * cosh) / denom;
	} else {
		const u = expNegIterative(2 * ay);
		const oneMinusU = 1 - u;
		const denom = 4 * u * cosX * cosX + oneMinusU * oneMinusU;
		if (denom === 0) {
			throw new RangeError('tanComplexIterative: zero denominator');
		}
		outRe = (4 * u * sinX * cosX) / denom;
		outIm = (signY * (1 - u * u)) / denom;
	}

	if (!Number.isFinite(outRe) || !Number.isFinite(outIm)) {
		throw new RangeError('tanComplexIterative: result overflowed near a pole');
	}

	return {
		re: outRe === 0 ? 0 : outRe,
		im: outIm === 0 ? 0 : outIm,
	};
}
