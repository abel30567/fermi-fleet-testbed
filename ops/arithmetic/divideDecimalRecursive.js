/**
 * Arbitrary-precision decimal string division using a recursive
 * divide-and-conquer implementation (Burnikel-Ziegler recursive division
 * paired with Karatsuba recursive multiplication over base-10^4 limbs).
 *
 * @module ops/arithmetic/divideDecimalRecursive
 */

const BASE = 10000
const LIMB_DIGITS = 4
const KARATSUBA_THRESHOLD = 16
const DECIMAL_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/

/**
 * Validates and parses a decimal string into sign, unsigned integer digit string,
 * and fractional scale such that value = sign * int(digits) * 10^(-scale).
 *
 * @param {string} value - The decimal string to parse.
 * @param {string} name - Parameter name for error messages.
 * @returns {{ sign: 1 | -1, digits: string, scale: number }}
 */
function parseDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`)
	}
	if (!DECIMAL_RE.test(value)) {
		throw new RangeError(`Invalid decimal string for ${name}: "${value}"`)
	}

	let sign = 1
	let body = value
	if (body[0] === '-') {
		sign = -1
		body = body.slice(1)
	} else if (body[0] === '+') {
		body = body.slice(1)
	}

	const dotIndex = body.indexOf('.')
	let rawDigits
	let scale
	if (dotIndex === -1) {
		rawDigits = body
		scale = 0
	} else {
		const intPart = body.slice(0, dotIndex)
		const fracPart = body.slice(dotIndex + 1)
		rawDigits = intPart + fracPart
		scale = fracPart.length
	}

	const stripped = rawDigits.replace(/^0+/, '')
	if (stripped.length === 0) {
		return { sign: 1, digits: '0', scale: 0 }
	}
	return { sign, digits: stripped, scale }
}

/**
 * Removes trailing zero limbs from a little-endian limb array.
 *
 * @param {number[]} limbs
 * @returns {number[]}
 */
function trimLimbs(limbs) {
	let end = limbs.length
	while (end > 0 && limbs[end - 1] === 0) {
		end--
	}
	return end === limbs.length ? limbs : limbs.slice(0, end)
}

/**
 * Converts an unsigned decimal digit string (no leading zeros, or "0")
 * into a little-endian base-10^4 limb array.
 *
 * @param {string} str
 * @returns {number[]}
 */
function decimalStringToLimbs(str) {
	if (str === '0') return []
	const limbs = []
	for (let i = str.length; i > 0; i -= LIMB_DIGITS) {
		const start = Math.max(0, i - LIMB_DIGITS)
		limbs.push(Number(str.slice(start, i)))
	}
	return trimLimbs(limbs)
}

/**
 * Converts a little-endian base-10^4 limb array back into a canonical
 * unsigned decimal digit string.
 *
 * @param {number[]} limbs
 * @returns {string}
 */
function limbsToDecimalString(limbs) {
	const trimmed = trimLimbs(limbs)
	if (trimmed.length === 0) return '0'
	const parts = new Array(trimmed.length)
	parts[0] = String(trimmed[trimmed.length - 1])
	for (let i = trimmed.length - 2, j = 1; i >= 0; i--, j++) {
		parts[j] = String(trimmed[i]).padStart(LIMB_DIGITS, '0')
	}
	return parts.join('')
}

/**
 * Compares two normalized little-endian limb arrays.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {-1 | 0 | 1}
 */
function cmpLimbs(a, b) {
	if (a.length !== b.length) return a.length < b.length ? -1 : 1
	for (let i = a.length - 1; i >= 0; i--) {
		if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
	}
	return 0
}

/**
 * Adds two non-negative limb arrays.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function addLimbs(a, b) {
	const len = Math.max(a.length, b.length)
	const out = new Array(len)
	let carry = 0
	for (let i = 0; i < len; i++) {
		const sum = (i < a.length ? a[i] : 0) + (i < b.length ? b[i] : 0) + carry
		if (sum >= BASE) {
			out[i] = sum - BASE
			carry = 1
		} else {
			out[i] = sum
			carry = 0
		}
	}
	if (carry !== 0) out.push(carry)
	return trimLimbs(out)
}

/**
 * Subtracts non-negative limb array b from a (requires a >= b).
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function subLimbs(a, b) {
	const out = new Array(a.length)
	let borrow = 0
	for (let i = 0; i < a.length; i++) {
		let diff = a[i] - (i < b.length ? b[i] : 0) - borrow
		if (diff < 0) {
			diff += BASE
			borrow = 1
		} else {
			borrow = 0
		}
		out[i] = diff
	}
	return trimLimbs(out)
}

/**
 * Subtracts 1 from a positive limb array.
 *
 * @param {number[]} a
 * @returns {number[]}
 */
function decLimbs(a) {
	const out = a.slice()
	for (let i = 0; i < out.length; i++) {
		if (out[i] > 0) {
			out[i] -= 1
			break
		}
		out[i] = BASE - 1
	}
	return trimLimbs(out)
}

/**
 * Multiplies a limb array by a small non-negative integer scalar (< BASE).
 *
 * @param {number[]} a
 * @param {number} scalar
 * @returns {number[]}
 */
function mulSmall(a, scalar) {
	if (a.length === 0 || scalar === 0) return []
	if (scalar === 1) return a.slice()
	const out = new Array(a.length)
	let carry = 0
	for (let i = 0; i < a.length; i++) {
		const prod = a[i] * scalar + carry
		out[i] = prod % BASE
		carry = Math.floor(prod / BASE)
	}
	while (carry > 0) {
		out.push(carry % BASE)
		carry = Math.floor(carry / BASE)
	}
	return trimLimbs(out)
}

/**
 * Multiplies a limb array by BASE^k.
 *
 * @param {number[]} a
 * @param {number} k
 * @returns {number[]}
 */
function shiftLeftLimbs(a, k) {
	if (a.length === 0 || k === 0) return a.slice()
	const out = new Array(k + a.length)
	for (let i = 0; i < k; i++) out[i] = 0
	for (let i = 0; i < a.length; i++) out[k + i] = a[i]
	return out
}

/**
 * Returns the lower k limbs (a mod BASE^k).
 *
 * @param {number[]} a
 * @param {number} k
 * @returns {number[]}
 */
function lowLimbs(a, k) {
	return trimLimbs(a.slice(0, Math.min(k, a.length)))
}

/**
 * Returns the limbs above index k (floor(a / BASE^k)).
 *
 * @param {number[]} a
 * @param {number} k
 * @returns {number[]}
 */
function highLimbs(a, k) {
	return k >= a.length ? [] : a.slice(k)
}

/**
 * Schoolbook multiplication base case for small limb arrays.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function mulSchoolbook(a, b) {
	if (a.length === 0 || b.length === 0) return []
	const out = new Array(a.length + b.length).fill(0)
	for (let i = 0; i < a.length; i++) {
		const ai = a[i]
		if (ai === 0) continue
		let carry = 0
		for (let j = 0; j < b.length; j++) {
			const prod = out[i + j] + ai * b[j] + carry
			out[i + j] = prod % BASE
			carry = Math.floor(prod / BASE)
		}
		let idx = i + b.length
		while (carry > 0) {
			const sum = out[idx] + carry
			out[idx] = sum % BASE
			carry = Math.floor(sum / BASE)
			idx++
		}
	}
	return trimLimbs(out)
}

/**
 * Recursive Karatsuba divide-and-conquer multiplication.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function mulKaratsuba(a, b) {
	if (a.length === 0 || b.length === 0) return []
	if (a.length <= KARATSUBA_THRESHOLD || b.length <= KARATSUBA_THRESHOLD) {
		return mulSchoolbook(a, b)
	}
	const m = Math.floor(Math.max(a.length, b.length) / 2)
	const a0 = lowLimbs(a, m)
	const a1 = highLimbs(a, m)
	const b0 = lowLimbs(b, m)
	const b1 = highLimbs(b, m)

	const z0 = mulKaratsuba(a0, b0)
	const z2 = mulKaratsuba(a1, b1)
	const z1Full = mulKaratsuba(addLimbs(a0, a1), addLimbs(b0, b1))
	const z1 = subLimbs(subLimbs(z1Full, z2), z0)

	return addLimbs(
		addLimbs(shiftLeftLimbs(z2, 2 * m), shiftLeftLimbs(z1, m)),
		z0,
	)
}

/**
 * Burnikel-Ziegler Div2n1n: divides a 2n-limb dividend by a normalized n-limb
 * divisor (where n is a power of 2 and 0 <= a < BASE^n * d).
 *
 * @param {number[]} a
 * @param {number[]} d
 * @param {number} n
 * @returns {{ q: number[], r: number[] }}
 */
function div2n1n(a, d, n) {
	if (cmpLimbs(a, d) < 0) {
		return { q: [], r: a.slice() }
	}
	if (n === 1) {
		const dividend = (a[1] || 0) * BASE + (a[0] || 0)
		const divisor = d[0]
		const qVal = Math.floor(dividend / divisor)
		const rVal = dividend - qVal * divisor
		return {
			q: qVal === 0 ? [] : [qVal],
			r: rVal === 0 ? [] : [rVal],
		}
	}

	const m = n >> 1
	const aHi = highLimbs(a, m)
	const a4 = lowLimbs(a, m)

	const { q: q1, r: r1 } = div3n2n(aHi, d, m)
	const aLo = addLimbs(shiftLeftLimbs(r1, m), a4)
	const { q: q2, r } = div3n2n(aLo, d, m)

	return {
		q: addLimbs(shiftLeftLimbs(q1, m), q2),
		r,
	}
}

/**
 * Burnikel-Ziegler Div3n2n: divides a 3m-limb dividend by a normalized 2m-limb
 * divisor (where m is a power of 2 and 0 <= a < BASE^m * d).
 *
 * @param {number[]} a
 * @param {number[]} d
 * @param {number} m
 * @returns {{ q: number[], r: number[] }}
 */
function div3n2n(a, d, m) {
	if (cmpLimbs(a, d) < 0) {
		return { q: [], r: a.slice() }
	}

	const a12 = highLimbs(a, m)
	const a1 = highLimbs(a, 2 * m)
	const a3 = lowLimbs(a, m)
	const d1 = highLimbs(d, m)
	const d2 = lowLimbs(d, m)

	let q
	let c
	if (cmpLimbs(a1, d1) < 0) {
		const res = div2n1n(a12, d1, m)
		q = res.q
		c = res.r
	} else {
		q = new Array(m).fill(BASE - 1)
		c = addLimbs(lowLimbs(a12, m), d1)
	}

	const lhs = addLimbs(shiftLeftLimbs(c, m), a3)
	const rhs = mulKaratsuba(q, d2)

	if (cmpLimbs(lhs, rhs) >= 0) {
		return { q, r: subLimbs(lhs, rhs) }
	}

	// q is at most 2 larger than the true quotient; adjust downward until remainder >= 0.
	let negRem = subLimbs(rhs, lhs)
	while (negRem.length > 0) {
		q = decLimbs(q)
		if (cmpLimbs(d, negRem) >= 0) {
			return { q, r: subLimbs(d, negRem) }
		}
		negRem = subLimbs(negRem, d)
	}

	return { q, r: [] }
}

/**
 * Divide-and-conquer multi-block division over blocks of size n.
 * Invariant: blocks >= 2 and highLimbs(a, (blocks - 1) * n) < d.
 *
 * @param {number[]} a
 * @param {number[]} d
 * @param {number} n
 * @param {number} blocks
 * @returns {{ q: number[], r: number[] }}
 */
function divBlocks(a, d, n, blocks) {
	if (cmpLimbs(a, d) < 0) {
		return { q: [], r: a.slice() }
	}
	if (blocks <= 2) {
		return div2n1n(a, d, n)
	}

	const k = Math.floor(blocks / 2)
	const shift = k * n
	const aHi = highLimbs(a, shift)
	const aLoPart = lowLimbs(a, shift)

	const { q: qHi, r: rHi } = divBlocks(aHi, d, n, blocks - k)
	const aLo = addLimbs(shiftLeftLimbs(rHi, shift), aLoPart)
	const { q: qLo, r } = divBlocks(aLo, d, n, k + 1)

	return {
		q: addLimbs(shiftLeftLimbs(qHi, shift), qLo),
		r,
	}
}

/**
 * Computes floor(a / d) for non-negative limb arrays (d > 0) using
 * normalized Burnikel-Ziegler recursive division.
 *
 * @param {number[]} a
 * @param {number[]} d
 * @returns {number[]}
 */
function divFloorRecursive(a, d) {
	if (cmpLimbs(a, d) < 0) return []

	let n = 1
	while (n < d.length) n <<= 1

	const limbShift = n - d.length
	const dShifted = shiftLeftLimbs(d, limbShift)
	const aShifted = shiftLeftLimbs(a, limbShift)

	const topLimb = dShifted[n - 1]
	const scale = topLimb >= BASE / 2 ? 1 : Math.floor(BASE / (topLimb + 1))
	const dNorm = mulSmall(dShifted, scale)
	const aNorm = mulSmall(aShifted, scale)

	let blocks = Math.max(2, Math.ceil(aNorm.length / n))
	if (cmpLimbs(highLimbs(aNorm, (blocks - 1) * n), dNorm) >= 0) {
		blocks += 1
	}

	return divBlocks(aNorm, dNorm, n, blocks).q
}

/**
 * Divides two arbitrary-precision decimal strings using a recursive
 * divide-and-conquer algorithm (Burnikel-Ziegler division with Karatsuba
 * multiplication).
 *
 * Results are truncated toward zero at `precision` fractional decimal places,
 * with insignificant trailing fractional zeros stripped and zero always
 * formatted as `"0"` (never `"-0"`).
 *
 * @param {string} dividend - The dividend as a decimal string (e.g. `"-123.45"`).
 * @param {string} divisor - The non-zero divisor as a decimal string (e.g. `"0.5"`).
 * @param {number} [precision=20] - Non-negative safe integer specifying the maximum
 *   number of fractional decimal digits to compute.
 * @returns {string} The quotient formatted as a canonical decimal string.
 * @throws {TypeError} If `dividend` or `divisor` is not a string, or `precision` is not a number.
 * @throws {RangeError} If `dividend` or `divisor` is not a valid decimal string,
 *   `divisor` is zero, or `precision` is not a non-negative safe integer.
 */
export function divideDecimalRecursive(dividend, divisor, precision = 20) {
	const parsedA = parseDecimal(dividend, 'dividend')
	const parsedB = parseDecimal(divisor, 'divisor')

	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a non-negative safe integer')
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer')
	}

	if (parsedB.digits === '0') {
		throw new RangeError('Division by zero')
	}
	if (parsedA.digits === '0') {
		return '0'
	}

	const isNegative = parsedA.sign !== parsedB.sign
	const shift = parsedB.scale - parsedA.scale + precision

	let scaledNumStr = parsedA.digits
	let scaledDenStr = parsedB.digits
	if (shift > 0) {
		scaledNumStr += '0'.repeat(shift)
	} else if (shift < 0) {
		scaledDenStr += '0'.repeat(-shift)
	}

	// Quick length check before limb conversion when quotient is trivially 0.
	if (
		scaledNumStr.length < scaledDenStr.length ||
		(scaledNumStr.length === scaledDenStr.length && scaledNumStr < scaledDenStr)
	) {
		return '0'
	}

	const numLimbs = decimalStringToLimbs(scaledNumStr)
	const denLimbs = decimalStringToLimbs(scaledDenStr)
	const qLimbs = divFloorRecursive(numLimbs, denLimbs)
	const qStr = limbsToDecimalString(qLimbs)

	if (qStr === '0') {
		return '0'
	}

	const prefix = isNegative ? '-' : ''
	if (precision === 0) {
		return prefix + qStr
	}

	let intPart
	let fracPart
	if (qStr.length <= precision) {
		intPart = '0'
		fracPart = '0'.repeat(precision - qStr.length) + qStr
	} else {
		const splitAt = qStr.length - precision
		intPart = qStr.slice(0, splitAt)
		fracPart = qStr.slice(splitAt)
	}

	fracPart = fracPart.replace(/0+$/, '')
	if (fracPart.length === 0) {
		return prefix + intPart
	}
	return `${prefix}${intPart}.${fracPart}`
}
