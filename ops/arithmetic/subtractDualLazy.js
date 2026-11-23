/**
 * @typedef {Object} Dual
 * @property {number} v - Primal value (finite number).
 * @property {number} d - Forward-mode derivative component (finite number).
 */

/**
 * @typedef {Object} SubtractDualLazyOptions
 * @property {boolean} [strictLength=true] - When both inputs are sequences, throw a RangeError
 *   if one sequence ends before the other. Set to `false` to stop lazily at the shorter sequence.
 */

/**
 * Validate that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Dual}
 */
function validateDual(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a dual number object { v, d }`)
	}
	const { v, d } = value
	if (typeof v !== 'number') {
		throw new TypeError(`${label}.v must be a number`)
	}
	if (typeof d !== 'number') {
		throw new TypeError(`${label}.d must be a number`)
	}
	if (!Number.isFinite(v)) {
		throw new RangeError(`${label}.v must be a finite number`)
	}
	if (!Number.isFinite(d)) {
		throw new RangeError(`${label}.d must be a finite number`)
	}
	return { v, d }
}

/**
 * Classify an operand as either a sequence (iterable object) or a single dual number.
 * Strings and other primitives are rejected.
 *
 * @param {unknown} input
 * @param {string} label
 * @returns {{ kind: 'iterable', value: Iterable<Dual> } | { kind: 'dual', value: Dual }}
 */
function classifyOperand(input, label) {
	if (typeof input !== 'object' || input === null) {
		throw new TypeError(`${label} must be a dual number { v, d } or an iterable of dual numbers`)
	}
	if (typeof input[Symbol.iterator] === 'function') {
		return { kind: 'iterable', value: input }
	}
	return { kind: 'dual', value: validateDual(input, label) }
}

/**
 * Compute exact dual-number subtraction `{ v: a.v - b.v, d: a.d - b.d }`,
 * normalizing `-0` to `0` and guarding against floating-point overflow.
 *
 * @param {Dual} a
 * @param {Dual} b
 * @returns {Dual}
 */
function subtractPair(a, b) {
	const v = a.v - b.v
	const d = a.d - b.d
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual subtraction overflowed to a non-finite number')
	}
	return {
		v: v === 0 ? 0 : v,
		d: d === 0 ? 0 : d
	}
}

/**
 * Generator that lazily subtracts two sequences of dual numbers element by element.
 *
 * @param {Iterable<Dual>} minuendSeq
 * @param {Iterable<Dual>} subtrahendSeq
 * @param {boolean} strictLength
 * @returns {Generator<Dual, void, void>}
 */
function* zipSubtract(minuendSeq, subtrahendSeq, strictLength) {
	const iterA = minuendSeq[Symbol.iterator]()
	const iterB = subtrahendSeq[Symbol.iterator]()
	let doneA = false
	let doneB = false
	let index = 0

	try {
		while (true) {
			const stepA = iterA.next()
			doneA = Boolean(stepA.done)
			if (doneA) {
				if (strictLength) {
					const stepB = iterB.next()
					doneB = Boolean(stepB.done)
					if (!doneB) {
						throw new RangeError('Input sequences have different lengths: subtrahend is longer than minuend')
					}
				}
				return
			}

			const stepB = iterB.next()
			doneB = Boolean(stepB.done)
			if (doneB) {
				if (strictLength) {
					throw new RangeError('Input sequences have different lengths: minuend is longer than subtrahend')
				}
				return
			}

			const dualA = validateDual(stepA.value, `minuend[${index}]`)
			const dualB = validateDual(stepB.value, `subtrahend[${index}]`)
			yield subtractPair(dualA, dualB)
			index += 1
		}
	} finally {
		if (!doneA && typeof iterA.return === 'function') {
			iterA.return()
		}
		if (!doneB && typeof iterB.return === 'function') {
			iterB.return()
		}
	}
}

/**
 * Generator that lazily subtracts a constant dual number from each element of a sequence.
 *
 * @param {Iterable<Dual>} minuendSeq
 * @param {Dual} subtrahendDual
 * @returns {Generator<Dual, void, void>}
 */
function* broadcastRightSubtract(minuendSeq, subtrahendDual) {
	const iterA = minuendSeq[Symbol.iterator]()
	let doneA = false
	let index = 0

	try {
		while (true) {
			const stepA = iterA.next()
			doneA = Boolean(stepA.done)
			if (doneA) {
				return
			}
			const dualA = validateDual(stepA.value, `minuend[${index}]`)
			yield subtractPair(dualA, subtrahendDual)
			index += 1
		}
	} finally {
		if (!doneA && typeof iterA.return === 'function') {
			iterA.return()
		}
	}
}

/**
 * Generator that lazily subtracts each element of a sequence from a constant dual number.
 *
 * @param {Dual} minuendDual
 * @param {Iterable<Dual>} subtrahendSeq
 * @returns {Generator<Dual, void, void>}
 */
function* broadcastLeftSubtract(minuendDual, subtrahendSeq) {
	const iterB = subtrahendSeq[Symbol.iterator]()
	let doneB = false
	let index = 0

	try {
		while (true) {
			const stepB = iterB.next()
			doneB = Boolean(stepB.done)
			if (doneB) {
				return
			}
			const dualB = validateDual(stepB.value, `subtrahend[${index}]`)
			yield subtractPair(minuendDual, dualB)
			index += 1
		}
	} finally {
		if (!doneB && typeof iterB.return === 'function') {
			iterB.return()
		}
	}
}

/**
 * Generator that yields the single difference of two scalar dual numbers.
 *
 * @param {Dual} minuendDual
 * @param {Dual} subtrahendDual
 * @returns {Generator<Dual, void, void>}
 */
function* scalarSubtract(minuendDual, subtrahendDual) {
	yield subtractPair(minuendDual, subtrahendDual)
}

/**
 * Lazily subtract dual numbers `{ v, d }` carrying a forward-mode derivative alongside the value.
 *
 * For two dual numbers `a = { v: a_v, d: a_d }` and `b = { v: b_v, d: b_d }`,
 * subtraction yields `{ v: a_v - b_v, d: a_d - b_d }`.
 *
 * Supports:
 * - Sequence minus sequence (consumed lazily in lockstep via a generator)
 * - Sequence minus single dual number (broadcasts the single dual lazily)
 * - Single dual number minus sequence (broadcasts the single dual lazily)
 * - Single dual number minus single dual number (yields a single dual number)
 *
 * Top-level arguments and scalar dual inputs are validated eagerly when called;
 * elements inside iterable inputs are pulled and validated lazily on demand, and
 * upstream iterators are closed via `return()` on early termination or error.
 *
 * @param {Dual | Iterable<Dual>} minuend - Left operand: a dual number `{ v, d }` or an iterable of dual numbers.
 * @param {Dual | Iterable<Dual>} subtrahend - Right operand: a dual number `{ v, d }` or an iterable of dual numbers.
 * @param {SubtractDualLazyOptions} [options={}] - Optional configuration.
 * @returns {Generator<Dual, void, void>} A lazy generator yielding `{ v, d }` dual-number differences.
 * @throws {TypeError} If arguments, options, or yielded elements have invalid types.
 * @throws {RangeError} If any component is non-finite, subtraction overflows, or sequence lengths mismatch when `strictLength` is `true`.
 */
export function subtractDualLazy(minuend, subtrahend, options = {}) {
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}
	const { strictLength = true } = options
	if (typeof strictLength !== 'boolean') {
		throw new TypeError('options.strictLength must be a boolean')
	}

	const left = classifyOperand(minuend, 'minuend')
	const right = classifyOperand(subtrahend, 'subtrahend')

	if (left.kind === 'iterable' && right.kind === 'iterable') {
		return zipSubtract(left.value, right.value, strictLength)
	}
	if (left.kind === 'iterable' && right.kind === 'dual') {
		return broadcastRightSubtract(left.value, right.value)
	}
	if (left.kind === 'dual' && right.kind === 'iterable') {
		return broadcastLeftSubtract(left.value, right.value)
	}
	return scalarSubtract(left.value, right.value)
}
