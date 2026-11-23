/**
 * Precomputed Zadeh fuzzy intersection lookup table resolution.
 * Covers every hundredth in [0, 1] inclusive: 0.00, 0.01, ..., 1.00.
 */
const GRID_STEPS = 100;
const GRID_SIZE = GRID_STEPS + 1;

/**
 * Maximum number of off-grid scalar pairs retained in the exact memoization cache.
 */
const MAX_MEMO_ENTRIES = 4096;

/**
 * Precomputed table of Zadeh t-norm values T(i / 100, j / 100) = min(i, j) / 100.
 * Stored in row-major order as a flat Float64Array of length 101 * 101 = 10,201.
 */
const ZADEH_MIN_TABLE = (() => {
	const table = new Float64Array(GRID_SIZE * GRID_SIZE);
	for (let i = 0; i < GRID_SIZE; i++) {
		const rowOffset = i * GRID_SIZE;
		for (let j = 0; j < GRID_SIZE; j++) {
			table[rowOffset + j] = (i <= j ? i : j) / GRID_STEPS;
		}
	}
	return table;
})();

/**
 * Bounded exact memoization cache for off-grid scalar membership pairs.
 * Keyed by `${a},${b}` where `a` and `b` are normalized finite numbers in [0, 1].
 * @type {Map<string, number>}
 */
const scalarMemo = new Map();

/**
 * Validates that a value is a finite fuzzy membership degree in [0, 1] and
 * normalizes -0 to +0.
 *
 * @param {unknown} value - Candidate membership degree.
 * @param {string} label - Context label for error messages.
 * @returns {number} Normalized membership degree in [0, 1].
 */
function validateMembership(value, label) {
	if (typeof value !== "number") {
		throw new TypeError(`${label} must be a number in [0, 1]`);
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`${label} must be a finite number in [0, 1], received ${value}`);
	}
	return value === 0 ? 0 : value;
}

/**
 * Checks whether a value is a plain object (Object.prototype or null prototype).
 *
 * @param {unknown} value - Candidate value.
 * @returns {value is Record<string, number>} True when value is a plain object.
 */
