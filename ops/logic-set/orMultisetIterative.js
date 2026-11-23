/**
 * Safely formats a Map key for diagnostic error messages.
 *
 * @param {unknown} key
 * @returns {string}
 */
function formatKey(key) {
	try {
		return String(key);
	} catch {
		return '[unprintable key]';
	}
}

/**
 * Validates that a value is a multiset represented as Map<unknown, number>
 * where every count is a non-negative safe integer.
 *
 * @param {unknown} multiset
 * @param {string} name
 * @throws {TypeError} If `multiset` is not a Map or any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, non-finite, or unsafe.
 */
function validateMultiset(multiset, name) {
	if (!(multiset instanceof Map)) {
		throw new TypeError(`${name} must be a Map`);
	}

	for (const [key, count] of multiset) {
		if (typeof count !== 'number') {
			throw new TypeError(`${name} count for key "${formatKey(key)}" must be a number`);
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`${name} count for key "${formatKey(key)}" must be a non-negative safe integer`
			);
		}
	}
}

/**
 * Computes the logical OR (multiset union / join) of two multisets represented
 * as `Map<value, count>`, using a straightforward iterative implementation.
 *
 * For each distinct key present in `a` or `b`, its resulting multiplicity is
 * `max(countA, countB)`. Entries with a resulting count of `0` are omitted so
 * the returned Map contains only positive integer multiplicities. Neither input
 * Map is mutated.
 *
 * @template T
 * @param {Map<T, number>} a First multiset (`Map<value, count>`).
 * @param {Map<T, number>} b Second multiset (`Map<value, count>`).
 * @returns {Map<T, number>} New multiset containing the element-wise maximum counts.
 * @throws {TypeError} If `a` or `b` is not a Map, or any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, non-finite, or not a safe integer.
 */
export function orMultisetIterative(a, b) {
	validateMultiset(a, 'a');
	validateMultiset(b, 'b');

	const result = new Map();

	for (const [key, count] of a) {
		if (count > 0) {
			result.set(key, count);
		}
	}

	for (const [key, count] of b) {
		if (count > 0) {
			const existing = result.get(key) ?? 0;
			if (count > existing) {
				result.set(key, count);
			}
		}
	}

	return result;
}
