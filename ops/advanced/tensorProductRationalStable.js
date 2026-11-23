/**
 * Exact rational tensor product with GCD content scaling and cross-cancellation.
 *
 * Represents exact rational numbers as `{ num: BigInt, den: BigInt }` in
 * canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`, and zero
 * uniquely represented as `{ num: 0n, den: 1n }`).
 *
 * Robustness strategy:
 * - Factors out exact numerator/denominator GCD scales (`content`) from each
 *   input tensor in O(|A| + |B|) before computing the O(|A| * |B|) product,
 *   preventing intermediate BigInt expression swell and cancelling extreme
 *   common or reciprocal scale factors up front.
 * - Uses cross-cancellation before every rational multiplication so reduced
 *   operands produce canonical lowest-terms results without double-width GCDs.
 * - Uses an iterative Euclidean GCD to avoid recursion depth limits on
 *   arbitrarily large BigInt values.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 * @typedef {Rational | RationalTensor[]} RationalTensor
 * @typedef {{ mode?: 'tensor' | 'kronecker' }} TensorProductOptions
 */

/**
 * Computes the non-negative greatest common divisor of two BigInts using
 * an iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function bigintGcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Validates and normalizes an input rational `{ num: bigint, den: bigint }`
 * into a fresh canonical lowest-terms rational with `den > 0n`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function normalizeRational(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: BigInt, den: BigInt }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have BigInt 'num' and 'den' properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must be non-zero`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const sign = den < 0n ? -1n : 1n
	const signedNum = sign * num
	const absDen = sign * den
	const g = bigintGcd(signedNum, absDen)
	return { num: signedNum / g, den: absDen / g }
}

/**
 * Multiplies two already-reduced canonical rationals using cross-cancellation
 * so intermediate products remain minimal and the result is guaranteed to be
 * in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`).
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function multiplyReduced(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = bigintGcd(a.num, b.den)
	const g2 = bigintGcd(b.num, a.den)
	const num = (a.num / g1) * (b.num / g2)
	const den = (a.den / g2) * (b.den / g1)
	return { num, den }
}

/**
 * Checks whether two shape arrays are identical.
 *
 * @param {number[]} s1
 * @param {number[]} s2
 * @returns {boolean}
 */
function shapesEqual(s1, s2) {
	if (s1.length !== s2.length) return false
	for (let i = 0; i < s1.length; i++) {
		if (s1[i] !== s2[i]) return false
	}
	return true
}

/**
 * Recursively validates a rectangular rational tensor, detects sparse arrays
 * and circular references, normalizes all entries to canonical lowest terms,
 * and flattens entries in row-major order.
 *
 * @param {unknown} input
 * @param {string} label
 * @returns {{ shape: number[], data: Rational[] }}
 */
function parseTensor(input, label) {
	const data = []
	const visiting = new Set()

	function walk(node, path) {
		if (Array.isArray(node)) {
			if (visiting.has(node)) {
				throw new TypeError(`${path} contains a circular array reference`)
			}
			visiting.add(node)
			const len = node.length
			if (len === 0) {
				visiting.delete(node)
				return [0]
			}
			let expectedChildShape = null
			for (let i = 0; i < len; i++) {
				if (!Object.hasOwn(node, i)) {
					visiting.delete(node)
					throw new TypeError(`${path}[${i}] is a sparse array hole`)
				}
				const childShape = walk(node[i], `${path}[${i}]`)
				if (expectedChildShape === null) {
					expectedChildShape = childShape
				} else if (!shapesEqual(expectedChildShape, childShape)) {
					visiting.delete(node)
					throw new RangeError(
						`${label} must be a rectangular tensor: shape mismatch at ${path}[${i}]`
					)
				}
			}
			visiting.delete(node)
			return [len, ...expectedChildShape]
		}
		data.push(normalizeRational(node, path))
		return []
	}

	const shape = walk(input, label)
	return { shape, data }
}

/**
 * Factors out the exact numerator GCD and denominator GCD across all nonzero
 * entries of a canonical rational array. Because every entry is in lowest
 * terms, `gcd(numGcd, denGcd) === 1n` and every scaled entry remains in
 * canonical lowest terms with smaller or equal bit-lengths.
 *
 * @param {Rational[]} flat
 * @returns {{ isZero: boolean, scale: Rational, scaled: Rational[] }}
 */
