/**
 * Computes the intersection (meet) of two or more JS `Set` instances or two or
 * more plain booleans with strict upfront validation and deterministic
 * SameValueZero membership semantics.
 *
 * - For `Set` inputs: validates every argument is an `instanceof Set` upfront,
 *   pivots on the smallest set first (and checks remaining sets in ascending
 *   size order) for optimal time complexity on skewed inputs, preserves
 *   SameValueZero equality (`NaN` equals `NaN`, `-0` and `+0` both normalize to
 *   `+0`), and returns a fresh `Set` without mutating any input.
 * - For plain boolean inputs: validates every argument has `typeof x === 'boolean'`
 *   upfront (preventing silent short-circuiting over invalid trailing inputs)
 *   and returns their logical conjunction (boolean meet / AND).
 *
 * @template T
 * @overload
 * @param {boolean} a
 * @param {boolean} b
 * @param {...boolean} rest
 * @returns {boolean}
 *
 * @overload
 * @param {Set<T>} a
 * @param {Set<T>} b
 * @param {...Set<T>} rest
 * @returns {Set<T>}
 *
 * @param {boolean | Set<T>} a - First boolean or Set operand.
 * @param {boolean | Set<T>} b - Second boolean or Set operand.
 * @param {...(boolean | Set<T>)} rest - Additional operands matching the same kind.
 * @returns {boolean | Set<T>} Logical AND for booleans, or a new intersection Set.
 * @throws {TypeError} If fewer than two arguments are provided, or if arguments
 *   are mixed or neither all plain booleans nor all `Set` instances.
 */
export function intersectionBoolStable(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError(
			'intersectionBoolStable requires at least two arguments (all plain booleans or all Set instances)'
		)
	}

	const inputs = [a, b, ...rest]

	if (typeof a === 'boolean') {
		for (let i = 1; i < inputs.length; i++) {
			if (typeof inputs[i] !== 'boolean') {
				throw new TypeError(
					`Expected all arguments to be plain booleans, but argument at index ${i} has type ${typeof inputs[i]}`
				)
			}
		}

		for (let i = 0; i < inputs.length; i++) {
			if (!inputs[i]) {
				return false
			}
		}
		return true
	}

	if (a instanceof Set) {
		for (let i = 1; i < inputs.length; i++) {
			if (!(inputs[i] instanceof Set)) {
				throw new TypeError(
					`Expected all arguments to be Set instances, but argument at index ${i} is not a Set`
				)
			}
		}

		// Pivot on the smallest set (breaking ties by earliest argument index).
		let smallestIndex = 0
		let smallestSize = inputs[0].size
		for (let i = 1; i < inputs.length; i++) {
			const size = inputs[i].size
			if (size < smallestSize) {
				smallestSize = size
				smallestIndex = i
			}
		}

		const result = new Set()
		if (smallestSize === 0) {
			return result
		}

		const smallest = inputs[smallestIndex]

		// Deduplicate identical Set references and check smaller remaining sets first.
		const seenRefs = new Set([smallest])
		const others = []
		for (let i = 0; i < inputs.length; i++) {
			const candidate = inputs[i]
			if (!seenRefs.has(candidate)) {
				seenRefs.add(candidate)
				others.push(candidate)
			}
		}
		others.sort((x, y) => x.size - y.size)

		for (const value of smallest) {
			let inAll = true
			for (let i = 0; i < others.length; i++) {
				if (!others[i].has(value)) {
					inAll = false
					break
				}
			}
			if (inAll) {
				// SameValueZero normalization: ensure -0 is stored as +0.
				result.add(value === 0 ? 0 : value)
			}
		}

		return result
	}

	throw new TypeError(
		`Expected all arguments to be plain booleans or Set instances, but argument at index 0 has type ${typeof a}`
	)
}
