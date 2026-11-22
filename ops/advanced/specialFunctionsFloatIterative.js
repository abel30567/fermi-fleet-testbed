/**
 * Straightforward iterative special functions over IEEE-754 float64 Numbers.
 *
 * Supported functions:
 * - `'erf'`      : Gauss error function, erf(x) = (2 / sqrt(pi)) * integral_0^x exp(-t^2) dt.
 *                  Uses an all-positive Kummer series for |x| < 1 and the Legendre/Gauss
 *                  continued fraction (Modified Lentz) via erfc for |x| >= 1.
 * - `'erfc'`     : Complementary error function, erfc(x) = 1 - erf(x).
 *                  Uses erfc = 1 - erf for |x| < 1 and Modified Lentz continued fraction
 *                  for |x| >= 1, preserving accuracy in the upper tail.
 * - `'gamma'`    : Euler gamma function, Gamma(x).
 *                  Uses Paul Godfrey's Lanczos approximation (g = 7, n = 9) for x >= 0.5,
 *                  exact iterative factorial for small positive integers 1 <= x <= 18,
 *                  and Euler's reflection formula (non-recursive) for x < 0.5.
 *                  Throws RangeError at poles (non-positive integers x <= 0).
 * - `'lgamma'`   : Natural logarithm of |Gamma(x)|, ln|Gamma(x)|.
 *                  Uses Lanczos for x >= 0.5 and Euler's reflection formula in log space
 *                  for x < 0.5. Throws RangeError at poles (non-positive integers x <= 0).
 * - `'beta'`     : Euler beta function, B(x, y) = Gamma(x) * Gamma(y) / Gamma(x + y),
 *                  evaluated in log-space via lgamma for x > 0 and y > 0 to avoid
 *                  intermediate overflow.
 * - `'besselJ0'` : Bessel function of the first kind of order 0, J_0(x).
 *                  Uses the alternating power series for |x| <= 4, spectrally convergent
 *                  iterative midpoint quadrature of Poisson's integral for 4 < |x| < 20,
 *                  and Hankel's asymptotic expansion for |x| >= 20.
 *
 * All algorithms are strictly iterative (no recursion) and zero-dependency.
 */

const SQRT_PI = Math.sqrt(Math.PI);
const TWO_OVER_SQRT_PI = 2 / SQRT_PI;
const HALF_LN_TWO_PI = 0.5 * Math.log(2 * Math.PI);
const LN_PI = Math.log(Math.PI);
const EPSILON = 1e-15;
const TINY = 1e-300;

/** Lanczos approximation parameters (g = 7, n = 9) by Paul Godfrey. */
const LANCZOS_G = 7;
const LANCZOS_COEFFS = [
	0.99999999999980993,
	676.5203681218851,
	-1259.1392167224028,
	771.32342877765313,
	-176.61502916214059,
	12.507343278686905,
	-0.13857109526572012,
	9.9843695780195716e-6,
	1.5056327351493116e-7,
];

const SUPPORTED_FUNCTIONS = new Set([
	'erf',
	'erfc',
	'gamma',
	'lgamma',
	'beta',
	'besselJ0',
]);

/**
 * Computes sin(pi * x) accurately for any finite float64 x by range reduction.
 *
 * @param {number} x - Finite real input.
 * @returns {number} Value of sin(pi * x).
 */
function sinPi(x) {
	const m = Math.floor(x);
	let f = x - m;
	if (f === 0) return 0;
	if (f > 0.5) f = 1 - f;
	const s = Math.sin(Math.PI * f);
	return m % 2 === 0 ? s : -s;
}

/**
 * Iterative all-positive Kummer series for erf(ax), 0 <= ax < 1.
 * erf(x) = (2 / sqrt(pi)) * x * exp(-x^2) * sum_{n=0}^inf (2 * x^2)^n / (2n + 1)!!
 *
 * @param {number} ax - Non-negative input (0 <= ax < 1).
 * @returns {number} erf(ax).
 */
function erfSeries(ax) {
	if (ax === 0) return 0;
	const twoX2 = 2 * ax * ax;
	let term = 1;
	let sum = 1;
	for (let n = 1; n <= 200; n++) {
		term *= twoX2 / (2 * n + 1);
		sum += term;
		if (term <= sum * 1e-16) break;
	}
	return TWO_OVER_SQRT_PI * ax * Math.exp(-ax * ax) * sum;
}

/**
 * Iterative Modified Lentz continued fraction for erfc(ax), ax >= 1.
 * Uses Q(1/2, x^2) = (exp(-x^2) * x / sqrt(pi)) / (b_0 + a_1/(b_1 + a_2/(b_2 + ...)))
 * with b_k = x^2 + 2k + 0.5 and a_k = -k * (k - 0.5).
 *
 * @param {number} ax - Input with ax >= 1.
 * @returns {number} erfc(ax).
 */
