/**
 * Numerically stable fuzzy logical XOR (symmetric difference) under Zadeh
 * operators over membership degrees in [0, 1].
 *
 * Under Zadeh operators (NOT(x) = 1 - x, AND(a, b) = min(a, b),
 * OR(a, b) = max(a, b)), the disjunctive and conjunctive forms of XOR coincide:
 *
 *   XOR(a, b) = max(min(a, 1 - b), min(1 - a, b))
 *             = min(max(a, b), 1 - min(a, b)).
 *
 * Moreover, Zadeh XOR is commutative and associative. Defining each operand's
 * boundary distance m(x) = min(x, 1 - x) in [0, 0.5], the n-ary Zadeh XOR has
 * the exact closed form:
 *
 *   M = max_i m(x_i)
 *   XOR(x_1, ..., x_n) = 0.5   if M = 0.5
 *                      = 1 - M if M < 0.5 and |{i : x_i > 0.5}| is odd
 *                      = M     if M < 0.5 and |{i : x_i > 0.5}| is even.
 *
 * Numerical robustness:
 * - For x <= 0.5, m(x) = x is exact (0 ulp).
 * - For x > 0.5, m(x) = 1 - x is exact by Sterbenz's Lemma (0 ulp).
 * - Consequently M = max_i m(x_i) is computed with zero rounding error and
 *   never suffers catastrophic cancellation on chained inputs such as
 *   xorFuzzyStable(1e-20, 1, 1), where naive sequential evaluation returns 0.
 * - The final value is exact (0 ulp) whenever the parity is even, M = 0.5, or
 *   M originated from an operand > 0.5; otherwise 1 - M is correctly rounded
 *   to within 0.5 ulp in IEEE-754 binary64.
 */

/**
 * Validates that a value is a finite number in [0, 1].
 *
 * @param {unknown} value - Candidate membership degree.
 * @param {string} label - Context label for error messages.
 * @returns {number} Validated membership degree in [0, 1] (with -0 normalized to 0).
 */
