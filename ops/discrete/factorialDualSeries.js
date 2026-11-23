/**
 * Euler-Mascheroni constant (gamma), approximately 0.5772156649015329.
 */
const EULER_GAMMA = 0.5772156649015328606;

/**
 * Square root of 2 * PI.
 */
const SQRT_2PI = Math.sqrt(2 * Math.PI);

/**
 * Lanczos approximation parameters (g = 7, n = 9) for Gamma(z), Re(z) >= 0.5.
 */
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

/**
 * Bernoulli asymptotic series coefficients -B_{2k} / (2k) for digamma(z),
 * k = 1..7, accurate to full IEEE-754 double precision for z >= 12.
 */
const DIGAMMA_BERNOULLI_COEFFS = [
	-1 / 12,
	1 / 120,
	-1 / 252,
	1 / 240,
	-1 / 132,
	691 / 32760,
	-1 / 12,
];

/**
 * Maximum integer n for which n! is finite in IEEE-754 float64.
 */
const MAX_FINITE_INT_FACTORIAL = 170;

/**
 * Maximum real z for which Gamma(z) is finite in IEEE-754 float64.
 * Gamma(171.6243769563027) ~= Number.MAX_VALUE.
 */
const MAX_FINITE_GAMMA_ARG = 171.6243769563027;

/**
 * Computes Gamma(z) for real z >= 0.5 using the Lanczos series approximation.
 * Splits the power/exponential factor to avoid intermediate overflow up to MAX_FINITE_GAMMA_ARG.
 *
 * @param {number} z - Real argument with z >= 0.5.
 * @returns {number} Gamma(z), or Infinity on float64 overflow.
 */
function gammaPositive(z) {
	if (z > MAX_FINITE_GAMMA_ARG) {
		return Infinity;
	}

	const u = z - 1;
	let series = LANCZOS_COEFFS[0];
	for (let k = 1; k < LANCZOS_COEFFS.length; k++) {
		series += LANCZOS_COEFFS[k] / (u + k);
	}

	const t = u + LANCZOS_G + 0.5;
	// Split exponent by half so neither pow nor exp overflows/underflows prematurely.
	const halfFactor = Math.pow(t, (u + 0.5) * 0.5) * Math.exp(-t * 0.5);
	return SQRT_2PI * halfFactor * halfFactor * series;
}

/**
 * Computes the digamma function psi(z) = d/dz ln(Gamma(z)) for real z >= 0.5
 * using the recurrence psi(z) = psi(z + 1) - 1/z followed by the
 * Bernoulli asymptotic series for z >= 12.
 *
 * @param {number} z - Real argument with z >= 0.5.
 * @returns {number} psi(z).
 */
function digammaPositive(z) {
	let result = 0;
	let x = z;

	while (x < 12) {
		result -= 1 / x;
		x += 1;
	}

	const inv = 1 / x;
	const inv2 = inv * inv;

	// Horner evaluation of sum_{k=1}^7 (-B_{2k} / (2k)) * x^{-2k}
	let poly = DIGAMMA_BERNOULLI_COEFFS[DIGAMMA_BERNOULLI_COEFFS.length - 1];
	for (let i = DIGAMMA_BERNOULLI_COEFFS.length - 2; i >= 0; i--) {
		poly = poly * inv2 + DIGAMMA_BERNOULLI_COEFFS[i];
	}

	return result + Math.log(x) - 0.5 * inv + poly * inv2;
}

/**
 * Evaluates the factorial function over dual numbers `{v, d}` representing `v + d*eps`
 * (with `eps^2 = 0`), carrying the exact forward-mode derivative alongside the value.
 *
 * For non-negative integers `n`, uses the exact discrete product `n!` and the
 * closed-form harmonic-series identity for the derivative of `Gamma(x + 1)`:
 *   `(n + d*eps)! = n! + d * n! * (H_n - gamma) * eps`
 * where `H_n = sum_{k=1}^n 1/k` and `gamma` is the Euler-Mascheroni constant.
 *
 * For non-integer real `v` (all `v` outside the negative integer poles `-1, -2, ...`),
 * evaluates the smooth continuation `Gamma(v + 1)` and `Gamma'(v + 1) = Gamma(v + 1) * psi(v + 1)`
 * using the Lanczos series, Bernoulli asymptotic digamma series, and Euler's reflection identities.
 *
 * @param {{v: number, d: number}} x - Input dual number `{v, d}` with finite real components.
 * @returns {{v: number, d: number}} Dual number `{v, d}` representing `(x.v + x.d * eps)!`.
 * @throws {TypeError} If `x` is not a non-null object or `x.v` / `x.d` are not numbers.
 * @throws {RangeError} If `x.v` or `x.d` is non-finite (`NaN`, `±Infinity`), or `x.v` is a negative integer pole.
 */
export function factorialDualSeries(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Input must be a dual number object { v, d }');
	}

	const { v, d } = x;

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual number components v and d must be numbers');
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number components v and d must be finite numbers');
	}

	if (Number.isInteger(v)) {
		if (v < 0) {
			throw new RangeError(`Factorial is undefined at negative integer pole v = ${v}`);
		}

		if (v > MAX_FINITE_INT_FACTORIAL) {
			return {
				v: Infinity,
				d: d === 0 ? 0 : d > 0 ? Infinity : -Infinity,
			};
		}

		let fact = 1;
		for (let k = 2; k <= v; k++) {
			fact *= k;
		}

		// Sum harmonic series from smallest term to largest to minimize rounding error.
		let harmonic = 0;
		for (let k = v; k >= 1; k--) {
			harmonic += 1 / k;
		}

		const psi = harmonic - EULER_GAMMA;
		const deriv = d === 0 ? 0 : d * (fact * psi);
		return { v: fact, d: deriv };
	}

	const z = v + 1;

	if (z >= 0.5) {
		const val = gammaPositive(z);
		const psi = digammaPositive(z);
		if (!Number.isFinite(val)) {
			const sign = Math.sign(d) * Math.sign(psi);
			return {
				v: val,
				d: sign === 0 ? 0 : sign * Infinity,
			};
		}
		const deriv = d === 0 ? 0 : d * (val * psi);
		return { v: val, d: deriv };
	}

	// Reflection region: z < 0.5 and z is not a non-positive integer.
	const w = 1 - z;
	const m = Math.round(z);
	const r = z - m;
	const parity = m % 2 === 0 ? 1 : -1;

	const isHalfInt = Math.abs(r) === 0.5;
	const sinPiZ = parity * (isHalfInt ? Math.sign(r) : Math.sin(Math.PI * r));
	const cotPiZ = isHalfInt ? 0 : Math.cos(Math.PI * r) / Math.sin(Math.PI * r);

	const gammaW = gammaPositive(w);
	const psiW = digammaPositive(w);
	const psiZ = psiW - Math.PI * cotPiZ;

	if (!Number.isFinite(gammaW)) {
		// Gamma(1 - z) overflowed, so Gamma(z) underflows to 0.
		return { v: 0, d: 0 };
	}

	const val = Math.PI / (sinPiZ * gammaW);
	if (val === 0) {
		return { v: 0, d: 0 };
	}
	if (!Number.isFinite(val)) {
		const sign = Math.sign(d) * Math.sign(val) * Math.sign(psiZ);
		return {
			v: val,
			d: sign === 0 ? 0 : sign * Infinity,
		};
	}

	const deriv = d === 0 ? 0 : d * (val * psiZ);
	return { v: val, d: deriv };
}
