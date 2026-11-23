/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * Exact rational number represented in lowest terms with `den > 0n`
 * (and zero canonically represented as `{ num: 0n, den: 1n }`).
 */

/**
 * @typedef {(point: Rational[]) => Rational} ScalarComponentFn
 * A scalar component function F_i(x) mapping a point in Q^n to a Rational.
 */

/**
 * @typedef {(point: Rational[]) => Iterable<Rational>} VectorFieldFn
 * A vector-valued function F(x) mapping a point in Q^n to an iterable of n Rationals.
 */

const ZERO = Object.freeze({ num: 0n, den: 1n })
const TWO = Object.freeze({ num: 2n, den: 1n })
const DEFAULT_STEP = Object.freeze({ num: 1n, den: 1000000n })

/**
 * Iterative Euclidean GCD over BigInt, always returning a non-negative BigInt.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Construct a canonical exact rational `{ num, den }` in lowest terms with `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function makeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must be non-zero')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validate and normalize a rational-like object `{ num: bigint, den: bigint }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function normalizeRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object of the form { num: bigint, den: bigint }`)
	}
	const { num, den } = /** @type {{ num?: unknown, den?: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have bigint num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must be non-zero`)
	}
	return makeRational(num, den)
}

/**
 * Validate and normalize a strictly positive step size rational.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function normalizeStepRational(value, label) {
	const r = normalizeRational(value, label)
	if (r.num <= 0n) {
		throw new RangeError(`${label} must be strictly positive`)
	}
	return r
}

/**
 * Exact rational addition returning a reduced rational.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratAdd(a, b) {
	const g = gcdBigInt(a.den, b.den)
	const aDenDiv = a.den / g
	const bDenDiv = b.den / g
	return makeRational(a.num * bDenDiv + b.num * aDenDiv, aDenDiv * b.den)
}

/**
 * Exact rational subtraction returning a reduced rational.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratSub(a, b) {
	const g = gcdBigInt(a.den, b.den)
	const aDenDiv = a.den / g
	const bDenDiv = b.den / g
	return makeRational(a.num * bDenDiv - b.num * aDenDiv, aDenDiv * b.den)
}

/**
 * Exact rational multiplication with cross-cancellation returning a reduced rational.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratMul(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	return makeRational((a.num / g1) * (b.num / g2), (a.den / g2) * (b.den / g1))
}

/**
 * Exact rational division returning a reduced rational.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratDiv(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero')
	}
	return ratMul(a, { num: b.den, den: b.num })
}

/**
 * Check whether a value is a non-null iterable object (excluding strings/primitives).
 *
 * @param {unknown} value
 * @returns {value is Iterable<unknown>}
 */
function isIterableObject(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		typeof /** @type {Record<symbol, unknown>} */ (value)[Symbol.iterator] === 'function'
	)
}

/**
 * Generator that lazily validates and yields normalized rational coordinates from a point iterable.
 *
 * @param {Iterable<Rational>} point
 * @returns {Generator<Rational, void, undefined>}
 */
function* normalizePointStream(point) {
	let idx = 0
	for (const coord of point) {
		yield normalizeRational(coord, `point[${idx}]`)
		idx += 1
	}
}

/**
 * Build a fresh coordinate vector with coordinate `index` perturbed by `delta`.
 *
 * @param {Rational[]} coords
 * @param {number} index
 * @param {Rational} delta
 * @param {boolean} add
 * @returns {Rational[]}
 */
function perturbCoords(coords, index, delta, add) {
	const out = new Array(coords.length)
	for (let k = 0; k < coords.length; k += 1) {
		const c = coords[k]
		out[k] = k === index ? (add ? ratAdd(c, delta) : ratSub(c, delta)) : { num: c.num, den: c.den }
	}
	return out
}

/**
 * Lazily extract and validate the rational at `index` from a vector-valued field output.
 * Stops iteration immediately once `index` is reached and closes the iterator cleanly.
 *
 * @param {unknown} vec
 * @param {number} index
 * @param {number} expectedDim
 * @param {string} label
 * @returns {Rational}
 */