function isPlainObject(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Classifies a fuzzy input into one of the four supported representations.
 *
 * @param {unknown} value - Candidate fuzzy truth value or fuzzy set.
 * @returns {"number" | "array" | "map" | "object"} Representation kind.
 */
function classifyInput(value) {
	if (typeof value === "number") return "number";
	if (Array.isArray(value)) return "array";
	if (value instanceof Map) return "map";
	if (isPlainObject(value)) return "object";
	throw new TypeError(
		"intersectionFuzzyMemo arguments must all be numbers in [0, 1], arrays, Maps, or plain objects",
	);
}

/**
 * Inserts a pair into the bounded scalar memoization cache with FIFO eviction.
 *
 * @param {string} key - Serialized pair key.
 * @param {number} value - Computed Zadeh intersection value.
 */
function setMemoEntry(key, value) {
	if (scalarMemo.size >= MAX_MEMO_ENTRIES) {
		const oldestKey = scalarMemo.keys().next().value;
		scalarMemo.delete(oldestKey);
	}
	scalarMemo.set(key, value);
}

/**
 * Computes the Zadeh fuzzy intersection (minimum t-norm) of two validated
 * membership values in [0, 1] using the precomputed 101x101 lookup table for
 * exact grid points and a bounded memoization cache for off-grid values.
 *
 * @param {number} a - Normalized membership degree in [0, 1].
 * @param {number} b - Normalized membership degree in [0, 1].
 * @returns {number} Zadeh intersection min(a, b) in [0, 1].
 */
function zadehMinMemo(a, b) {
	const ia = Math.round(a * GRID_STEPS);
	const ib = Math.round(b * GRID_STEPS);
	if (ia / GRID_STEPS === a && ib / GRID_STEPS === b) {
		return ZADEH_MIN_TABLE[ia * GRID_SIZE + ib];
	}

	const key = `${a},${b}`;
	const cached = scalarMemo.get(key);
	if (cached !== undefined) {
		return cached;
	}

	const result = a <= b ? a : b;
	setMemoEntry(key, result);
	if (a !== b) {
		setMemoEntry(`${b},${a}`, result);
	}
	return result;
}

/**
 * Safely assigns an own data property on a plain object (avoiding __proto__ setter issues).
 *
 * @param {Record<string, number>} target - Destination object.
 * @param {string} key - Property key.
 * @param {number} value - Membership value.
 */
function setOwnProperty(target, key, value) {
	if (key === "__proto__") {
		Object.defineProperty(target, key, {
			value,
			writable: true,
			enumerable: true,
			configurable: true,
		});
	} else {
		target[key] = value;
	}
}

/**
 * Computes the Zadeh fuzzy intersection (minimum t-norm) over two or more fuzzy
 * truth values or fuzzy sets with membership degrees in `[0, 1]`, backed by a
 * precomputed 101×101 lookup table for hundredth-grid points and a bounded
 * memoization cache for off-grid values.
 *
 * Supported homogeneous input forms (all arguments must share the same kind):
 * - **Scalars (`number`)**: returns `min(a, b, ...)` in `[0, 1]`.
 * - **Dense arrays (`number[]`)**: equal-length membership vectors; returns a new
 *   array with element-wise Zadeh intersection.
 * - **`Map<K, number>`**: returns a new `Map` containing keys present in every input
 *   map with the minimum membership across inputs (absent keys have implicit
 *   membership `0`).
 * - **Plain objects (`Record<string, number>`)**: returns a new plain object
 *   containing own enumerable keys present in every input object with the minimum
 *   membership across inputs (absent keys have implicit membership `0`).
 *
 * All membership values across all inputs are validated to be finite numbers in
 * `[0, 1]`, and input collections are never mutated.
 *
 * @template {number | number[] | Map<unknown, number> | Record<string, number>} T
 * @param {...T} inputs - Two or more fuzzy truth values or fuzzy sets of the same kind.
 * @returns {T} The Zadeh fuzzy intersection in the same representation as the inputs.
 * @throws {TypeError} If fewer than two arguments are provided, input types do not match,
 *   or any membership value is not a number.
 * @throws {RangeError} If any membership value is outside `[0, 1]` (or non-finite), or if
 *   array inputs have differing lengths.
 */
export function intersectionFuzzyMemo(...inputs) {
	if (inputs.length < 2) {
		throw new TypeError("intersectionFuzzyMemo requires at least two arguments");
	}

	const kind = classifyInput(inputs[0]);
	for (let i = 1; i < inputs.length; i++) {
		if (classifyInput(inputs[i]) !== kind) {
			throw new TypeError(
				`intersectionFuzzyMemo requires all arguments to have the same type (expected ${kind})`,
			);
		}
	}

	if (kind === "number") {
		let acc = validateMembership(inputs[0], "argument 0");
		for (let i = 1; i < inputs.length; i++) {
			const val = validateMembership(inputs[i], `argument ${i}`);
			acc = zadehMinMemo(acc, val);
		}
		return acc;
	}

	if (kind === "array") {
		const expectedLength = inputs[0].length;
		for (let s = 0; s < inputs.length; s++) {
			const arr = inputs[s];
			if (arr.length !== expectedLength) {
				throw new RangeError(
					`Array length mismatch at argument ${s}: expected ${expectedLength}, received ${arr.length}`,
				);
			}
			for (let i = 0; i < expectedLength; i++) {
				validateMembership(arr[i], `argument ${s}[${i}]`);
			}
		}

		const result = new Array(expectedLength);
		for (let i = 0; i < expectedLength; i++) {
			let acc = inputs[0][i] === 0 ? 0 : inputs[0][i];
			for (let s = 1; s < inputs.length; s++) {
				const v = inputs[s][i] === 0 ? 0 : inputs[s][i];
				acc = zadehMinMemo(acc, v);
			}
			result[i] = acc;
		}
		return result;
	}

	if (kind === "map") {
		for (let s = 0; s < inputs.length; s++) {
			for (const [key, val] of inputs[s].entries()) {
				validateMembership(val, `argument ${s}.get(${String(key)})`);
			}
		}

		const result = new Map();
		for (const [key, firstVal] of inputs[0].entries()) {
			let presentInAll = true;
			let acc = firstVal === 0 ? 0 : firstVal;
			for (let s = 1; s < inputs.length; s++) {
				if (!inputs[s].has(key)) {
					presentInAll = false;
					break;
				}
				const v = inputs[s].get(key);
				acc = zadehMinMemo(acc, v === 0 ? 0 : v);
			}
			if (presentInAll) {
				result.set(key, acc);
			}
		}
		return result;
	}

	// kind === "object"
	for (let s = 0; s < inputs.length; s++) {
		const obj = inputs[s];
		for (const key of Object.keys(obj)) {
			validateMembership(obj[key], `argument ${s}.${key}`);
		}
	}

	const result = {};
	for (const key of Object.keys(inputs[0])) {
		let presentInAll = true;
		const firstVal = inputs[0][key];
		let acc = firstVal === 0 ? 0 : firstVal;
		for (let s = 1; s < inputs.length; s++) {
			if (!Object.hasOwn(inputs[s], key)) {
				presentInAll = false;
				break;
			}
			const v = inputs[s][key];
			acc = zadehMinMemo(acc, v === 0 ? 0 : v);
		}
		if (presentInAll) {
			setOwnProperty(result, key, acc);
		}
	}
	return result;
}
