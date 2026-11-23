/**
 * Numerically robust Zadeh fuzzy logical NOT (complement) over scalar membership
 * degrees in [0, 1] and fuzzy sets (Array, TypedArray, Map, or plain Object).
 *
 * Mathematical definition (Zadeh negation / complement):
 *   not(mu) = 1 - mu,  for mu in [0, 1]
 *
 * Numerical robustness guarantees (IEEE 754 binary64):
 * - Exactness for mu in [0.5, 1] via Sterbenz's Lemma (zero rounding error).
 * - Error-free transformation (Dekker's FastTwoSum) computes (value, error)
 *   such that `value + error = 1 - mu` exactly in real arithmetic, preventing
 *   catastrophic absorption for tiny mu (e.g. mu < 2^-53) and preserving exact
 *   involution `not(not(mu)) = mu` in compensated mode.
 * - Knuth's TwoSum and Neumaier's compensated summation provide drift-free
 *   fuzzy set cardinality and rigorous a priori / a posteriori error bounds.
 *
 * @module ops/logic-set/notFuzzyStable
 */

const COMPENSATED_TAG = Symbol.for('notFuzzyStable.compensated');

/**
 * Rigorous upper bound on |fl(1 - mu) - (1 - mu)| for any IEEE 754 binary64
 * membership mu in [0, 1]: half-ulp at 1 is 2^-54 (Number.EPSILON / 4).
 */
const MAX_SINGLE_ROUNDING_ERROR = 2 ** -54;

/**
 * Knuth's TwoSum error-free transformation.
 * Returns [s, e] such that s + e === a + b in exact real arithmetic.
 *
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoSum(a, b) {
	const s = a + b;
	const v = s - a;
	const e = (a - (s - v)) + (b - v);
	return [s, e];
}

/**
 * Dekker's FastTwoSum error-free transformation (requires |a| >= |b|).
 * Returns [s, e] such that s + e === a + b in exact real arithmetic.
 *
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function fastTwoSum(a, b) {
	const s = a + b;
	const e = b - (s - a);
	return [s, e];
}

/**
 * Normalizes -0 to +0 while leaving all other numbers untouched.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Neumaier's improved Kahan-Babuška compensated accumulator.
 */
class NeumaierAccumulator {
	constructor() {
		this.sum = 0;
		this.comp = 0;
	}

	/**
	 * Adds a finite value to the compensated running sum.
	 * @param {number} x
	 */
	add(x) {
		const t = this.sum + x;
		if (Math.abs(this.sum) >= Math.abs(x)) {
			this.comp += (this.sum - t) + x;
		} else {
			this.comp += (x - t) + this.sum;
		}
		this.sum = t;
	}

	/**
	 * Returns the compensated total.
	 * @returns {number}
	 */
	total() {
		return normalizeZero(this.sum + this.comp);
	}
}

/**
 * Validates and normalizes the optional `options` argument.
 *
 * @param {object} [options]
 * @returns {{ tolerance: number, compensated: boolean }}
 */
function parseOptions(options) {
	if (options === undefined) {
		return { tolerance: 0, compensated: false };
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object');
	}

	const { tolerance = 0, compensated = false } = options;

	if (typeof tolerance !== 'number') {
		throw new TypeError('options.tolerance must be a number');
	}
	if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 0.5) {
		throw new RangeError('options.tolerance must be a finite number in [0, 0.5]');
	}

	if (typeof compensated !== 'boolean') {
		throw new TypeError('options.compensated must be a boolean');
	}

	return { tolerance, compensated };
}

/**
 * Checks whether a value is a branded compensated scalar produced by `notFuzzyStable`.
 *
 * @param {unknown} x
 * @returns {boolean}
 */
function isCompensatedScalar(x) {
	return typeof x === 'object' && x !== null && x[COMPENSATED_TAG] === true;
}

/**
 * Checks whether a value is a plain JavaScript object (prototype is Object.prototype or null).
 *
 * @param {unknown} x
 * @returns {boolean}
 */
function isPlainObject(x) {
	if (typeof x !== 'object' || x === null) {
		return false;
	}
	const proto = Object.getPrototypeOf(x);
	return proto === Object.prototype || proto === null;
}

/**
 * Validates a scalar membership value in [0, 1] (with optional boundary tolerance)
 * and clamps values within [-tolerance, 0) to 0 and (1, 1 + tolerance] to 1.
 *
 * @param {unknown} mu
 * @param {number} tolerance
 * @param {string} [label='membership']
 * @returns {number}
 */
