/**
 * @fileoverview Numerically robust multiset OR (counting logic disjunction)
 * over `Map<value, count>`.
 */

const VALID_MODES = new Set(['max', 'sum', 'probabilistic'])
const VALID_OPTION_KEYS = new Set(['mode', 'tolerance'])

const LARGE_THRESHOLD = 2 ** 960
const LARGE_SCALE_DOWN = 2 ** -64
const LARGE_SCALE_UP = 2 ** 64

const SMALL_THRESHOLD = 2 ** -960
const SMALL_SCALE_UP = 2 ** 128
const SMALL_SCALE_DOWN = 2 ** -128

/**
 * Checks whether a value is a plain object (candidate options bag).
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
	if (typeof value !== 'object' || value === null) return false
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * Validates and normalizes options.
 * @param {Record<string, unknown>} options
 * @returns {{ mode: 'max' | 'sum' | 'probabilistic', tolerance: number }}
 */
function validateOptions(options) {
	for (const key of Object.keys(options)) {
		if (!VALID_OPTION_KEYS.has(key)) {
			throw new TypeError(`Unknown option "${key}"`)
		}
	}

	const mode = options.mode === undefined ? 'max' : options.mode
	if (typeof mode !== 'string') {
		throw new TypeError('options.mode must be a string')
	}
	if (!VALID_MODES.has(mode)) {
		throw new RangeError(
			`options.mode must be one of "max", "sum", or "probabilistic"; received "${mode}"`
		)
	}

	const tolerance = options.tolerance === undefined ? 0 : options.tolerance
	if (typeof tolerance !== 'number') {
		throw new TypeError('options.tolerance must be a number')
	}
	if (!Number.isFinite(tolerance) || tolerance < 0) {
		throw new RangeError('options.tolerance must be a finite non-negative number')
	}

	return {
		mode: /** @type {'max' | 'sum' | 'probabilistic'} */ (mode),
		tolerance: tolerance === 0 ? 0 : tolerance,
	}
}

/**
 * Validates a single multiset argument and all of its counts.
 * @template T
 * @param {unknown} input
 * @param {number} index
 * @param {'max' | 'sum' | 'probabilistic'} mode
 * @returns {Map<T, number>}
 */
function validateMultiset(input, index, mode) {
	if (!(input instanceof Map)) {
		throw new TypeError(`Argument at index ${index} must be a Map`)
	}

	for (const [key, count] of input) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`Multiset at index ${index} has non-numeric count for key ${String(key)}`
			)
		}
		if (!Number.isFinite(count) || count < 0) {
			throw new RangeError(
				`Multiset at index ${index} has invalid count ${count} for key ${String(key)}; counts must be finite and >= 0`
			)
		}
		if (mode === 'probabilistic' && count > 1) {
			throw new RangeError(
				`Multiset at index ${index} has count ${count} > 1 for key ${String(key)}; probabilistic mode requires counts in [0, 1]`
			)
		}
	}

	return input
}

/**
 * Shewchuk exact floating-point expansion summation (Python `math.fsum`
 * algorithm) with exact power-of-two scaling to prevent intermediate overflow
 * or subnormal underflow.
 *
 * Guarantees a correctly rounded (<= 0.5 ULP) sum independent of input order.
 *
 * @param {number[]} values Finite numbers of uniform sign (or mixed finite numbers).
 * @returns {number}
 */
function exactSum(values) {
	const len = values.length
	if (len === 0) return 0
	if (len === 1) return values[0] === 0 ? 0 : values[0]

	let maxAbs = 0
	for (let i = 0; i < len; i++) {
		const a = Math.abs(values[i])
		if (a > maxAbs) maxAbs = a
	}
	if (maxAbs === 0) return 0

	let scale = 1
	let unscale = 1
	if (maxAbs > LARGE_THRESHOLD) {
		scale = LARGE_SCALE_DOWN
		unscale = LARGE_SCALE_UP
	} else if (maxAbs < SMALL_THRESHOLD) {
		scale = SMALL_SCALE_UP
		unscale = SMALL_SCALE_DOWN
	}

	/** @type {number[]} */
	const partials = []

	for (let i = 0; i < len; i++) {
		let x = values[i] * scale
		if (x === 0) continue

		let j = 0
		for (let k = 0; k < partials.length; k++) {
			let y = partials[k]
			if (Math.abs(x) < Math.abs(y)) {
				const tmp = x
				x = y
				y = tmp
			}
			const hi = x + y
			const lo = y - (hi - x)
			if (lo !== 0) {
				partials[j++] = lo
			}
			x = hi
		}
		partials.length = j
		if (x !== 0) {
			partials.push(x)
		}
	}

	let n = partials.length
	let hi = 0
	if (n > 0) {
		hi = partials[--n]
		while (n > 0) {
			const x = hi
			const y = partials[--n]
			hi = x + y
			const lo = y - (hi - x)
			if (lo !== 0) {
				if (
					n > 0 &&
					((lo < 0 && partials[n - 1] < 0) || (lo > 0 && partials[n - 1] > 0))
				) {
					const y2 = lo * 2
					const x2 = hi + y2
					if (y2 === x2 - hi) {
						hi = x2
					}
				}
				break
			}
		}
	}

	const result = hi * unscale
	if (!Number.isFinite(result)) {
		throw new RangeError('Multiset count overflow: sum exceeds Number.MAX_VALUE')
	}
	return result === 0 ? 0 : result
}

