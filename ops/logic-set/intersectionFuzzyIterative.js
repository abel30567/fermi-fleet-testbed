/**
 * Checks whether a value is a plain JavaScript object (literal or null-prototype).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * Validates that an argument is a well-formed fuzzy set whose own enumerable
 * values are finite numbers in the closed interval [0, 1].
 *
 * @param {unknown} fuzzySet
 * @param {number} index
 */
function validateFuzzySet(fuzzySet, index) {
	if (!isPlainObject(fuzzySet)) {
		throw new TypeError(
			`Argument at index ${index} must be a plain object representing a fuzzy set`
		)
	}

	const keys = Object.keys(fuzzySet)
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i]
		const membership = fuzzySet[key]
		if (typeof membership !== 'number') {
			throw new TypeError(
				`Membership value for key "${key}" in set ${index} must be a number`
			)
		}
		if (!Number.isFinite(membership) || membership < 0 || membership > 1) {
			throw new RangeError(
				`Membership value for key "${key}" in set ${index} must be a finite number in [0, 1], received ${membership}`
			)
		}
	}
}

/**
 * Defines a data property safely on a target object (avoiding __proto__ setter).
 *
 * @param {Record<string, number>} target
 * @param {string} key
 * @param {number} value
 */
function setOwnMembership(target, key, value) {
	Object.defineProperty(target, key, {
		value,
		writable: true,
		enumerable: true,
		configurable: true,
	})
}

/**
 * Computes the Zadeh fuzzy intersection of two or more fuzzy sets using a
 * straightforward iterative algorithm.
 *
 * Each fuzzy set is represented as a plain object mapping universe elements
 * (string keys) to membership degrees in [0, 1]. Elements omitted from a set
 * have an implicit membership degree of 0. Under Zadeh's intersection operator,
 * the resulting membership for each element x is:
 *
 *   mu_(A ∩ B ∩ ...)(x) = min(mu_A(x), mu_B(x), ...)
 *
 * Only elements with strictly positive resulting membership (the support of
 * the intersection) are included in the returned plain object. Input objects
 * are never mutated.
 *
 * @param {...Record<string, number>} sets - Two or more fuzzy sets with memberships in [0, 1].
 * @returns {Record<string, number>} A new plain object representing the Zadeh intersection.
 * @throws {TypeError} If fewer than two sets are provided, any set is not a plain object,
 *   or any membership value is not a number.
 * @throws {RangeError} If any membership value is NaN, non-finite, or outside [0, 1].
 */
export function intersectionFuzzyIterative(...sets) {
	if (sets.length < 2) {
		throw new TypeError(
			`intersectionFuzzyIterative requires at least 2 fuzzy sets, received ${sets.length}`
		)
	}

	for (let i = 0; i < sets.length; i++) {
		validateFuzzySet(sets[i], i)
	}

	/** @type {Record<string, number>} */
	let current = {}
	const firstSet = sets[0]
	const firstKeys = Object.keys(firstSet)
	for (let i = 0; i < firstKeys.length; i++) {
		const key = firstKeys[i]
		const membership = firstSet[key]
		if (membership > 0) {
			setOwnMembership(current, key, membership)
		}
	}

	for (let s = 1; s < sets.length; s++) {
		const nextSet = sets[s]
		/** @type {Record<string, number>} */
		const nextResult = {}
		const currentKeys = Object.keys(current)

		for (let i = 0; i < currentKeys.length; i++) {
			const key = currentKeys[i]
			if (Object.hasOwn(nextSet, key)) {
				const candidate = nextSet[key]
				if (candidate > 0) {
					const existing = current[key]
					const minMembership = existing < candidate ? existing : candidate
					setOwnMembership(nextResult, key, minMembership)
				}
			}
		}

		current = nextResult
	}

	return current
}