function validateScalar(mu, tolerance, label = 'membership') {
	if (typeof mu !== 'number') {
		throw new TypeError(`${label} must be a number`);
	}
	if (!Number.isFinite(mu)) {
		throw new RangeError(`${label} must be a finite number in [0, 1]`);
	}
	if (mu < -tolerance || mu > 1 + tolerance) {
		throw new RangeError(`${label} (${mu}) must lie in [0, 1]`);
	}
	if (mu <= 0) {
		return 0;
	}
	if (mu >= 1) {
		return 1;
	}
	return mu;
}

/**
 * Computes the exact error-free Zadeh negation of a validated scalar mu in [0, 1].
 *
 * @param {number} mu
 * @returns {{ value: number, error: number, errorBound: number }}
 */
function negateScalarExact(mu) {
	// Since 1 >= mu >= 0, FastTwoSum(1, -mu) is exact: hi + lo === 1 - mu in R.
	const [rawHi, rawLo] = fastTwoSum(1, -mu);
	const value = normalizeZero(Math.min(1, Math.max(0, rawHi)));
	const error = normalizeZero(rawLo);
	// By Sterbenz's Lemma, 1 - mu is exact when mu in [0.5, 1] or mu === 0.
	const errorBound = (mu >= 0.5 || mu === 0) ? 0 : MAX_SINGLE_ROUNDING_ERROR;
	return { value, error, errorBound };
}

/**
 * Computes the compensated double-double Zadeh negation of a compensated scalar
 * { value, error }, i.e., 1 - (value + error).
 *
 * @param {{ value: number, error: number }} pair
 * @param {number} tolerance
 * @returns {{ value: number, error: number, errorBound: number }}
 */
function negateCompensatedScalar(pair, tolerance) {
	const { value: v, error: e } = pair;
	if (typeof v !== 'number' || typeof e !== 'number') {
		throw new TypeError('compensated membership value and error must be numbers');
	}
	if (!Number.isFinite(v) || !Number.isFinite(e)) {
		throw new RangeError('compensated membership value and error must be finite');
	}

	// Renormalize (v, e) first so v is the dominant binary64 component.
	const [nv, ne] = twoSum(v, e);

	// Check lower bound: nv + ne >= -tolerance
	const [lowHi, lowLo] = twoSum(nv, tolerance);
	const [lowSum, lowRem] = twoSum(lowHi, lowLo + ne);
	if (lowSum < 0 || (lowSum === 0 && lowRem < 0)) {
		throw new RangeError(`compensated membership (${nv} + ${ne}) must lie in [0, 1]`);
	}

	// Check upper bound: nv + ne <= 1 + tolerance
	const [upHi, upLo] = twoSum(nv, -1);
	const [upDiff, upRem] = twoSum(upHi, upLo + ne);
	const [excessHi, excessLo] = twoSum(upDiff, -tolerance);
	if (excessHi > 0 || (excessHi === 0 && excessLo + upRem > 0)) {
		throw new RangeError(`compensated membership (${nv} + ${ne}) must lie in [0, 1]`);
	}

	// Clamp values within the tolerance band outside [0, 1].
	if (nv < 0 || (nv === 0 && ne <= 0)) {
		return { value: 1, error: 0, errorBound: 0 };
	}
	if (nv > 1 || (nv === 1 && ne >= 0)) {
		return { value: 0, error: 0, errorBound: 0 };
	}

	// Compute 1 - (nv + ne) = (1 - nv) - ne in double-double arithmetic.
	const [tHi, tLo] = fastTwoSum(1, -nv);
	const [uHi, uLo] = twoSum(tHi, -ne);
	const [rawHi, rawLo] = fastTwoSum(uHi, uLo + tLo);

	const value = normalizeZero(Math.min(1, Math.max(0, rawHi)));
	const error = normalizeZero(rawLo);
	const errorBound = (error === 0 && uLo === 0 && tLo === 0) ? 0 : MAX_SINGLE_ROUNDING_ERROR;

	return { value, error, errorBound };
}

/**
 * Wraps a compensated scalar result with the internal brand symbol.
 *
 * @param {{ value: number, error: number, errorBound: number }} res
 * @returns {{ value: number, error: number, errorBound: number }}
 */
function brandCompensatedScalar(res) {
	return Object.defineProperty(
		{
			value: res.value,
			error: res.error,
			errorBound: res.errorBound,
		},
		COMPENSATED_TAG,
		{
			value: true,
			enumerable: false,
			writable: false,
			configurable: false,
		},
	);
}