function validateMembership(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label} must be a number in [0, 1]`);
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`${label} must be a finite number in [0, 1]`);
	}
	return value === 0 ? 0 : value;
}

/**
 * Checks whether a value is a numeric TypedArray (excluding DataView and BigInt views).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isNumericTypedArray(value) {
	return (
		ArrayBuffer.isView(value) &&
		!(value instanceof DataView) &&
		!(value instanceof BigInt64Array) &&
		!(value instanceof BigUint64Array)
	);
}

/**
 * Checks whether a value is a plain object (Object.prototype or null prototype).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
	if (value === null || typeof value !== 'object') {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Computes the numerically stable Zadeh XOR of two or more validated scalar
 * membership degrees in [0, 1].
 *
 * @param {number[]} values - Pre-validated membership values in [0, 1].
 * @returns {number} Exact or <= 0.5-ulp correctly rounded Zadeh XOR in [0, 1].
 */
function xorValidatedScalars(values) {
	let maxBoundaryDist = 0;
	let oddAboveHalf = false;

	for (let i = 0; i < values.length; i++) {
		const x = values[i];
		if (x === 0.5) {
			return 0.5;
		}
		let dist;
		if (x > 0.5) {
			// Exact by Sterbenz's Lemma for all x in (0.5, 1].
			dist = 1 - x;
			oddAboveHalf = !oddAboveHalf;
		} else {
			dist = x;
		}
		if (dist > maxBoundaryDist) {
			maxBoundaryDist = dist;
		}
	}

	if (!oddAboveHalf) {
		return maxBoundaryDist === 0 ? 0 : maxBoundaryDist;
	}

	const result = 1 - maxBoundaryDist;
	if (result <= 0) {
		return 0;
	}
	if (result >= 1) {
		return 1;
	}
	return result;
}

/**
 * Computes the numerically stable Zadeh fuzzy logical XOR (symmetric difference)
 * of two or more fuzzy truth values or fuzzy sets.
 *
 * Supported operand kinds (all arguments must share the same kind):
 * - **Scalars**: numbers in [0, 1] -> returns a number in [0, 1].
 * - **Sequences**: equal-length `Array` or numeric `TypedArray` of numbers in
 *   [0, 1] -> returns elementwise XOR (`Float64Array` if all inputs are
 *   TypedArrays, otherwise `Array`).
 * - **Plain objects**: maps from element keys to membership degrees in [0, 1]
 *   (absent keys have membership 0) -> returns a plain object over the union
 *   of keys.
 * - **Maps**: `Map<K, number>` with membership degrees in [0, 1] (absent keys
 *   have membership 0) -> returns a `Map<K, number>` over the union of keys.
 *
 * @param {number | number[] | Float64Array | Float32Array | Record<string, number> | Map<any, number>} a - First fuzzy value or fuzzy set.
 * @param {number | number[] | Float64Array | Float32Array | Record<string, number> | Map<any, number>} b - Second fuzzy value or fuzzy set.
 * @param {...(number | number[] | Float64Array | Float32Array | Record<string, number> | Map<any, number>)} rest - Additional fuzzy values or fuzzy sets.
 * @returns {number | number[] | Float64Array | Record<string, number> | Map<any, number>} Zadeh XOR result in [0, 1].
 * @throws {TypeError} If fewer than two operands are given, operand types are unsupported or mismatched, or any membership is not a number.
 * @throws {RangeError} If any membership is non-finite or outside [0, 1], or if sequence operands have mismatched lengths.
 */
export function xorFuzzyStable(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError('xorFuzzyStable requires at least two operands');
	}

	const operands = [a, b, ...rest];

	// 1. Scalar fuzzy truth values
	if (typeof a === 'number') {
		const validated = new Array(operands.length);
		for (let i = 0; i < operands.length; i++) {
			validated[i] = validateMembership(operands[i], `operand[${i}]`);
		}
		return xorValidatedScalars(validated);
	}

	// 2. Indexed fuzzy sets (Array or numeric TypedArray)
	if (Array.isArray(a) || isNumericTypedArray(a)) {
		const length = a.length;
		let allTyped = isNumericTypedArray(a);

		for (let i = 1; i < operands.length; i++) {
			const op = operands[i];
			const isTyped = isNumericTypedArray(op);
			if (!Array.isArray(op) && !isTyped) {
				throw new TypeError(`operand[${i}] must be an Array or numeric TypedArray`);
			}
			if (op.length !== length) {
				throw new RangeError(
					`operand[${i}] length (${op.length}) does not match operand[0] length (${length})`
				);
			}
			allTyped = allTyped && isTyped;
		}

		const result = allTyped ? new Float64Array(length) : new Array(length);
		const slice = new Array(operands.length);

		for (let idx = 0; idx < length; idx++) {
			for (let i = 0; i < operands.length; i++) {
				slice[i] = validateMembership(operands[i][idx], `operand[${i}][${idx}]`);
			}
			result[idx] = xorValidatedScalars(slice);
		}
		return result;
	}

	// 3. Map fuzzy sets
	if (a instanceof Map) {
		const keys = new Set();
		for (let i = 0; i < operands.length; i++) {
			const op = operands[i];
			if (!(op instanceof Map)) {
				throw new TypeError(`operand[${i}] must be a Map`);
			}
			for (const [k, v] of op.entries()) {
				validateMembership(v, `operand[${i}].get(${String(k)})`);
				keys.add(k);
			}
		}

		const result = new Map();
		const slice = new Array(operands.length);

		for (const key of keys) {
			for (let i = 0; i < operands.length; i++) {
				const op = operands[i];
				slice[i] = op.has(key) ? op.get(key) : 0;
				if (slice[i] === 0) {
					slice[i] = 0;
				}
			}
			result.set(key, xorValidatedScalars(slice));
		}
		return result;
	}

	// 4. Plain-object fuzzy sets
	if (isPlainObject(a)) {
		const keys = new Set();
		for (let i = 0; i < operands.length; i++) {
			const op = operands[i];
			if (!isPlainObject(op)) {
				throw new TypeError(`operand[${i}] must be a plain object`);
			}
			const opKeys = Object.keys(op);
			for (let k = 0; k < opKeys.length; k++) {
				const key = opKeys[k];
				validateMembership(op[key], `operand[${i}][${JSON.stringify(key)}]`);
				keys.add(key);
			}
		}

		const result = {};
		const slice = new Array(operands.length);

		for (const key of keys) {
			for (let i = 0; i < operands.length; i++) {
				const op = operands[i];
				const v = Object.hasOwn(op, key) ? op[key] : 0;
				slice[i] = v === 0 ? 0 : v;
			}
			Object.defineProperty(result, key, {
				value: xorValidatedScalars(slice),
				enumerable: true,
				writable: true,
				configurable: true,
			});
		}
		return result;
	}

	throw new TypeError(
		'xorFuzzyStable operands must be numbers in [0, 1], Arrays, numeric TypedArrays, plain objects, or Maps'
	);
}
