const SPLIT = 134217729; // 2^27 + 1 (Veltkamp splitting constant for IEEE-754 binary64)
const POW2_512 = 2 ** 512;
const POW2_NEG512 = 2 ** -512;

/**
 * Validate that a value is an Array of finite IEEE-754 float64 numbers.
 *
 * @param {unknown} vec - Candidate vector.
 * @param {string} name - Parameter name for error messages.
 */
function validateVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an Array of finite numbers`);
	}
	for (let i = 0; i < vec.length; i++) {
		const x = vec[i];
		if (typeof x !== 'number') {
			throw new TypeError(`${name}[${i}] must be a number`);
		}
		if (!Number.isFinite(x)) {
			throw new RangeError(`${name}[${i}] must be a finite number`);
		}
	}
}

/**
 * Find an integer power-of-two exponent `e` such that scaling `vec` by `2^-e`
 * places its infinity norm in `[0.5, 2)`, or `null` if `vec` is the zero vector.
 *
 * @param {number[]} vec
 * @returns {number | null}
 */
function findMaxExp(vec) {
	let maxAbs = 0;
	for (let i = 0; i < vec.length; i++) {
		const abs = Math.abs(vec[i]);
		if (abs > maxAbs) maxAbs = abs;
	}
	if (maxAbs === 0) return null;
	if (maxAbs < POW2_NEG512) {
		return Math.floor(Math.log2(maxAbs * POW2_512)) - 512;
	}
	return Math.floor(Math.log2(maxAbs));
}

/**
 * Multiply a finite float64 value `x` by `2^exp` without intermediate overflow,
 * underflow, or double rounding into the subnormal range.
 *
 * @param {number} x
 * @param {number} exp
 * @returns {number}
 */
function scaleByPow2(x, exp) {
	if (x === 0 || exp === 0) return x;
	let val = x;
	let rem = exp;
	while (rem > 1023) {
		val *= POW2_512;
		rem -= 512;
	}
	while (rem < -1022) {
		val *= POW2_NEG512;
		rem += 512;
	}
	return val * (2 ** rem);
}

/**
 * Error-free transformation for multiplication: `a * b = hi + lo` exactly
 * when no overflow or underflow occurs (Veltkamp-Dekker TwoProd).
 *
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
	const err = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
	return [p, err];
}

/**
 * Error-free transformation for addition: `a + b = hi + lo` exactly (Knuth TwoSum).
 *
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoSum(a, b) {
	const s = a + b;
	const v = s - a;
	const err = (a - (s - v)) + (b - v);
	return [s, err];
}

/**
 * Compensated dot product (Ogita-Rump-Oishi Dot2 with secondary Neumaier
 * error compensation) returning a non-overlapping double-double `[hi, lo]`.
 *
 * @param {number[]} x - Scaled vector with `|x[i]| < 2`.
 * @param {number[]} y - Scaled vector with `|y[i]| < 2`.
 * @returns {[number, number]}
 */
function dot2(x, y) {
	let sum = 0;
	let err = 0;
	let err2 = 0;

	for (let i = 0; i < x.length; i++) {
		const xi = x[i];
		const yi = y[i];
		if (xi === 0 || yi === 0) continue;

		const [p, q] = twoProd(xi, yi);
		const [s, r] = twoSum(sum, p);
		sum = s;

		const dq = r + q;
		const t = err + dq;
		if (Math.abs(err) >= Math.abs(dq)) {
			err2 += (err - t) + dq;
		} else {
			err2 += (dq - t) + err;
		}
		err = t;
	}

	const corr = err + err2;
	const hi = sum + corr;
	const lo = corr - (hi - sum);
	return [hi, lo];
}

/**
 * Computes the orthogonal vector projection of vector `a` onto non-zero vector `b`:
 *
 * `proj_b(a) = ((a · b) / (b · b)) * b`
 *
 * Uses exact power-of-two scaling (leveraging the scale-invariance identity
 * `proj_{λb}(a) = proj_b(a)`) to prevent overflow/underflow across the full
 * IEEE-754 float64 dynamic range, combined with Ogita-Rump-Oishi compensated
 * dot products (`Dot2`) and double-double quotient refinement for numerical
 * stability under catastrophic cancellation.
 *
 * @param {number[]} a - Vector to project (array of finite float64 numbers).
 * @param {number[]} b - Non-zero target direction vector (same length as `a`).
 * @returns {number[]} The projected vector `proj_b(a)`.
 * @throws {TypeError} If `a` or `b` is not an Array or contains non-number elements.
 * @throws {RangeError} If `a` or `b` contains non-finite numbers, lengths differ, or `b` is empty or the zero vector.
 */
export function projectionFloatSeries(a, b) {
	validateVector(a, 'a');
	validateVector(b, 'b');

	const n = b.length;
	if (n === 0) {
		throw new RangeError('b must be a non-empty vector');
	}
	if (a.length !== n) {
		throw new RangeError(`Vector lengths must match (got ${a.length} and ${n})`);
	}

	const expB = findMaxExp(b);
	if (expB === null) {
		throw new RangeError('b must be a non-zero vector');
	}

	const expA = findMaxExp(a);
	if (expA === null) {
		return new Array(n).fill(0);
	}

	// Exact power-of-two scaling: a = 2^expA * v, b = 2^expB * u.
	// By scale invariance of b, proj_b(a) = 2^expA * ((v · u) / (u · u)) * u.
	const v = new Array(n);
	const u = new Array(n);
	for (let i = 0; i < n; i++) {
		v[i] = scaleByPow2(a[i], -expA);
		u[i] = scaleByPow2(b[i], -expB);
	}

	const [numHi, numLo] = dot2(v, u);
	const [denHi, denLo] = dot2(u, u);

	// Double-double division: k = (numHi + numLo) / (denHi + denLo)
	const k0 = numHi / denHi;
	const [pHi, pLo] = twoProd(k0, denHi);
	const [sHi, sLo] = twoSum(numHi, -pHi);
	const rem = sHi + (sLo + numLo - pLo - k0 * denLo);
	const k1 = rem / denHi;
	const kHi = k0 + k1;
	const kLo = k1 - (kHi - k0);

	const result = new Array(n);
	for (let i = 0; i < n; i++) {
		const ui = u[i];
		if (ui === 0 || (kHi === 0 && kLo === 0)) {
			result[i] = 0;
			continue;
		}
		const [mHi, mLo] = twoProd(kHi, ui);
		const scaled = mHi + (mLo + kLo * ui);
		const val = scaleByPow2(scaled, expA);
		result[i] = val === 0 ? 0 : val;
	}

	return result;
}
