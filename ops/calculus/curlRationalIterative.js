/**
 * Computes the exact 3D curl of a 3D polynomial vector field at a rational 3D point
 * using a straightforward iterative implementation over exact BigInt rationals.
 *
 * For a vector field F = [Fx, Fy, Fz] evaluated at point = [x, y, z]:
 *   curl(F)(x, y, z) = [
 *     ∂Fz/∂y - ∂Fy/∂z,
 *     ∂Fx/∂z - ∂Fz/∂x,
 *     ∂Fy/∂x - ∂Fx/∂y
 *   ]
 *
 * Each component of `vectorField` is an array of 3-variable polynomial terms of the form:
 *   `{ coeff: { num: BigInt, den: BigInt }, powers: [px, py, pz] }`
 * where `px, py, pz` are non-negative safe integers.
 *
 * All returned rational values are normalized to lowest terms with `den > 0n`
 * (and `{ num: 0n, den: 1n }` for zero).
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 * @typedef {{ coeff: Rational, powers: [number, number, number] }} PolyTerm3D
 *
 * @param {[PolyTerm3D[], PolyTerm3D[], PolyTerm3D[]]} vectorField - 3D polynomial vector field [Fx, Fy, Fz].
 * @param {[Rational, Rational, Rational]} point - 3D evaluation point [x, y, z] with exact rational coordinates.
 * @returns {[Rational, Rational, Rational]} Exact curl vector [cx, cy, cz] in lowest terms.
 * @throws {TypeError} If inputs have invalid types or shapes.
 * @throws {RangeError} If dimensions are not 3, denominators are zero, or powers are invalid.
 */
export function curlRationalIterative(vectorField, point) {
	const validatedField = validateVectorField(vectorField)
	const validatedPoint = validatePoint(point)

	const [fx, fy, fz] = validatedField

	const dFzDy = evalPartialDerivative(fz, 1, validatedPoint)
	const dFyDz = evalPartialDerivative(fy, 2, validatedPoint)
	const dFxDz = evalPartialDerivative(fx, 2, validatedPoint)
	const dFzDx = evalPartialDerivative(fz, 0, validatedPoint)
	const dFyDx = evalPartialDerivative(fy, 0, validatedPoint)
	const dFxDy = evalPartialDerivative(fx, 1, validatedPoint)

	const cx = subRational(dFzDy, dFyDz)
	const cy = subRational(dFxDz, dFzDx)
	const cz = subRational(dFyDx, dFxDy)

	return [cx, cy, cz]
}

/**
 * Computes the greatest common divisor of two BigInt values iteratively.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative GCD.
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
 * Normalizes a rational (num / den) to lowest terms with den > 0n, and 0n / 1n for zero.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
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
 * Validates and normalizes an input rational object.
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
		throw new TypeError(`${label} must have BigInt num and den fields`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must be non-zero`)
	}
	return normalizeRational(num, den)
}

/**
 * Validates a 3D evaluation point of exact rationals.
 *
 * @param {unknown} point
 * @returns {[{ num: bigint, den: bigint }, { num: bigint, den: bigint }, { num: bigint, den: bigint }]}
 */
function validatePoint(point) {
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of 3 rationals')
	}
	if (point.length !== 3) {
		throw new RangeError(`point must have length 3, got ${point.length}`)
	}
	return [
		validateRational(point[0], 'point[0]'),
		validateRational(point[1], 'point[1]'),
		validateRational(point[2], 'point[2]'),
	]
}

/**
 * Validates a 3D polynomial vector field [Fx, Fy, Fz].
 *
 * @param {unknown} vectorField
 * @returns {Array<Array<{ coeff: { num: bigint, den: bigint }, powers: [number, number, number] }>>}
 */