function extractGcdScale(flat) {
	let numGcd = 0n
	let denGcd = 0n
	for (let i = 0; i < flat.length; i++) {
		const { num, den } = flat[i]
		if (num === 0n) continue
		const absNum = num < 0n ? -num : num
		numGcd = numGcd === 0n ? absNum : bigintGcd(numGcd, absNum)
		denGcd = denGcd === 0n ? den : bigintGcd(denGcd, den)
		if (numGcd === 1n && denGcd === 1n) {
			return { isZero: false, scale: { num: 1n, den: 1n }, scaled: flat }
		}
	}
	if (numGcd === 0n) {
		return { isZero: true, scale: { num: 0n, den: 1n }, scaled: flat }
	}
	const scaled = new Array(flat.length)
	for (let i = 0; i < flat.length; i++) {
		const { num, den } = flat[i]
		if (num === 0n) {
			scaled[i] = { num: 0n, den: 1n }
		} else {
			scaled[i] = { num: num / numGcd, den: den / denGcd }
		}
	}
	return { isZero: false, scale: { num: numGcd, den: denGcd }, scaled }
}

/**
 * Builds an empty nested array matching a shape containing at least one zero
 * dimension.
 *
 * @param {number[]} shape
 * @param {number} [depth=0]
 * @returns {RationalTensor}
 */
function buildEmptyTensor(shape, depth = 0) {
	const len = shape[depth]
	const arr = new Array(len)
	if (depth + 1 < shape.length) {
		for (let i = 0; i < len; i++) {
			arr[i] = buildEmptyTensor(shape, depth + 1)
		}
	}
	return arr
}

/**
 * Builds a nested tensor of the given shape filled with distinct canonical
 * `{ num: 0n, den: 1n }` rational entries.
 *
 * @param {number[]} shape
 * @param {number} [depth=0]
 * @returns {RationalTensor}
 */
function buildZeroTensor(shape, depth = 0) {
	if (shape.length === 0) {
		return { num: 0n, den: 1n }
	}
	const len = shape[depth]
	const arr = new Array(len)
	if (depth + 1 === shape.length) {
		for (let i = 0; i < len; i++) {
			arr[i] = { num: 0n, den: 1n }
		}
	} else {
		for (let i = 0; i < len; i++) {
			arr[i] = buildZeroTensor(shape, depth + 1)
		}
	}
	return arr
}

/**
 * Unflattens a row-major flat array of rationals into a nested array of the
 * specified shape.
 *
 * @param {Rational[]} flat
 * @param {number[]} shape
 * @returns {RationalTensor}
 */
function unflatten(flat, shape) {
	if (shape.length === 0) {
		return flat[0]
	}
	let offset = 0
	function build(depth) {
		const len = shape[depth]
		const arr = new Array(len)
		if (depth + 1 === shape.length) {
			for (let i = 0; i < len; i++) {
				arr[i] = flat[offset++]
			}
		} else {
			for (let i = 0; i < len; i++) {
				arr[i] = build(depth + 1)
			}
		}
		return arr
	}
	return build(0)
}

/**
 * Computes row-major strides for a non-empty shape.
 *
 * @param {number[]} shape
 * @returns {number[]}
 */
function computeStrides(shape) {
	const strides = new Array(shape.length)
	let stride = 1
	for (let k = shape.length - 1; k >= 0; k--) {
		strides[k] = stride
		stride *= shape[k]
	}
	return strides
}

/**
 * Computes the exact rational tensor product `a ⊗ b` over canonical rationals
 * `{ num: BigInt, den: BigInt }` in lowest terms.
 *
 * Supports arbitrary-rank rectangular tensors (rank-0 scalars, rank-1 vectors,
 * rank-2 matrices, and higher-order nested arrays).
 *
 * - Default mode (`'tensor'`): produces the general outer tensor product with
 *   shape `[...shape(a), ...shape(b)]`.
 * - Kronecker mode (`'kronecker'`): requires `a` and `b` to have the same rank
 *   and produces the Kronecker product with shape `[d_0*e_0, ..., d_{r-1}*e_{r-1}]`.
 *
 * @param {RationalTensor} a - Left rational scalar or rectangular tensor.
 * @param {RationalTensor} b - Right rational scalar or rectangular tensor.
 * @param {TensorProductOptions} [options] - Optional configuration (`{ mode: 'tensor' | 'kronecker' }`).
 * @returns {RationalTensor} Exact rational tensor product with all entries in canonical lowest terms.
 */
