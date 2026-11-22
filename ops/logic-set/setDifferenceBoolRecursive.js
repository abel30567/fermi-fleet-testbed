/**
 * Computes the relative complement (set difference) `A \ B` (and optionally
 * variadic `A \ B \ C ...`) over standard JavaScript {@link Set} objects using
 * boolean membership tests and a recursive divide-and-conquer partitioning of
 * the elements of `setA`.
 *
 * Neither the input sets nor their elements are mutated; a new {@link Set}
 * instance is always returned.
 *
 * @template T
 * @param {Set<T>} setA - The minuend set whose elements are filtered.
 * @param {Set<T>} setB - The first subtrahend set whose elements are excluded.
 * @param {...Set<T>} moreSets - Optional additional subtrahend sets to exclude.
 * @returns {Set<T>} A new Set containing all elements in `setA` that are not
 *   present in `setB` (or any set in `moreSets`).
 * @throws {TypeError} If fewer than two arguments are provided or if any
 *   argument is not an instance of {@link Set}.
 */
export function setDifferenceBoolRecursive(setA, setB, ...moreSets) {
	if (!(setA instanceof Set)) {
		throw new TypeError('setDifferenceBoolRecursive: expected setA (argument 1) to be a Set')
	}
	if (!(setB instanceof Set)) {
		throw new TypeError('setDifferenceBoolRecursive: expected setB (argument 2) to be a Set')
	}
	for (let i = 0; i < moreSets.length; i += 1) {
		if (!(moreSets[i] instanceof Set)) {
			throw new TypeError(
				`setDifferenceBoolRecursive: expected argument ${i + 3} to be a Set`
			)
		}
	}

	const diffPair = (sourceSet, excludeSet) => {
		const elements = Array.from(sourceSet)

		const divideAndConquer = (start, end) => {
			if (start >= end) {
				return new Set()
			}
			if (end - start === 1) {
				const element = elements[start]
				return excludeSet.has(element) ? new Set() : new Set([element])
			}

			const mid = start + Math.floor((end - start) / 2)
			const left = divideAndConquer(start, mid)
			const right = divideAndConquer(mid, end)

			for (const value of right) {
				left.add(value)
			}
			return left
		}

		return divideAndConquer(0, elements.length)
	}

	const applyVariadic = (currentSet, index) => {
		if (index >= moreSets.length || currentSet.size === 0) {
			return currentSet
		}
		return applyVariadic(diffPair(currentSet, moreSets[index]), index + 1)
	}

	return applyVariadic(diffPair(setA, setB), 0)
}
