/**
 * Logical AND (set intersection / conjunction) over one or more strictly
 * increasing (sorted, de-duplicated) finite numeric arrays.
 *
 * ## Mathematical Specification & Identities
 * For a non-empty finite series of sets $A_0, A_1, \dots, A_{k-1} \subset \mathbb{R}$,
 * this function computes the $k$-ary intersection:
 *
 * $$\bigcap_{j=0}^{k-1} A_j = \{ x \in \mathbb{R} \mid \forall j \in \{0, \dots, k-1\},\; x \in A_j \}$$
 *
 * The implementation exploits the Boolean / set-algebraic identities:
 * - **Commutativity & Associativity**:
 *   $$\bigcap_{j=0}^{k-1} A_j = \left(\cdots((A_{\pi(0)} \cap A_{\pi(1)}) \cap A_{\pi(2)})\cdots\right) \cap A_{\pi(k-1)}$$
 *   where $\pi$ orders operands by non-decreasing cardinality $|A_{\pi(0)}| \le \dots \le |A_{\pi(k-1)}|$
 *   to shrink intermediate results as early as possible.
 * - **Annihilator (absorbing element)**: $\emptyset \cap B = \emptyset$.
 * - **Idempotence**: $A \cap A = A$ (duplicate array references are skipped).
 * - **Interval-disjointness & boundary-touch closed-form identities** for sorted arrays:
 *   - $\max A < \min B \lor \max B < \min A \implies A \cap B = \emptyset$
 *   - $\max A = \min B \implies A \cap B = \{\max A\}$
 *   - $\max B = \min A \implies A \cap B = \{\min A\}$
 *
 * ## Pairwise Merge Algorithm
 * Given two sorted deduplicated arrays $A$ ($|A| = m$) and $B$ ($|B| = n$) with $m \le n$:
 * - When $n \le 4m$ (balanced sizes), a classic two-pointer linear merge computes
 *   $A \cap B$ in $O(m + n)$ time.
 * - When $n > 4m$ (skewed sizes), an adaptive galloping (exponential doubling +
 *   binary search) merge computes $A \cap B$ in optimal
 *   $O\left(m \log\left(\frac{n}{m} + 1\right)\right)$ comparisons.
 *
 * All input arrays are validated upfront (even if an earlier array is empty) so
 * invalid inputs always fail deterministically. Negative zero (`-0`) is normalized
 * to `+0` in the returned array, matching ES `Set` SameValueZero semantics.
 *
 * @param {...number[]} arrays - One or more strictly increasing arrays of finite numbers.
 * @returns {number[]} A newly allocated strictly increasing array of finite numbers
 *   representing the logical AND (intersection) of all input arrays.
 * @throws {RangeError} If no arrays are provided, or if any element is non-finite
 *   (`NaN`, `Infinity`, `-Infinity`), or if any array is unsorted or contains duplicates.
 * @throws {TypeError} If any argument is not an Array or contains a non-number element
 *   (including sparse holes).
 */
export function andSortedArrSeries(...arrays) {
	if (arrays.length === 0) {
		throw new RangeError('andSortedArrSeries requires at least one sorted deduplicated array')
	}

	for (let k = 0; k < arrays.length; k++) {
		validateSortedDeduplicatedNumericArray(arrays[k], k)
	}

	if (arrays.length === 1) {
		return canonicalCopy(arrays[0])
	}

	// Order operands by ascending cardinality (commutativity + associativity of intersection)
	const ordered = arrays.slice().sort((a, b) => a.length - b.length)

	// Annihilator identity: ∅ ∩ B = ∅
	if (ordered[0].length === 0) {
		return []
	}

	const seenRefs = new Set([ordered[0]])
	let acc = ordered[0]
	let isOwned = false

	for (let k = 1; k < ordered.length; k++) {
		const next = ordered[k]
		// Idempotence identity: if next was already intersected, acc ⊆ next ⇒ acc ∩ next = acc
		if (seenRefs.has(next)) {
			continue
		}
		seenRefs.add(next)

		acc = intersectPair(acc, next)
		isOwned = true

		if (acc.length === 0) {
			return []
		}
	}

	return isOwned ? acc : canonicalCopy(acc)
}

