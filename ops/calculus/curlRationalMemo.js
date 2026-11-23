/**
 * Exact 3D curl of a polynomial vector field over exact rationals
 * `{ num: BigInt, den: BigInt }` in lowest terms, using a Levi-Civita
 * partial-derivative dispatch table, precomputed power tables, and
 * canonical memoization caches.
 *
 * For F(x, y, z) = (Fx, Fy, Fz):
 *   curl(F) = (dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy)
 *
 * Each component polynomial is an array of monomials of the form:
 *   `{ coeff: { num: BigInt, den: BigInt }, powers: [px, py, pz] }`
 * where `px, py, pz` are non-negative safe integers.
 *
 * @module ops/calculus/curlRationalMemo
 */

/**
 * Levi-Civita dispatch table encoding the nonzero entries of epsilon_{i,j,k}:
 *   curl(F)_i = sum_{(comp, axis, sign) in CURL_DISPATCH_TABLE[i]} sign * d(F_comp)/d(x_axis)
 *
 * @type {ReadonlyArray<ReadonlyArray<Readonly<{ comp: number, axis: number, sign: bigint }>>>}
 */
const CURL_DISPATCH_TABLE = Object.freeze([
	Object.freeze([
		Object.freeze({ comp: 2, axis: 1, sign: 1n }),  // +dFz/dy
		Object.freeze({ comp: 1, axis: 2, sign: -1n }), // -dFy/dz
	]),
	Object.freeze([
		Object.freeze({ comp: 0, axis: 2, sign: 1n }),  // +dFx/dz
		Object.freeze({ comp: 2, axis: 0, sign: -1n }), // -dFz/dx
	]),
	Object.freeze([
		Object.freeze({ comp: 1, axis: 0, sign: 1n }),  // +dFy/dx
		Object.freeze({ comp: 0, axis: 1, sign: -1n }), // -dFx/dy
	]),
])

const ZERO_RATIONAL = Object.freeze({ num: 0n, den: 1n })
const ONE_RATIONAL = Object.freeze({ num: 1n, den: 1n })

const MAX_CACHE_ENTRIES = 4096

/**
 * Memoization cache mapping canonical `(polyKey|axis)` to differentiated
 * canonical monomial arrays.
 *
 * @type {Map<string, ReadonlyArray<Readonly<{ coeff: { num: bigint, den: bigint }, powers: readonly [number, number, number] }>>>}
 */
const partialDerivativeCache = new Map()

/**
 * Memoization cache mapping canonical `(fieldKey||pointKey)` to frozen
 * reduced 3-component curl vectors.
 *
 * @type {Map<string, readonly [Readonly<{ num: bigint, den: bigint }>, Readonly<{ num: bigint, den: bigint }>, Readonly<{ num: bigint, den: bigint }>]>}
 */
const curlResultCache = new Map()

/**
 * Compute greatest common divisor of two BigInts (non-negative result).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
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
 * Reduce a rational `(num, den)` to canonical lowest terms with `den > 0n`.
 * Zero is always represented as `{ num: 0n, den: 1n }`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function reduceRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be zero')
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
 * Validate and normalize an input rational `{ num: BigInt, den: BigInt }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ num: bigint, den: bigint }}
 */
function validateRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: BigInt, den: BigInt }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have BigInt num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must not be zero`)
	}
	return reduceRational(num, den)
}

/**
 * Add two reduced rationals and return a reduced rational.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
	if (a.num === 0n) return { num: b.num, den: b.den }
	if (b.num === 0n) return { num: a.num, den: a.den }
	if (a.den === b.den) {
		return reduceRational(a.num + b.num, a.den)
	}
	return reduceRational(a.num * b.den + b.num * a.den, a.den * b.den)
}

/**
 * Multiply two reduced rationals and return a reduced rational.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	// Cross-cancel before multiplying to keep intermediate BigInts small.
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}

/**
 * Scale a reduced rational by a BigInt integer factor.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {bigint} factor
 * @returns {{ num: bigint, den: bigint }}
 */
function scaleRational(a, factor) {
	if (a.num === 0n || factor === 0n) {
		return { num: 0n, den: 1n }
	}
	if (factor === 1n) {
		return { num: a.num, den: a.den }
	}
	if (factor === -1n) {
		return { num: -a.num, den: a.den }
	}
	const g = gcdBigInt(factor, a.den)
	return {
		num: a.num * (factor / g),
		den: a.den / g,
	}
}

/**
 * Insert into a bounded LRU-like Map cache.
 *
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @param {V} value
 */
function cacheSet(cache, key, value) {
	if (cache.has(key)) {
		cache.delete(key)
	} else if (cache.size >= MAX_CACHE_ENTRIES) {
		const oldestKey = cache.keys().next().value
		cache.delete(oldestKey)
	}
	cache.set(key, value)
}

/**
 * Read from a bounded LRU-like Map cache, refreshing recency on hit.
 *
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @returns {V | undefined}
 */
function cacheGet(cache, key) {
	if (!cache.has(key)) {
		return undefined
	}
	const value = cache.get(key)
	cache.delete(key)
	cache.set(key, value)
	return value
}

/**
 * Validate and canonicalize a single component polynomial by combining
 * like monomials, removing zero terms, and sorting lexicographically by powers.
 *
 * @param {unknown} poly
 * @param {number} compIndex
 * @returns {{ terms: ReadonlyArray<{ coeff: { num: bigint, den: bigint }, powers: readonly [number, number, number] }>, key: string }}
 */
function canonicalizePolynomial(poly, compIndex) {
	if (!Array.isArray(poly)) {
		throw new TypeError(`field[${compIndex}] must be an array of monomials`)
	}

	/** @type {Map<string, { coeff: { num: bigint, den: bigint }, powers: [number, number, number] }>} */
	const combined = new Map()

	for (let i = 0; i < poly.length; i++) {
		const term = poly[i]
		if (term === null || typeof term !== 'object' || Array.isArray(term)) {
			throw new TypeError(`field[${compIndex}][${i}] must be a monomial object { coeff, powers }`)
		}
		const coeff = validateRational(term.coeff, `field[${compIndex}][${i}].coeff`)

		if (!Array.isArray(term.powers)) {
			throw new TypeError(`field[${compIndex}][${i}].powers must be a 3-element array of non-negative integers`)
		}
		if (term.powers.length !== 3) {
			throw new RangeError(`field[${compIndex}][${i}].powers must have length 3 (got ${term.powers.length})`)
		}

		const px = term.powers[0]
		const py = term.powers[1]
		const pz = term.powers[2]
		for (let axis = 0; axis < 3; axis++) {
			const p = term.powers[axis]
			if (typeof p !== 'number') {
				throw new TypeError(`field[${compIndex}][${i}].powers[${axis}] must be a non-negative safe integer`)
			}
			if (!Number.isInteger(p) || !Number.isSafeInteger(p) || p < 0) {
				throw new RangeError(`field[${compIndex}][${i}].powers[${axis}] must be a non-negative safe integer`)
			}
		}

		if (coeff.num === 0n) {
			continue
		}

		const powerKey = `${px},${py},${pz}`
		const existing = combined.get(powerKey)
		if (existing) {
			existing.coeff = addRational(existing.coeff, coeff)
		} else {
			combined.set(powerKey, { coeff, powers: [px, py, pz] })
		}
	}

	const terms = []
	for (const entry of combined.values()) {
		if (entry.coeff.num !== 0n) {
			terms.push(
				Object.freeze({
					coeff: Object.freeze({ num: entry.coeff.num, den: entry.coeff.den }),
					powers: Object.freeze([entry.powers[0], entry.powers[1], entry.powers[2]]),
				}),
			)
		}
	}

	terms.sort((a, b) => {
		if (a.powers[0] !== b.powers[0]) return a.powers[0] - b.powers[0]
		if (a.powers[1] !== b.powers[1]) return a.powers[1] - b.powers[1]
		return a.powers[2] - b.powers[2]
	})

	let key = ''
	for (let i = 0; i < terms.length; i++) {
		const t = terms[i]
		if (i > 0) key += ';'
		key += `${t.coeff.num}/${t.coeff.den}@${t.powers[0]},${t.powers[1]},${t.powers[2]}`
	}

	return { terms: Object.freeze(terms), key }
}

/**
 * Compute (and memoize) the symbolic partial derivative of a canonical
 * component polynomial with respect to the given coordinate axis (0=x, 1=y, 2=z).
 *
 * @param {{ terms: ReadonlyArray<{ coeff: { num: bigint, den: bigint }, powers: readonly [number, number, number] }>, key: string }} canonicalPoly
 * @param {number} axis
 * @returns {ReadonlyArray<Readonly<{ coeff: { num: bigint, den: bigint }, powers: readonly [number, number, number] }>>}
 */
function getPartialDerivative(canonicalPoly, axis) {
	const cacheKey = `${canonicalPoly.key}|${axis}`
	const cached = cacheGet(partialDerivativeCache, cacheKey)
	if (cached !== undefined) {
		return cached
	}

	const derived = []
	const terms = canonicalPoly.terms
	for (let i = 0; i < terms.length; i++) {
		const term = terms[i]
		const exp = term.powers[axis]
		if (exp === 0) {
			continue
		}
		const newCoeff = scaleRational(term.coeff, BigInt(exp))
		const nextPowers = [term.powers[0], term.powers[1], term.powers[2]]
		nextPowers[axis] = exp - 1
		derived.push(
			Object.freeze({
				coeff: Object.freeze(newCoeff),
				powers: Object.freeze(nextPowers),
			}),
		)
	}

	const frozen = Object.freeze(derived)
	cacheSet(partialDerivativeCache, cacheKey, frozen)
	return frozen
}

/**
 * Precompute exact reduced power tables `[coord^0, coord^1, ..., coord^maxExp]`
 * for a single reduced coordinate rational.
 *
 * Since `gcd(|num|, den) === 1`, `gcd(|num|^k, den^k) === 1` for every `k >= 0`,
 * so each entry is already in lowest terms without additional gcd work.
 *
 * @param {{ num: bigint, den: bigint }} coord
 * @param {number} maxExp
 * @returns {Array<{ num: bigint, den: bigint }>}
 */
function buildPowerTable(coord, maxExp) {
	const table = new Array(maxExp + 1)
	table[0] = ONE_RATIONAL
	if (maxExp === 0) {
		return table
	}
	if (coord.num === 0n) {
		for (let k = 1; k <= maxExp; k++) {
			table[k] = ZERO_RATIONAL
		}
		return table
	}
	let curNum = 1n
	let curDen = 1n
	for (let k = 1; k <= maxExp; k++) {
		curNum *= coord.num
		curDen *= coord.den
		table[k] = { num: curNum, den: curDen }
	}
	return table
}

/**
 * Evaluate a polynomial using precomputed coordinate power tables.
 *
 * @param {ReadonlyArray<{ coeff: { num: bigint, den: bigint }, powers: readonly [number, number, number] }>} terms
 * @param {Array<Array<{ num: bigint, den: bigint }>>} powerTables
 * @returns {{ num: bigint, den: bigint }}
 */
function evaluateWithPowerTables(terms, powerTables) {
	let acc = ZERO_RATIONAL
	const pxTable = powerTables[0]
	const pyTable = powerTables[1]
	const pzTable = powerTables[2]

	for (let i = 0; i < terms.length; i++) {
		const term = terms[i]
		const [px, py, pz] = term.powers
		const vx = pxTable[px]
		if (vx.num === 0n) continue
		const vy = pyTable[py]
		if (vy.num === 0n) continue
		const vz = pzTable[pz]
		if (vz.num === 0n) continue

		const mono = mulRational(mulRational(term.coeff, vx), mulRational(vy, vz))
		acc = addRational(acc, mono)
	}

	return { num: acc.num, den: acc.den }
}

/**
 * Compute the exact 3D curl of a polynomial vector field over exact rationals
 * at a given 3D rational point, using a Levi-Civita dispatch table, precomputed
 * coordinate power tables, and canonical memoization caches.
 *
 * @param {Array<Array<{ coeff: { num: bigint, den: bigint }, powers: [number, number, number] }>>} field
 *   3-element array `[Fx, Fy, Fz]` of component polynomials, where each component
 *   is an array of monomials `{ coeff: { num: BigInt, den: BigInt }, powers: [px, py, pz] }`.
 * @param {Array<{ num: bigint, den: bigint }>} point
 *   3-element array `[x, y, z]` of exact rational coordinates `{ num: BigInt, den: BigInt }`.
 * @returns {[{ num: bigint, den: bigint }, { num: bigint, den: bigint }, { num: bigint, den: bigint }]}
 *   3-element array `[curlX, curlY, curlZ]` of reduced exact rationals in lowest terms
 *   with `den > 0n` and zero represented as `{ num: 0n, den: 1n }`.
 */
export function curlRationalMemo(field, point) {
	if (!Array.isArray(field)) {
		throw new TypeError('field must be a 3-element array of component polynomials [Fx, Fy, Fz]')
	}
	if (field.length !== 3) {
		throw new RangeError(`field must have dimension 3 (got ${field.length})`)
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be a 3-element array of rationals [x, y, z]')
	}
	if (point.length !== 3) {
		throw new RangeError(`point must have dimension 3 (got ${point.length})`)
	}

	const normalizedPoint = [
		validateRational(point[0], 'point[0]'),
		validateRational(point[1], 'point[1]'),
		validateRational(point[2], 'point[2]'),
	]

	const canonicalComponents = [
		canonicalizePolynomial(field[0], 0),
		canonicalizePolynomial(field[1], 1),
		canonicalizePolynomial(field[2], 2),
	]

	const fieldKey = `${canonicalComponents[0].key}#${canonicalComponents[1].key}#${canonicalComponents[2].key}`
	const pointKey = `${normalizedPoint[0].num}/${normalizedPoint[0].den},${normalizedPoint[1].num}/${normalizedPoint[1].den},${normalizedPoint[2].num}/${normalizedPoint[2].den}`
	const fullCacheKey = `${fieldKey}||${pointKey}`

	const cachedResult = cacheGet(curlResultCache, fullCacheKey)
	if (cachedResult !== undefined) {
		return [
			{ num: cachedResult[0].num, den: cachedResult[0].den },
			{ num: cachedResult[1].num, den: cachedResult[1].den },
			{ num: cachedResult[2].num, den: cachedResult[2].den },
		]
	}

	// Gather memoized symbolic partial derivatives required by the Levi-Civita table
	// and track the maximum exponent needed along each coordinate axis.
	const maxPowers = [0, 0, 0]
	const dispatchedPartials = new Array(3)

	for (let i = 0; i < 3; i++) {
		const rules = CURL_DISPATCH_TABLE[i]
		const entries = new Array(rules.length)
		for (let r = 0; r < rules.length; r++) {
			const rule = rules[r]
			const partialTerms = getPartialDerivative(canonicalComponents[rule.comp], rule.axis)
			for (let t = 0; t < partialTerms.length; t++) {
				const powers = partialTerms[t].powers
				if (powers[0] > maxPowers[0]) maxPowers[0] = powers[0]
				if (powers[1] > maxPowers[1]) maxPowers[1] = powers[1]
				if (powers[2] > maxPowers[2]) maxPowers[2] = powers[2]
			}
			entries[r] = { terms: partialTerms, sign: rule.sign }
		}
		dispatchedPartials[i] = entries
	}

	// Precompute exact power tables for x, y, z up to maxPowers.
	const powerTables = [
		buildPowerTable(normalizedPoint[0], maxPowers[0]),
		buildPowerTable(normalizedPoint[1], maxPowers[1]),
		buildPowerTable(normalizedPoint[2], maxPowers[2]),
	]

	// Evaluate each curl component from the Levi-Civita dispatch entries.
	const result = new Array(3)
	for (let i = 0; i < 3; i++) {
		let sum = ZERO_RATIONAL
		const entries = dispatchedPartials[i]
		for (let r = 0; r < entries.length; r++) {
			const val = evaluateWithPowerTables(entries[r].terms, powerTables)
			const signedVal = scaleRational(val, entries[r].sign)
			sum = addRational(sum, signedVal)
		}
		result[i] = { num: sum.num, den: sum.den }
	}

	const frozenResult = Object.freeze([
		Object.freeze({ num: result[0].num, den: result[0].den }),
		Object.freeze({ num: result[1].num, den: result[1].den }),
		Object.freeze({ num: result[2].num, den: result[2].den }),
	])
	cacheSet(curlResultCache, fullCacheKey, frozenResult)

	return result
}
