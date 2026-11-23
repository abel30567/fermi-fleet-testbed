/**
 * Precomputed 2x2 truth table for binary boolean union (logical OR).
 * Indexed by `(a ? 2 : 0) | (b ? 1 : 0)`:
 * - `0` (`false`, `false`) -> `false`
 * - `1` (`false`, `true`)  -> `true`
 * - `2` (`true`,  `false`) -> `true`
 * - `3` (`true`,  `true`)  -> `true`
 *
 * @type {ReadonlyArray<boolean>}
 */
const BOOL_UNION_TABLE = Object.freeze([false, true, true, true])

/**
 * Two-level WeakMap memoization cache for Set union pairs.
 * Keyed by `(a, b)` so input Set instances remain eligible for garbage collection.
 * Each entry stores element snapshots of `a` and `b` to detect in-place mutations,
 * along with the precomputed union array.
 *
 * @type {WeakMap<Set<*>, WeakMap<Set<*>, { aSnapshot: Array<*>, bSnapshot: Array<*>, union: Array<*> }>>}
 */
const setUnionCache = new WeakMap()

/**
 * Verifies that a Set still contains the exact same elements as a recorded snapshot.
 *
 * @param {Set<*>} set
 * @param {Array<*>} snapshot
 * @returns {boolean}
 */
function isSnapshotValid(set, snapshot) {
	if (set.size !== snapshot.length) {
		return false
	}
	for (let i = 0; i < snapshot.length; i++) {
		if (!set.has(snapshot[i])) {
			return false
		}
	}
	return true
}

/**
 * Computes the union of two Set instances using WeakMap-backed memoization.
 * Always returns a fresh Set instance so caller mutations cannot corrupt the cache.
 *
 * @template T
 * @param {Set<T>} a
 * @param {Set<T>} b
 * @returns {Set<T>}
 */
function unionSetPair(a, b) {
	let inner = setUnionCache.get(a)
	if (inner !== undefined) {
		const entry = inner.get(b)
		if (
			entry !== undefined &&
			isSnapshotValid(a, entry.aSnapshot) &&
			isSnapshotValid(b, entry.bSnapshot)
		) {
			return new Set(entry.union)
		}
	}

	const aSnapshot = Array.from(a)
	const bSnapshot = Array.from(b)
	const result = new Set(aSnapshot)
	for (let i = 0; i < bSnapshot.length; i++) {
		result.add(bSnapshot[i])
	}

	if (inner === undefined) {
		inner = new WeakMap()
		setUnionCache.set(a, inner)
	}
	inner.set(b, {
		aSnapshot,
		bSnapshot,
		union: Array.from(result),
	})

	return result
}

/**
 * Computes the logic-set union over plain booleans or JS `Set` objects using a
 * precomputed truth table (for booleans) and WeakMap-backed memoization (for Sets).
 *
 * All arguments must share the same supported type: either all plain booleans
 * (`typeof x === 'boolean'`) or all `Set` instances (`x instanceof Set`).
 * At least two arguments are required.
 *
 * @overload
 * @param {boolean} a - First plain boolean operand.
 * @param {boolean} b - Second plain boolean operand.
 * @param {...boolean} rest - Optional additional plain boolean operands.
 * @returns {boolean} The logical union (disjunction) of all boolean operands.
 *
 * @overload
 * @template T
 * @param {Set<T>} a - First Set operand.
 * @param {Set<T>} b - Second Set operand.
 * @param {...Set<T>} rest - Optional additional Set operands.
 * @returns {Set<T>} A new Set containing all unique elements from the input Sets.
 *
 * @throws {TypeError} If fewer than two operands are provided, operands are not
 * plain booleans or `Set` instances, or operand types are mixed.
 */
export function unionBoolMemo(a, b, ...rest) {
	if (typeof a === 'boolean' && typeof b === 'boolean') {
		for (let i = 0; i < rest.length; i++) {
			if (typeof rest[i] !== 'boolean') {
				throw new TypeError(
					`unionBoolMemo: expected plain boolean at argument index ${i + 2}`,
				)
			}
		}

		let acc = BOOL_UNION_TABLE[(a ? 2 : 0) | (b ? 1 : 0)]
		for (let i = 0; i < rest.length; i++) {
			acc = BOOL_UNION_TABLE[(acc ? 2 : 0) | (rest[i] ? 1 : 0)]
		}
		return acc
	}

	if (a instanceof Set && b instanceof Set) {
		for (let i = 0; i < rest.length; i++) {
			if (!(rest[i] instanceof Set)) {
				throw new TypeError(
					`unionBoolMemo: expected Set instance at argument index ${i + 2}`,
				)
			}
		}

		let acc = unionSetPair(a, b)
		for (let i = 0; i < rest.length; i++) {
			acc = unionSetPair(acc, rest[i])
		}
		return acc
	}

	throw new TypeError(
		'unionBoolMemo: arguments must be either all plain booleans or all Set instances',
	)
}