function erfcContinuedFraction(ax) {
	if (ax >= 27.5) return 0;
	const z = ax * ax;
	let f = z + 0.5;
	let c = f;
	let d = 0;
	for (let k = 1; k <= 500; k++) {
		const ak = -k * (k - 0.5);
		const bk = z + 2 * k + 0.5;
		d = bk + ak * d;
		if (Math.abs(d) < TINY) d = TINY;
		c = bk + ak / c;
		if (Math.abs(c) < TINY) c = TINY;
		d = 1 / d;
		const delta = c * d;
		f *= delta;
		if (Math.abs(delta - 1) <= EPSILON) break;
	}
	return (Math.exp(-z) * ax) / (SQRT_PI * f);
}

/**
 * Iterative erf(x) over all finite float64 numbers.
 *
 * @param {number} x - Finite real number.
 * @returns {number} erf(x) in [-1, 1].
 */
function erfIterative(x) {
	if (x === 0) return x;
	const ax = Math.abs(x);
	const val = ax < 1 ? erfSeries(ax) : 1 - erfcContinuedFraction(ax);
	return x < 0 ? -val : val;
}

/**
 * Iterative erfc(x) over all finite float64 numbers.
 *
 * @param {number} x - Finite real number.
 * @returns {number} erfc(x) in [0, 2].
 */
function erfcIterative(x) {
	if (x === 0) return 1;
	const ax = Math.abs(x);
	const posErfc = ax < 1 ? 1 - erfSeries(ax) : erfcContinuedFraction(ax);
	return x < 0 ? 2 - posErfc : posErfc;
}

/**
 * Iterative Lanczos approximation for ln(Gamma(x)), valid for x >= 0.5.
 *
 * @param {number} x - Real number with x >= 0.5.
 * @returns {number} ln(Gamma(x)).
 */
function lgammaPositive(x) {
	if (x === 1 || x === 2) return 0;
	const z = x - 1;
	let ag = LANCZOS_COEFFS[0];
	for (let i = 1; i < LANCZOS_COEFFS.length; i++) {
		ag += LANCZOS_COEFFS[i] / (z + i);
	}
	const t = z + LANCZOS_G + 0.5;
	return HALF_LN_TWO_PI + (z + 0.5) * Math.log(t) - t + Math.log(ag);
}

/**
 * Iterative ln|Gamma(x)| over all finite float64 numbers except non-positive integers.
 *
 * @param {number} x - Finite real number not in {0, -1, -2, ...}.
 * @returns {number} ln|Gamma(x)|.
 */
function lgammaIterative(x) {
	if (x <= 0 && Number.isInteger(x)) {
		throw new RangeError(`lgamma(x) has a pole at non-positive integer x = ${x}`);
	}
	if (x >= 0.5) {
		return lgammaPositive(x);
	}
	const s = Math.abs(sinPi(x));
	return LN_PI - Math.log(s) - lgammaPositive(1 - x);
}

/**
 * Iterative Gamma(x) over all finite float64 numbers except non-positive integers.
 *
 * @param {number} x - Finite real number not in {0, -1, -2, ...}.
 * @returns {number} Gamma(x).
 */
function gammaIterative(x) {
	if (x <= 0 && Number.isInteger(x)) {
		throw new RangeError(`gamma(x) has a pole at non-positive integer x = ${x}`);
	}
	if (x >= 1 && x <= 18 && Number.isInteger(x)) {
		let prod = 1;
		for (let k = 2; k < x; k++) {
			prod *= k;
		}
		return prod;
	}
	if (x >= 0.5) {
		return Math.exp(lgammaPositive(x));
	}
	const s = sinPi(x);
	const logMag = LN_PI - Math.log(Math.abs(s)) - lgammaPositive(1 - x);
	const mag = Math.exp(logMag);
	return s < 0 ? -mag : mag;
}

/**
 * Iterative Euler Beta function B(x, y) = Gamma(x) * Gamma(y) / Gamma(x + y) for x > 0, y > 0.
 *
 * @param {number} x - Positive finite real number.
 * @param {number} y - Positive finite real number.
 * @returns {number} B(x, y).
 */
function betaIterative(x, y) {
	if (x <= 0 || y <= 0) {
		throw new RangeError(`beta(x, y) requires x > 0 and y > 0; got (${x}, ${y})`);
	}
	return Math.exp(lgammaIterative(x) + lgammaIterative(y) - lgammaIterative(x + y));
}