export function tensorProductRationalStable(a, b, options = {}) {
	if (
		options === null ||
		typeof options !== 'object' ||
		Array.isArray(options)
	) {
		throw new TypeError('options must be a plain object if provided')
	}
	const mode = options.mode === undefined ? 'tensor' : options.mode
	if (mode !== 'tensor' && mode !== 'kronecker') {
		throw new RangeError(`options.mode must be 'tensor' or 'kronecker', got ${String(mode)}`)
	}

	const parsedA = parseTensor(a, 'a')
	const parsedB = parseTensor(b, 'b')
	const { shape: shapeA, data: flatA } = parsedA
	const { shape: shapeB, data: flatB } = parsedB

	let outShape
	if (mode === 'tensor') {
		outShape = [...shapeA, ...shapeB]
	} else {
		if (shapeA.length !== shapeB.length) {
			throw new RangeError(
				`kronecker mode requires equal tensor ranks, got ${shapeA.length} and ${shapeB.length}`
			)
		}
		outShape = new Array(shapeA.length)
		for (let k = 0; k < shapeA.length; k++) {
			outShape[k] = shapeA[k] * shapeB[k]
		}
	}

	// Handle tensors containing an empty dimension.
	if (outShape.some((dim) => dim === 0)) {
		return buildEmptyTensor(outShape)
	}

	// Factor out common numerator/denominator GCD scales before multiplying.
	const scaledA = extractGcdScale(flatA)
	const scaledB = extractGcdScale(flatB)

	if (scaledA.isZero || scaledB.isZero) {
		return buildZeroTensor(outShape)
	}

	const combinedScale = multiplyReduced(scaledA.scale, scaledB.scale)
	const hasUnitScale = combinedScale.num === 1n && combinedScale.den === 1n

	const lenA = scaledA.scaled.length
	const lenB = scaledB.scaled.length
	const outFlat = new Array(lenA * lenB)

	if (mode === 'tensor' || outShape.length === 0) {
		let outIdx = 0
		for (let i = 0; i < lenA; i++) {
			const ai = scaledA.scaled[i]
			if (ai.num === 0n) {
				for (let j = 0; j < lenB; j++) {
					outFlat[outIdx++] = { num: 0n, den: 1n }
				}
				continue
			}
			for (let j = 0; j < lenB; j++) {
				const bj = scaledB.scaled[j]
				if (bj.num === 0n) {
					outFlat[outIdx++] = { num: 0n, den: 1n }
				} else {
					const prod = multiplyReduced(ai, bj)
					outFlat[outIdx++] = hasUnitScale ? prod : multiplyReduced(prod, combinedScale)
				}
			}
		}
	} else {
		// Kronecker product indexing for arbitrary rank r >= 1.
		const rank = outShape.length
		const outStrides = computeStrides(outShape)
		const relOffsetsB = new Array(lenB)
		const idxB = new Array(rank).fill(0)

		for (let j = 0; j < lenB; j++) {
			let rel = 0
			for (let k = 0; k < rank; k++) {
				rel += idxB[k] * outStrides[k]
			}
			relOffsetsB[j] = rel
			for (let k = rank - 1; k >= 0; k--) {
				idxB[k]++
				if (idxB[k] < shapeB[k]) break
				idxB[k] = 0
			}
		}

		const idxA = new Array(rank).fill(0)
		for (let i = 0; i < lenA; i++) {
			let baseOut = 0
			for (let k = 0; k < rank; k++) {
				baseOut += idxA[k] * shapeB[k] * outStrides[k]
			}
			const ai = scaledA.scaled[i]
			if (ai.num === 0n) {
				for (let j = 0; j < lenB; j++) {
					outFlat[baseOut + relOffsetsB[j]] = { num: 0n, den: 1n }
				}
			} else {
				for (let j = 0; j < lenB; j++) {
					const bj = scaledB.scaled[j]
					if (bj.num === 0n) {
						outFlat[baseOut + relOffsetsB[j]] = { num: 0n, den: 1n }
					} else {
						const prod = multiplyReduced(ai, bj)
						outFlat[baseOut + relOffsetsB[j]] = hasUnitScale
							? prod
							: multiplyReduced(prod, combinedScale)
					}
				}
			}
			for (let k = rank - 1; k >= 0; k--) {
				idxA[k]++
				if (idxA[k] < shapeA[k]) break
				idxA[k] = 0
			}
		}
	}

	return unflatten(outFlat, outShape)
}