/**
 * Numerically stable probabilistic (noisy) OR over probabilities in [0, 1]:
 *   1 - prod_i (1 - p_i) = -expm1(sum_i log1p(-p_i))
 *
 * Uses `Math.log1p`, Shewchuk exact summation, and `Math.expm1` to avoid
 * catastrophic cancellation for small probabilities.
 *
 * @param {number[]} probs Values in (0, 1].
 * @returns {number}
 */
function probabilisticOr(probs) {
	if (probs.length === 0) return 0
	if (probs.length === 1) return probs[0]

	const logTerms = new Array(probs.length)
	for (let i = 0; i < probs.length; i++) {
		const p = probs[i]
		if (p === 1) return 1
		logTerms[i] = Math.log1p(-p)
	}

	const logComplement = exactSum(logTerms)
	const result = -Math.expm1(logComplement)
	if (result <= 0) return 0
	if (result >= 1) return 1
	return result
}

/**
 * Computes the logical OR (union) over two or more multisets represented as
 * `Map<value, count>`, using a numerically robust implementation.
 *
 * Supports three counting-logic disjunction semantics via `options.mode`:
 * - `'max'` (default): standard multiset union / lattice join,
 *   `count(x) = max_i m_i(x)`. Reduces to boolean set union on `{0, 1}` counts.
 * - `'sum'`: additive multiset union (bag sum), `count(x) = sum_i m_i(x)`,
 *   evaluated via Shewchuk's exact floating-point expansion summation with
 *   power-of-two scaling (order-independent, correctly rounded to <= 0.5 ULP,
 *   with explicit overflow detection).
 * - `'probabilistic'`: noisy-OR over fractional weights in `[0, 1]`,
 *   `count(x) = 1 - prod_i (1 - m_i(x))`, evaluated via `log1p`, exact
 *   summation, and `expm1` to avoid catastrophic cancellation near zero.
 *
 * Input maps are never mutated. Zero (and `-0`) counts, as well as counts
 * `<= options.tolerance`, are omitted from the returned canonical multiset.
 *
 * @template T
 * @param {Map<T, number>} a First multiset.
 * @param {Map<T, number>} b Second multiset.
 * @param {...(Map<T, number> | { mode?: 'max' | 'sum' | 'probabilistic', tolerance?: number })} rest
 *   Additional multisets and an optional trailing options object.
 * @returns {Map<T, number>} Canonical resulting multiset `Map<T, number>`.
 * @throws {TypeError} If fewer than two maps are provided, any operand is not a `Map`,
 *   any count is non-numeric, or options have invalid types/keys.
 * @throws {RangeError} If any count is negative/non-finite (or `> 1` in `'probabilistic'`
 *   mode), if `options.mode` or `options.tolerance` is out of range, or if a sum overflows.
 */
export function orMultisetStable(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError('orMultisetStable requires at least two Map arguments')
	}

	let optionsObj = {}
	let extraMaps = rest
	if (rest.length > 0 && isPlainObject(rest[rest.length - 1])) {
		optionsObj = /** @type {Record<string, unknown>} */ (rest[rest.length - 1])
		extraMaps = rest.slice(0, -1)
	}

	const { mode, tolerance } = validateOptions(optionsObj)

	/** @type {Map<T, number>[]} */
	const multisets = [
		validateMultiset(a, 0, mode),
		validateMultiset(b, 1, mode),
	]
	for (let i = 0; i < extraMaps.length; i++) {
		multisets.push(validateMultiset(extraMaps[i], i + 2, mode))
	}

	/** @type {Map<T, number>} */
	const result = new Map()

	if (mode === 'max') {
		for (let i = 0; i < multisets.length; i++) {
			for (const [key, rawCount] of multisets[i]) {
				const count = rawCount === 0 ? 0 : rawCount
				if (count <= tolerance) continue
				const existing = result.get(key)
				if (existing === undefined || count > existing) {
					result.set(key, count)
				}
			}
		}
		return result
	}

	// Collect positive counts per key for 'sum' or 'probabilistic' modes
	/** @type {Map<T, number[]>} */
	const buckets = new Map()
	for (let i = 0; i < multisets.length; i++) {
		for (const [key, rawCount] of multisets[i]) {
			if (rawCount === 0) continue
			let list = buckets.get(key)
			if (list === undefined) {
				list = []
				buckets.set(key, list)
			}
			list.push(rawCount)
		}
	}

	for (const [key, counts] of buckets) {
		const combined =
			mode === 'sum' ? exactSum(counts) : probabilisticOr(counts)
		if (combined > tolerance) {
			result.set(key, combined === 0 ? 0 : combined)
		}
	}

	return result
}