/**
 * Validates that `arr` is a dense Array of strictly increasing finite numbers.
 *
 * @param {unknown} arr - Candidate array to validate.
 * @param {number} argIndex - Zero-based argument index for error reporting.
 * @throws {TypeError} If `arr` is not an Array or has a non-number element.
 * @throws {RangeError} If any element is non-finite or not strictly greater than its predecessor.
 */
function validateSortedDeduplicatedNumericArray(arr, argIndex) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`Argument at index ${argIndex} must be an Array`)
	}

	for (let i = 0; i < arr.length; i++) {
		if (!(i in arr)) {
			throw new TypeError(`Argument at index ${argIndex} contains a sparse hole at index ${i}`)
		}
		const val = arr[i]
		if (typeof val !== 'number') {
			throw new TypeError(
				`Argument at index ${argIndex} contains non-number element at index ${i}: ${typeof val}`
			)
		}
		if (!Number.isFinite(val)) {
			throw new RangeError(
				`Argument at index ${argIndex} contains non-finite number at index ${i}: ${val}`
			)
		}
		if (i > 0) {
			const prev = arr[i - 1]
			if (val === prev) {
				throw new RangeError(
					`Argument at index ${argIndex} contains duplicate value ${val} at index ${i}`
				)
			}
			if (val < prev) {
				throw new RangeError(
					`Argument at index ${argIndex} is not sorted ascending at index ${i}: ${prev} > ${val}`
				)
			}
		}
	}
}

/**
 * Returns a fresh shallow copy of a numeric array with `-0` normalized to `0`.
 *
 * @param {number[]} arr - Validated sorted deduplicated numeric array.
 * @returns {number[]} Fresh array copy.
 */
function canonicalCopy(arr) {
	const out = new Array(arr.length)
	for (let i = 0; i < arr.length; i++) {
		const x = arr[i]
		out[i] = x === 0 ? 0 : x
	}
	return out
}

/**
 * Computes the intersection of two validated strictly increasing numeric arrays
 * using interval-bound short-circuits and adaptive linear/galloping merge.
 *
 * @param {number[]} a - First strictly increasing numeric array.
 * @param {number[]} b - Second strictly increasing numeric array.
 * @returns {number[]} Newly allocated strictly increasing intersection array.
 */
function intersectPair(a, b) {
	const small = a.length <= b.length ? a : b
	const large = a.length <= b.length ? b : a
	const m = small.length
	const n = large.length

	if (m === 0 || n === 0) {
		return []
	}

	// Closed-form interval disjointness and boundary-touch identities
	const smallMin = small[0]
	const smallMax = small[m - 1]
	const largeMin = large[0]
	const largeMax = large[n - 1]

	if (smallMax < largeMin || largeMax < smallMin) {
		return []
	}
	if (smallMax === largeMin) {
		return [smallMax === 0 ? 0 : smallMax]
	}
	if (largeMax === smallMin) {
		return [smallMin === 0 ? 0 : smallMin]
	}

	// Balanced sizes: classic two-pointer linear merge O(m + n)
	if (n <= 4 * m) {
		const out = []
		let i = 0
		let j = 0
		while (i < m && j < n) {
			const x = small[i]
			const y = large[j]
			if (x < y) {
				i++
			} else if (x > y) {
				j++
			} else {
				out.push(x === 0 ? 0 : x)
				i++
				j++
			}
		}
		return out
	}

	// Skewed sizes: galloping (exponential) search merge O(m log(n / m + 1))
	const out = []
	let j = 0
	for (let i = 0; i < m && j < n; i++) {
		const target = small[i]
		if (target > largeMax) {
			break
		}
		if (target < large[j]) {
			continue
		}
		if (target === large[j]) {
			out.push(target === 0 ? 0 : target)
			j++
			continue
		}

		// Exponential gallop from j to bracket target: large[lo] < target <= large[hi]
		let step = 1
		let lo = j
		let hi = j + step
		while (hi < n && large[hi] < target) {
			lo = hi
			step *= 2
			hi = j + step
		}
		if (hi >= n) {
			hi = n - 1
		}

		// Binary search for lower bound in [lo + 1, hi]
		let left = lo + 1
		let right = hi
		while (left < right) {
			const mid = left + ((right - left) >>> 1)
			if (large[mid] < target) {
				left = mid + 1
			} else {
				right = mid
			}
		}

		j = left
		if (large[j] === target) {
			out.push(target === 0 ? 0 : target)
			j++
		}
	}

	return out
}
