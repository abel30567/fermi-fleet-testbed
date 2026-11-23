/**
 * Validates that a membership degree is a finite number in the closed interval [0, 1].
 * Normalizes `-0` to `+0`.
 *
 * @param {unknown} value - Candidate membership degree.
 * @param {string} label - Descriptive label for error messages.
 * @returns {number} Validated membership degree in [0, 1].
 * @throws {TypeError} If `value` is not a number.
 * @throws {RangeError} If `value` is not finite or lies outside [0, 1].
 */
function validateMembership(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label} must be a number in [0, 1]`);
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`${label} must be a finite number in [0, 1], received ${value}`);
	}
	return value === 0 ? 0 : value;
}

/**
 * Checks whether a value is a plain object (prototype is `Object.prototype` or `null`).
 *
 * @param {unknown} value - Candidate value.
 * @returns {boolean} True when `value` is a plain object.
 */
function isPlainObject(value) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Computes the Zadeh fuzzy logical OR (union / S-norm: `max`) over one or more
 * fuzzy operands using a straightforward iterative implementation.
 *
 * Supports four homogeneous operand representations (all operands in a single
 * call must share the same representation):
 * 1. **Scalar membership degrees (`number`)**: Each value in `[0, 1]`. Returns
 *    the maximum membership degree across all operands.
 * 2. **Fuzzy membership vectors (`number[]`)**: Equal-length arrays of numbers
 *    in `[0, 1]`. Returns a new array containing the element-wise maximum.
 * 3. **Finite fuzzy sets as plain objects (`Record<string, number>`)**: Maps
 *    universe elements to membership degrees in `[0, 1]` (absent keys implicitly
 *    have membership `0`). Returns a new plain object over the union of keys.
 * 4. **Finite fuzzy sets as `Map<unknown, number>`**: Maps universe elements to
 *    membership degrees in `[0, 1]` (absent keys implicitly have membership `0`).
 *    Returns a new `Map` over the union of keys.
 *
 * Input containers are never mutated.
 *
 * @param {...(number | number[] | Record<string, number> | Map<any, number>)} operands
 *   One or more homogeneous fuzzy truth values or fuzzy sets with membership in `[0, 1]`.
 * @returns {number | number[] | Record<string, number> | Map<any, number>}
 *   The Zadeh fuzzy OR (union) matching the input representation.
 * @throws {TypeError} If no operands are provided, operand types are unsupported
 *   or mixed, or any membership value is not a number.
 * @throws {RangeError} If any membership value is non-finite or outside `[0, 1]`,
 *   or if array operands have mismatched lengths.
 */
export function orFuzzyIterative(...operands) {
	if (operands.length === 0) {
		throw new TypeError('orFuzzyIterative requires at least one operand');
	}

	const first = operands[0];

	// 1. Scalar fuzzy truth values
	if (typeof first === 'number') {
		let maxVal = validateMembership(first, 'operands[0]');
		for (let i = 1; i < operands.length; i++) {
			const val = validateMembership(operands[i], `operands[${i}]`);
			if (val > maxVal) {
				maxVal = val;
			}
		}
		return maxVal;
	}

	// 2. Fuzzy sets represented as equal-length membership arrays
	if (Array.isArray(first)) {
		const len = first.length;
		for (let k = 1; k < operands.length; k++) {
			if (!Array.isArray(operands[k])) {
				throw new TypeError(`operands[${k}] must be an Array to match operands[0]`);
			}
			if (operands[k].length !== len) {
				throw new RangeError(
					`operands[${k}] length (${operands[k].length}) does not match operands[0] length (${len})`
				);
			}
		}

		const result = new Array(len);
		for (let i = 0; i < len; i++) {
			let maxVal = validateMembership(first[i], `operands[0][${i}]`);
			for (let k = 1; k < operands.length; k++) {
				const val = validateMembership(operands[k][i], `operands[${k}][${i}]`);
				if (val > maxVal) {
					maxVal = val;
				}
			}
			result[i] = maxVal;
		}
		return result;
	}

	// 3. Fuzzy sets represented as Map<K, number>
	if (first instanceof Map) {
		for (let k = 1; k < operands.length; k++) {
			if (!(operands[k] instanceof Map)) {
				throw new TypeError(`operands[${k}] must be a Map to match operands[0]`);
			}
		}

		const result = new Map();
		for (let k = 0; k < operands.length; k++) {
			const current = operands[k];
			for (const [key, rawVal] of current.entries()) {
				const val = validateMembership(rawVal, `operands[${k}].get(${String(key)})`);
				if (!result.has(key) || val > result.get(key)) {
					result.set(key, val);
				}
			}
		}
		return result;
	}

	// 4. Fuzzy sets represented as plain objects Record<string, number>
	if (isPlainObject(first)) {
		for (let k = 1; k < operands.length; k++) {
			if (!isPlainObject(operands[k])) {
				throw new TypeError(`operands[${k}] must be a plain object to match operands[0]`);
			}
		}

		const result = {};
		for (let k = 0; k < operands.length; k++) {
			const current = operands[k];
			const keys = Object.keys(current);
			for (let i = 0; i < keys.length; i++) {
				const key = keys[i];
				const val = validateMembership(current[key], `operands[${k}][${JSON.stringify(key)}]`);
				const hasExisting = Object.hasOwn(result, key);
				if (!hasExisting || val > result[key]) {
					if (key === '__proto__') {
						Object.defineProperty(result, key, {
							value: val,
							enumerable: true,
							writable: true,
							configurable: true
						});
					} else {
						result[key] = val;
					}
				}
			}
		}
		return result;
	}

	throw new TypeError(
		'operands must be numbers in [0, 1], arrays of numbers, plain objects, or Maps'
	);
}