function extractComponentAt(vec, index, expectedDim, label) {
	if (!isIterableObject(vec)) {
		throw new TypeError(`${label} must return an iterable of rationals`)
	}
	if (Array.isArray(vec)) {
		if (vec.length !== expectedDim) {
			throw new RangeError(
				`${label} returned ${vec.length} component(s), expected ${expectedDim}`
			)
		}
		return normalizeRational(vec[index], `${label}[${index}]`)
	}
	const iter = vec[Symbol.iterator]()
	let done = false
	try {
		for (let k = 0; k <= index; k += 1) {
			const next = iter.next()
			if (next.done) {
				done = true
				throw new RangeError(
					`${label} yielded only ${k} component(s), expected at least ${index + 1}`
				)
			}
			if (k === index) {
				return normalizeRational(next.value, `${label}[${index}]`)
			}
		}
		/* c8 ignore next */
		throw new RangeError(`${label} missing component ${index}`)
	} finally {
		if (!done && typeof iter.return === 'function') {
			iter.return()
		}
	}
}

/**
 * Compute exact central difference quotient (fPlus - fMinus) / (2 * h).
 *
 * @param {Rational} fPlus
 * @param {Rational} fMinus
 * @param {Rational} h
 * @returns {Rational}
 */
function centralDifference(fPlus, fMinus, h) {
	return ratDiv(ratSub(fPlus, fMinus), ratMul(TWO, h))
}

/**
 * Generator that lazily consumes the vector field (and optional step iterable)
 * one dimension at a time, yielding exact rational partial derivatives ∂F_i/∂x_i(x).
 *
 * @param {Iterable<ScalarComponentFn> | VectorFieldFn} field
 * @param {Rational[]} coords
 * @param {Rational | Iterable<Rational>} step
 * @returns {Generator<Rational, void, undefined>}
 */
function* partialDerivativeStream(field, coords, step) {
	const dim = coords.length
	const isStepIterable = isIterableObject(step)
	const scalarStep = isStepIterable ? null : normalizeStepRational(step, 'step')
	const stepIter = isStepIterable ? step[Symbol.iterator]() : null
	let stepDone = !isStepIterable

	const isVectorFn = typeof field === 'function'
	const fieldIter = isVectorFn ? null : field[Symbol.iterator]()
	let fieldDone = isVectorFn

	try {
		for (let i = 0; i < dim; i += 1) {
			let componentFn = null
			if (!isVectorFn) {
				const fNext = /** @type {Iterator<ScalarComponentFn>} */ (fieldIter).next()
				if (fNext.done) {
					fieldDone = true
					throw new RangeError(
						`field yielded ${i} component function(s), expected ${dim}`
					)
				}
				if (typeof fNext.value !== 'function') {
					throw new TypeError(`field[${i}] must be a function`)
				}
				componentFn = fNext.value
			}

			let h
			if (isStepIterable) {
				const sNext = /** @type {Iterator<Rational>} */ (stepIter).next()
				if (sNext.done) {
					stepDone = true
					throw new RangeError(`step yielded ${i} value(s), expected ${dim}`)
				}
				h = normalizeStepRational(sNext.value, `step[${i}]`)
			} else {
				h = /** @type {Rational} */ (scalarStep)
			}

			const xPlus = perturbCoords(coords, i, h, true)
			const xMinus = perturbCoords(coords, i, h, false)

			let fPlus
			let fMinus
			if (isVectorFn) {
				const vf = /** @type {VectorFieldFn} */ (field)
				fPlus = extractComponentAt(vf(xPlus), i, dim, `field(x + h*e_${i})`)
				fMinus = extractComponentAt(vf(xMinus), i, dim, `field(x - h*e_${i})`)
			} else {
				const fn = /** @type {ScalarComponentFn} */ (componentFn)
				fPlus = normalizeRational(fn(xPlus), `field[${i}](x + h*e_${i})`)
				fMinus = normalizeRational(fn(xMinus), `field[${i}](x - h*e_${i})`)
			}

			yield centralDifference(fPlus, fMinus, h)
		}

		if (!isVectorFn) {
			const extraField = /** @type {Iterator<ScalarComponentFn>} */ (fieldIter).next()
			if (extraField.done) {
				fieldDone = true
			} else {
				throw new RangeError(`field yielded more than ${dim} component functions`)
			}
		}

		if (isStepIterable) {
			const extraStep = /** @type {Iterator<Rational>} */ (stepIter).next()
			if (extraStep.done) {
				stepDone = true
			} else {
				throw new RangeError(`step yielded more than ${dim} values`)
			}
		}
	} finally {
		if (!fieldDone && fieldIter && typeof fieldIter.return === 'function') {
			fieldIter.return()
		}
		if (!stepDone && stepIter && typeof stepIter.return === 'function') {
			stepIter.return()
		}
	}
}