function validateVectorField(vectorField) {
	if (!Array.isArray(vectorField)) {
		throw new TypeError('vectorField must be an array of 3 polynomial components')
	}
	if (vectorField.length !== 3) {
		throw new RangeError(`vectorField must have length 3, got ${vectorField.length}`)
	}

	const normalizedField = new Array(3)
	for (let c = 0; c < 3; c++) {
		const component = vectorField[c]
		if (!Array.isArray(component)) {
			throw new TypeError(`vectorField[${c}] must be an array of polynomial terms`)
		}
		const normalizedTerms = new Array(component.length)
		for (let t = 0; t < component.length; t++) {
			const term = component[t]
			const termLabel = `vectorField[${c}][${t}]`
			if (term === null || typeof term !== 'object' || Array.isArray(term)) {
				throw new TypeError(`${termLabel} must be an object { coeff, powers }`)
			}
			const coeff = validateRational(term.coeff, `${termLabel}.coeff`)
			if (!Array.isArray(term.powers)) {
				throw new TypeError(`${termLabel}.powers must be an array of 3 non-negative integers`)
			}
			if (term.powers.length !== 3) {
				throw new RangeError(`${termLabel}.powers must have length 3, got ${term.powers.length}`)
			}
			const powers = new Array(3)
			for (let axis = 0; axis < 3; axis++) {
				const p = term.powers[axis]
				if (typeof p !== 'number') {
					throw new TypeError(`${termLabel}.powers[${axis}] must be a number`)
				}
				if (!Number.isSafeInteger(p) || p < 0) {
					throw new RangeError(
						`${termLabel}.powers[${axis}] must be a non-negative safe integer`,
					)
				}
				powers[axis] = p
			}
			normalizedTerms[t] = { coeff, powers }
		}
		normalizedField[c] = normalizedTerms
	}
	return normalizedField
}

/**
 * Raises a BigInt base to a non-negative safe integer exponent iteratively.
 *
 * @param {bigint} base
 * @param {number} exp
 * @returns {bigint}
 */
function powBigInt(base, exp) {
	let result = 1n
	let b = base
	let e = BigInt(exp)
	while (e > 0n) {
		if ((e & 1n) === 1n) {
			result *= b
		}
		e >>= 1n
		if (e > 0n) {
			b *= b
		}
	}
	return result
}

/**
 * Raises a normalized rational to a non-negative integer exponent.
 * Uses the algebraic convention 0^0 = 1 for polynomial evaluation.
 *
 * @param {{ num: bigint, den: bigint }} r
 * @param {number} exp
 * @returns {{ num: bigint, den: bigint }}
 */
function powRational(r, exp) {
	if (exp === 0) {
		return { num: 1n, den: 1n }
	}
	if (r.num === 0n) {
		return { num: 0n, den: 1n }
	}
	return {
		num: powBigInt(r.num, exp),
		den: powBigInt(r.den, exp),
	}
}

/**
 * Multiplies two normalized rationals and returns the normalized product.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	return normalizeRational(a.num * b.num, a.den * b.den)
}

/**
 * Adds two normalized rationals and returns the normalized sum.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
	if (a.num === 0n) {
		return b
	}
	if (b.num === 0n) {
		return a
	}
	return normalizeRational(a.num * b.den + b.num * a.den, a.den * b.den)
}

/**
 * Subtracts normalized rational b from a and returns the normalized difference.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function subRational(a, b) {
	if (b.num === 0n) {
		return a
	}
	if (a.num === 0n) {
		return { num: -b.num, den: b.den }
	}
	return normalizeRational(a.num * b.den - b.num * a.den, a.den * b.den)
}

/**
 * Iteratively evaluates the partial derivative ∂P/∂(varIdx) of a 3-variable polynomial
 * at a normalized 3D rational point.
 *
 * @param {Array<{ coeff: { num: bigint, den: bigint }, powers: [number, number, number] }>} terms
 * @param {0 | 1 | 2} varIdx - 0 for x, 1 for y, 2 for z.
 * @param {[{ num: bigint, den: bigint }, { num: bigint, den: bigint }, { num: bigint, den: bigint }]} point
 * @returns {{ num: bigint, den: bigint }}
 */
function evalPartialDerivative(terms, varIdx, point) {
	let sum = { num: 0n, den: 1n }

	for (let i = 0; i < terms.length; i++) {
		const term = terms[i]
		const diffPower = term.powers[varIdx]
		if (diffPower === 0 || term.coeff.num === 0n) {
			continue
		}

		// Differentiated coefficient: coeff * diffPower
		let termValue = normalizeRational(term.coeff.num * BigInt(diffPower), term.coeff.den)

		// Multiply by x^q0 * y^q1 * z^q2 where q[varIdx] = diffPower - 1
		let zeroFactor = false
		for (let axis = 0; axis < 3; axis++) {
			const q = axis === varIdx ? diffPower - 1 : term.powers[axis]
			if (q === 0) {
				continue
			}
			if (point[axis].num === 0n) {
				zeroFactor = true
				break
			}
			termValue = mulRational(termValue, powRational(point[axis], q))
		}

		if (!zeroFactor) {
			sum = addRational(sum, termValue)
		}
	}

	return sum
}
