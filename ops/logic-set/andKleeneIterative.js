/**
 * @typedef {boolean | 'unknown'} KleeneValue
 * Three-valued Strong Kleene (K3) truth value.
 */

/**
 * @typedef {Record<string, KleeneValue>} PlainPartialSet
 * Partial set represented as a plain object mapping element keys to Kleene truth values.
 * Absent keys represent `'unknown'` membership (open-world partial function semantics).
 */

/**
 * @typedef {Map<any, KleeneValue>} MapPartialSet
 * Partial set represented as a Map from elements to Kleene truth values.
 * Absent keys represent `'unknown'` membership (open-world partial function semantics).
 */

/**
 * Checks whether a value is a valid Strong Kleene truth value (`true`, `false`, or `'unknown'`).
 *
 * @param {unknown} value
 * @returns {value is KleeneValue}
 */
function isKleeneValue(value) {
	return value === true || value === false || value === 'unknown';
}

/**
 * Asserts that a value is a valid Strong Kleene truth value.
 *
 * @param {unknown} value
 * @param {string} label
 * @throws {TypeError}
 */
function assertKleeneValue(value, label) {
	if (!isKleeneValue(value)) {
		throw new TypeError(
			`Expected Kleene truth value (true, false, or "unknown") for ${label}, received ${formatType(value)}`,
		);
	}
}

/**
 * Checks whether a value is a plain object (`Object.prototype` or `null` prototype).
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Formats a value's type/representation for diagnostic messages.
 *
 * @param {unknown} value
 * @returns {string}
 */
function formatType(value) {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'Array';
	if (typeof value === 'object') {
		return value.constructor?.name ?? 'Object';
	}
	return `${typeof value} (${String(value)})`;
}

/**
 * Computes Strong Kleene conjunction (AND) iteratively over a sequence of Kleene truth values
 * (`true`, `false`, `'unknown'`) or over a sequence of partial sets (plain objects or `Map`s).
 *
 * Strong Kleene (K3) conjunction rules:
 * - `false ∧ x = x ∧ false = false` (even when `x` is `'unknown'`)
 * - `true ∧ true = true`
 * - `true ∧ 'unknown' = 'unknown' ∧ true = 'unknown' ∧ 'unknown' = 'unknown'`
 * - Empty array `[]` yields the conjunction identity `true`.
 *
 * Partial set intersection (pointwise Kleene AND):
 * - Every element key present in at least one input partial set is evaluated across all input
 *   partial sets, treating missing keys as `'unknown'`.
 * - Inputs must all be of the same kind (all Kleene values, all plain objects, or all `Map`s).
 * - All inputs and entries are validated before/during evaluation; inputs are never mutated.
 *
 * @param {...(KleeneValue | PlainPartialSet | MapPartialSet | Array<KleeneValue | PlainPartialSet | MapPartialSet>)} args
 *   Either one or more Kleene values / partial sets passed as arguments, or a single array of them.
 * @returns {KleeneValue | PlainPartialSet | MapPartialSet}
 *   The resulting Kleene truth value, plain-object partial set, or `Map` partial set.
 * @throws {TypeError} If called with no arguments, invalid Kleene values, unsupported types, or mixed operand kinds.
 */
export function andKleeneIterative(...args) {
	if (args.length === 0) {
		throw new TypeError('andKleeneIterative requires at least one argument');
	}

	const items = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;

	if (items.length === 0) {
		return true;
	}

	const first = items[0];

	if (isKleeneValue(first)) {
		let acc = true;
		for (let i = 0; i < items.length; i++) {
			const val = items[i];
			assertKleeneValue(val, `operand[${i}]`);
			if (acc === false || val === false) {
				acc = false;
			} else if (acc === 'unknown' || val === 'unknown') {
				acc = 'unknown';
			}
		}
		return acc;
	}

	if (first instanceof Map) {
		const universe = new Set();
		for (let i = 0; i < items.length; i++) {
			const ps = items[i];
			if (!(ps instanceof Map)) {
				throw new TypeError(
					`Expected all operands to be Map partial sets; operand[${i}] is ${formatType(ps)}`,
				);
			}
			for (const [key, val] of ps.entries()) {
				assertKleeneValue(val, `operand[${i}].get(${String(key)})`);
				universe.add(key);
			}
		}

		const result = new Map();
		for (const key of universe) {
			let acc = true;
			for (let i = 0; i < items.length; i++) {
				const ps = items[i];
				const val = ps.has(key) ? ps.get(key) : 'unknown';
				if (acc === false || val === false) {
					acc = false;
					break;
				}
				if (val === 'unknown') {
					acc = 'unknown';
				}
			}
			result.set(key, acc);
		}
		return result;
	}

	if (isPlainObject(first)) {
		const universe = new Set();
		for (let i = 0; i < items.length; i++) {
			const ps = items[i];
			if (!isPlainObject(ps)) {
				throw new TypeError(
					`Expected all operands to be plain-object partial sets; operand[${i}] is ${formatType(ps)}`,
				);
			}
			const keys = Object.keys(ps);
			for (let j = 0; j < keys.length; j++) {
				const key = keys[j];
				assertKleeneValue(ps[key], `operand[${i}][${JSON.stringify(key)}]`);
				universe.add(key);
			}
		}

		const result = {};
		for (const key of universe) {
			let acc = true;
			for (let i = 0; i < items.length; i++) {
				const ps = items[i];
				const val = Object.hasOwn(ps, key) ? ps[key] : 'unknown';
				if (acc === false || val === false) {
					acc = false;
					break;
				}
				if (val === 'unknown') {
					acc = 'unknown';
				}
			}
			Object.defineProperty(result, key, {
				value: acc,
				enumerable: true,
				writable: true,
				configurable: true,
			});
		}
		return result;
	}

	throw new TypeError(
		`Unsupported operand type for andKleeneIterative: expected Kleene value (true, false, "unknown"), plain object, or Map, received ${formatType(first)}`,
	);
}