/**
 * Iterative Bessel function of the first kind of order 0, J_0(x).
 * - |x| <= 4  : alternating Taylor series.
 * - 4 < |x| < 20 : spectrally accurate midpoint quadrature of Poisson's integral.
 * - |x| >= 20 : Hankel asymptotic expansion.
 *
 * @param {number} x - Finite real number.
 * @returns {number} J_0(x).
 */
function besselJ0Iterative(x) {
	const ax = Math.abs(x);
	if (ax === 0) return 1;

	if (ax <= 4) {
		const negQuarterX2 = -0.25 * ax * ax;
		let term = 1;
		let sum = 1;
		for (let k = 1; k <= 60; k++) {
			term *= negQuarterX2 / (k * k);
			sum += term;
			if (Math.abs(term) <= Math.abs(sum) * 1e-16) break;
		}
		return sum;
	}

	if (ax < 20) {
		// Poisson integral: J_0(x) = (2 / pi) * integral_0^(pi/2) cos(x * cos(theta)) dtheta.
		// Using M midpoint nodes on (0, pi/2) corresponds to N = 2M periodic nodes on [0, pi],
		// whose aliasing error is O(|J_{4M}(x)|) < 1e-18 for M = ceil(ax) + 12.
		const m = Math.ceil(ax) + 12;
		const step = (0.5 * Math.PI) / m;
		let sum = 0;
		for (let j = 0; j < m; j++) {
			const theta = (j + 0.5) * step;
			sum += Math.cos(ax * Math.cos(theta));
		}
		return sum / m;
	}

	// Hankel asymptotic expansion for ax >= 20.
	let p = 1;
	let q = 0;
	let u = 1;
	let prevU = Infinity;
	for (let m = 1; m <= 80; m++) {
		const odd = 2 * m - 1;
		const nextU = (u * odd * odd) / (8 * m * ax);
		if (nextU > prevU) break;
		u = nextU;
		prevU = u;
		if (m % 2 === 1) {
			const sign = ((m - 1) / 2) % 2 === 0 ? -1 : 1;
			q += sign * u;
		} else {
			const sign = (m / 2) % 2 === 0 ? 1 : -1;
			p += sign * u;
		}
		if (u <= EPSILON) break;
	}

	const chi = ax - 0.25 * Math.PI;
	return Math.sqrt(2 / (Math.PI * ax)) * (p * Math.cos(chi) - q * Math.sin(chi));
}

/**
 * Evaluates a named special function over IEEE-754 float64 Numbers using a
 * straightforward iterative implementation (no recursion, zero dependencies).
 *
 * @param {'erf'|'erfc'|'gamma'|'lgamma'|'beta'|'besselJ0'} name - Name of the special function.
 * @param {number} x - Primary finite float64 argument.
 * @param {number} [y] - Secondary finite float64 argument (required for `'beta'`, must be omitted otherwise).
 * @returns {number} Computed special function value as an IEEE-754 float64 Number.
 * @throws {TypeError} If `name` is not a string, an argument is not a number, or an extra argument is supplied to a unary function.
 * @throws {RangeError} If `name` is unsupported, any numeric argument is NaN/non-finite, or inputs lie outside the function's domain (e.g. poles of gamma/lgamma or non-positive inputs to beta).
 */
export function specialFunctionsFloatIterative(name, x, y) {
	if (typeof name !== 'string') {
		throw new TypeError(`Function name must be a string; received ${typeof name}`);
	}
	if (!SUPPORTED_FUNCTIONS.has(name)) {
		throw new RangeError(
			`Unsupported special function "${name}". Supported: ${[...SUPPORTED_FUNCTIONS].join(', ')}`,
		);
	}
	if (typeof x !== 'number') {
		throw new TypeError(`Argument x must be a number; received ${typeof x}`);
	}
	if (!Number.isFinite(x)) {
		throw new RangeError(`Argument x must be a finite number; received ${x}`);
	}

	if (name === 'beta') {
		if (typeof y !== 'number') {
			throw new TypeError(`Argument y must be a number for beta(x, y); received ${typeof y}`);
		}
		if (!Number.isFinite(y)) {
			throw new RangeError(`Argument y must be a finite number for beta(x, y); received ${y}`);
		}
		return betaIterative(x, y);
	}

	if (y !== undefined) {
		throw new TypeError(`Function "${name}" accepts only one numeric argument`);
	}

	switch (name) {
		case 'erf':
			return erfIterative(x);
		case 'erfc':
			return erfcIterative(x);
		case 'gamma':
			return gammaIterative(x);
		case 'lgamma':
			return lgammaIterative(x);
		case 'besselJ0':
			return besselJ0Iterative(x);
	}
}
