/**
 * Formats a Map key safely for diagnostic error messages without throwing on
 * symbols or null-prototype objects.
 *
 * @param {unknown} key
 * @returns {string}
 */
function formatKey(key) {
	if (typeof key === 'symbol') {
		return key.toString();
	}
	if (typeof key === 'string') {
		return JSON.stringify(key);
	}
	if (key === null || typeof key !== 'object') {
		return String(key);
	}
	return Object.prototype.toString.call(key);
}

/**
 * Validates that an input is a Map whose values are non-negative safe integers.
 *
 * @param {unknown} map
 * @param {string} name
 * @throws {TypeError} If `map` is not a Map or any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, non-finite, or unsafe.
 */
function validateMultiset(map, name) {
	if (!(map instanceof Map)) {
		const actual = map === null ? 'null' : typeof map;
		throw new TypeError(`Expected ${name} to be a Map, got ${actual}`);
	}

	for (const [key, count] of map.entries()) {
		if (typeof count !== 'number') {
			const actual = count === null ? 'null' : typeof count;
			throw new TypeError(
				`Expected multiset count in ${name} for key ${formatKey(key)} to be a number, got ${actual}`
			);
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`Expected multiset count in ${name} for key ${formatKey(key)} to be a non-negative safe integer, got ${count}`
			);
		}
	}
}

/**
 * Computes the standard multiset union of two multisets `a` and `b` using a
 * straightforward iterative algorithm.
 *
 * Each multiset is represented as a `Map<value, count>` where every count is a
 * non-negative safe integer representing element multiplicity. For every key
 * `x` across `a` and `b`, the union multiplicity is:
 *
 *   m_{A ∪ B}(x) = max(m_A(x), m_B(x))
 *
 * The returned `Map` is canonical (entries with count `0` are omitted), and
 * neither input `Map` is mutated.
 *
 * @template T
 * @param {Map<T, number>} a First multiset mapping values to non-negative safe integer counts.
 * @param {Map<T, number>} b Second multiset mapping values to non-negative safe integer counts.
 * @returns {Map<T, number>} A new canonical Map representing the multiset union `a ∪ b`.
 * @throws {TypeError} If `a` or `b` is not a `Map`, or if any multiplicity is not a `number`.
 * @throws {RangeError} If any multiplicity is negative, NaN, infinite, non-integer, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function unionMultisetIterative(a, b) {
	validateMultiset(a, 'a');
	validateMultiset(b, 'b');

	const result = new Map();

	for (const [key, countA] of a.entries()) {
		if (countA > 0) {
			result.set(key, countA);
		}
	}

	for (const [key, countB] of b.entries()) {
		if (countB > 0) {
			const existing = result.get(key) ?? 0;
			if (countB > existing) {
				result.set(key, countB);
			}
		}
	}

	return result;
}