/**
 * Defines an own enumerable property safely, avoiding `__proto__` mutation.
 *
 * @param {Record<string, number>} target
 * @param {string} key
 * @param {number} value
 */
function setOwnProperty(target, key, value) {
	if (key === '__proto__') {
		Object.defineProperty(target, key, {
			value,
			enumerable: true,
			writable: true,
			configurable: true,
		});
	} else {
		target[key] = value;
	}
}

/**
 * Computes the numerically robust Zadeh fuzzy logical NOT (complement) of a
 * membership degree in [0, 1] or a fuzzy set represented as an Array, numeric
 * TypedArray, Map, or plain Object.
 *
 * In standard mode (`options.compensated === false`, the default):
 * - A scalar `number` (or compensated scalar) returns a `number` in `[0, 1]`.
 * - An `Array<number>` returns a new `Array<number>`.
 * - A numeric `TypedArray` returns a new `Float64Array` (preserving full precision).
 * - A `Map<K, number>` returns a new `Map<K, number>`.
 * - A plain `Object` returns a new plain `Object`.
 *
 * In compensated mode (`options.compensated === true`):
 * - A scalar returns `{ value, error, errorBound }` where `value + error === 1 - mu`
 *   in exact real arithmetic (double-double representation). Passing this object
 *   back to `notFuzzyStable` performs exact compensated double negation.
 * - A fuzzy set container returns:
 *   `{ value, errors, maxError, totalError, errorBound, cardinality }`
 *   where `errors` holds exact per-element residuals, `totalError` and `errorBound`
 *   and `cardinality` are computed using Neumaier compensated summation.
 *
 * @param {number | number[] | ArrayBufferView | Map<any, number> | Record<string, number> | { value: number, error: number }} input
 *   Membership degree in [0, 1], compensated scalar from a prior call, or fuzzy set container.
 * @param {object} [options]
 * @param {number} [options.tolerance=0]
 *   Non-negative boundary tolerance in [0, 0.5] for clamping slight floating-point
 *   overshoot outside [0, 1] (e.g. `-1e-16` or `1 + 1e-16`).
 * @param {boolean} [options.compensated=false]
 *   When true, returns exact error-free residuals, error bounds, and compensated
 *   cardinality diagnostics alongside the complemented result.
 * @returns {number | number[] | Float64Array | Map<any, number> | Record<string, number> | object}
 * @throws {TypeError} If input, elements, or options have invalid types.
 * @throws {RangeError} If any membership value is non-finite or outside [-tolerance, 1 + tolerance].
 */