/**
 * Generator that lazily folds a stream of exact rationals into running reduced sums.
 *
 * @param {Iterable<Rational>} terms
 * @returns {Generator<Rational, void, undefined>}
 */
function* runningRationalSumStream(terms) {
	let acc = { num: ZERO.num, den: ZERO.den }
	for (const term of terms) {
		acc = ratAdd(acc, term)
		yield acc
	}
}

/**
 * Compute the divergence ∇·F(x) = Σ_i ∂F_i/∂x_i(x) of an n-dimensional vector field
 * over exact rationals `{ num: bigint, den: bigint }` in lowest terms, using a
 * streaming/generator-based pipeline that lazily consumes iterable inputs.
 *
 * Each partial derivative ∂F_i/∂x_i(x) is evaluated via exact rational central finite
 * differences `(F_i(x + h_i e_i) - F_i(x - h_i e_i)) / (2 h_i)`, which is algebraically
 * exact for all polynomials of degree ≤ 2 and O(h^2) accurate for smooth rational fields
 * with zero floating-point cancellation error.
 *
 * Streaming/laziness guarantees:
 * - When `field` is an iterable of component functions, each `F_i` is pulled lazily one
 *   dimension at a time and never pre-materialized into an array.
 * - When `field` is a vector-valued function returning a non-array iterable, only the
 *   prefix `0..i` is consumed for dimension `i`, and the iterator is closed immediately.
 * - When `step` is an iterable of per-dimension step sizes, each `h_i` is pulled lazily
 *   in lockstep with dimension `i`.
 * - All active iterators are cleanly closed via `.return()` if an error occurs mid-stream.
 *
 * @param {Iterable<ScalarComponentFn> | VectorFieldFn} field
 *   Either an iterable of `n` scalar component functions `F_i(point) => Rational`, or a
 *   single vector-valued function `F(point) => Iterable<Rational>`.
 * @param {Iterable<Rational>} point
 *   Non-empty iterable of `n` exact rational coordinates `{ num: bigint, den: bigint }`.
 * @param {Rational | Iterable<Rational>} [step={ num: 1n, den: 1000000n }]
 *   Optional strictly positive rational step size `h`, or an iterable of `n` strictly
 *   positive rational step sizes `h_i` consumed lazily per dimension.
 * @returns {Rational} Exact rational divergence `{ num: bigint, den: bigint }` in lowest terms.
 * @throws {TypeError} If inputs or field outputs have invalid types.
 * @throws {RangeError} If `point` is empty, dimensions mismatch, denominators are zero, or step ≤ 0.
 */
export function divergenceRationalLazy(field, point, step = DEFAULT_STEP) {
	if (typeof field !== 'function' && !isIterableObject(field)) {
		throw new TypeError('field must be a function or an iterable of component functions')
	}
	if (!isIterableObject(point)) {
		throw new TypeError('point must be an iterable of rationals')
	}

	const coords = []
	for (const coord of normalizePointStream(point)) {
		coords.push(coord)
	}
	if (coords.length === 0) {
		throw new RangeError('point must contain at least one coordinate')
	}

	let result = { num: ZERO.num, den: ZERO.den }
	for (const runningSum of runningRationalSumStream(
		partialDerivativeStream(field, coords, step)
	)) {
		result = runningSum
	}
	return result
}