export function notFuzzyStable(input, options) {
	const { tolerance, compensated } = parseOptions(options);

	// 1. Scalar number input
	if (typeof input === 'number') {
		const mu = validateScalar(input, tolerance);
		const res = negateScalarExact(mu);
		return compensated ? brandCompensatedScalar(res) : res.value;
	}

	// 2. Compensated scalar input from a previous `notFuzzyStable(..., { compensated: true })` call
	if (isCompensatedScalar(input)) {
		const res = negateCompensatedScalar(input, tolerance);
		return compensated ? brandCompensatedScalar(res) : res.value;
	}

	// 3. Array fuzzy set
	if (Array.isArray(input)) {
		const n = input.length;
		const out = new Array(n);
		if (!compensated) {
			for (let i = 0; i < n; i++) {
				if (!(i in input)) {
					throw new TypeError(`membership at index ${i} must be a number (sparse array holes are not allowed)`);
				}
				const mu = validateScalar(input[i], tolerance, `membership[${i}]`);
				out[i] = negateScalarExact(mu).value;
			}
			return out;
		}

		const errors = new Array(n);
		let maxError = 0;
		const totalErrorAcc = new NeumaierAccumulator();
		const errorBoundAcc = new NeumaierAccumulator();
		const cardinalityAcc = new NeumaierAccumulator();

		for (let i = 0; i < n; i++) {
			if (!(i in input)) {
				throw new TypeError(`membership at index ${i} must be a number (sparse array holes are not allowed)`);
			}
			const mu = validateScalar(input[i], tolerance, `membership[${i}]`);
			const { value, error, errorBound } = negateScalarExact(mu);
			out[i] = value;
			errors[i] = error;
			const absErr = Math.abs(error);
			if (absErr > maxError) {
				maxError = absErr;
			}
			totalErrorAcc.add(absErr);
			errorBoundAcc.add(errorBound);
			cardinalityAcc.add(value);
			cardinalityAcc.add(error);
		}

		return {
			value: out,
			errors,
			maxError,
			totalError: totalErrorAcc.total(),
			errorBound: errorBoundAcc.total(),
			cardinality: cardinalityAcc.total(),
		};
	}

	// 4. Numeric TypedArray fuzzy set (reject DataView and BigInt TypedArrays)
	if (ArrayBuffer.isView(input)) {
		if (
			input instanceof DataView ||
			input instanceof BigInt64Array ||
			input instanceof BigUint64Array
		) {
			throw new TypeError('input must be a number, Array, numeric TypedArray, Map, or plain Object');
		}
		const n = input.length;
		const out = new Float64Array(n);
		if (!compensated) {
			for (let i = 0; i < n; i++) {
				const mu = validateScalar(input[i], tolerance, `membership[${i}]`);
				out[i] = negateScalarExact(mu).value;
			}
			return out;
		}

		const errors = new Float64Array(n);
		let maxError = 0;
		const totalErrorAcc = new NeumaierAccumulator();
		const errorBoundAcc = new NeumaierAccumulator();
		const cardinalityAcc = new NeumaierAccumulator();

		for (let i = 0; i < n; i++) {
			const mu = validateScalar(input[i], tolerance, `membership[${i}]`);
			const { value, error, errorBound } = negateScalarExact(mu);
			out[i] = value;
			errors[i] = error;
			const absErr = Math.abs(error);
			if (absErr > maxError) {
				maxError = absErr;
			}
			totalErrorAcc.add(absErr);
			errorBoundAcc.add(errorBound);
			cardinalityAcc.add(value);
			cardinalityAcc.add(error);
		}

		return {
			value: out,
			errors,
			maxError,
			totalError: totalErrorAcc.total(),
			errorBound: errorBoundAcc.total(),
			cardinality: cardinalityAcc.total(),
		};
	}

	// 5. Map fuzzy set
	if (input instanceof Map) {
		const out = new Map();
		if (!compensated) {
			for (const [key, raw] of input.entries()) {
				const mu = validateScalar(raw, tolerance, `membership(${String(key)})`);
				out.set(key, negateScalarExact(mu).value);
			}
			return out;
		}

		const errors = new Map();
		let maxError = 0;
		const totalErrorAcc = new NeumaierAccumulator();
		const errorBoundAcc = new NeumaierAccumulator();
		const cardinalityAcc = new NeumaierAccumulator();

		for (const [key, raw] of input.entries()) {
			const mu = validateScalar(raw, tolerance, `membership(${String(key)})`);
			const { value, error, errorBound } = negateScalarExact(mu);
			out.set(key, value);
			errors.set(key, error);
			const absErr = Math.abs(error);
			if (absErr > maxError) {
				maxError = absErr;
			}
			totalErrorAcc.add(absErr);
			errorBoundAcc.add(errorBound);
			cardinalityAcc.add(value);
			cardinalityAcc.add(error);
		}

		return {
			value: out,
			errors,
			maxError,
			totalError: totalErrorAcc.total(),
			errorBound: errorBoundAcc.total(),
			cardinality: cardinalityAcc.total(),
		};
	}

	// 6. Plain Object fuzzy set
	if (isPlainObject(input)) {
		const keys = Object.keys(input);
		const out = Object.getPrototypeOf(input) === null ? Object.create(null) : {};
		if (!compensated) {
			for (let i = 0; i < keys.length; i++) {
				const key = keys[i];
				const mu = validateScalar(input[key], tolerance, `membership.${key}`);
				setOwnProperty(out, key, negateScalarExact(mu).value);
			}
			return out;
		}

		const errors = Object.getPrototypeOf(input) === null ? Object.create(null) : {};
		let maxError = 0;
		const totalErrorAcc = new NeumaierAccumulator();
		const errorBoundAcc = new NeumaierAccumulator();
		const cardinalityAcc = new NeumaierAccumulator();

		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			const mu = validateScalar(input[key], tolerance, `membership.${key}`);
			const { value, error, errorBound } = negateScalarExact(mu);
			setOwnProperty(out, key, value);
			setOwnProperty(errors, key, error);
			const absErr = Math.abs(error);
			if (absErr > maxError) {
				maxError = absErr;
			}
			totalErrorAcc.add(absErr);
			errorBoundAcc.add(errorBound);
			cardinalityAcc.add(value);
			cardinalityAcc.add(error);
		}

		return {
			value: out,
			errors,
			maxError,
			totalError: totalErrorAcc.total(),
			errorBound: errorBoundAcc.total(),
			cardinality: cardinalityAcc.total(),
		};
	}

	throw new TypeError('input must be a number, Array, numeric TypedArray, Map, or plain Object');
}
