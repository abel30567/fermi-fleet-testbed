/**
 * Shared 8-byte buffer for exact IEEE-754 binary64 bit decomposition and assembly.
 */
const f64Buffer = new ArrayBuffer(8)
const f64View = new Float64Array(f64Buffer)
const u64View = new BigUint64Array(f64Buffer)

/**
 * Bit threshold at or below which two non-negative integers multiply exactly
 * inside IEEE-754 binary64 (2^26 * 2^26 = 2^52 < Number.MAX_SAFE_INTEGER).
 */
const KARATSUBA_BASE_BITS = 26

/**
 * Maximum exponent gap between real and imaginary parts for aligning operands
 * into Gauss's 3-multiplication complex step without excessive zero-padding.
 */
const MAX_GAUSS_EXP_GAP = 128

/**
 * Computes the bit length of a non-negative BigInt (0 for 0n).
 *
 * @param {bigint} n
 * @returns {number}
 */
function bitLength(n) {
	return n === 0n ? 0 : n.toString(2).length
}

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} value
 * @param {string} label
 * @throws {TypeError} If `value` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplex(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object with numeric { re, im } properties`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`)
	}
}

/**
 * Decomposes a finite IEEE-754 binary64 number into an exact dyadic rational `m * 2^e`
 * with odd mantissa `m` (or `m = 0n, e = 0` for ±0).
 *
 * @param {number} x
 * @returns {{ m: bigint, e: number }}
 */
function numberToDyadic(x) {
	if (x === 0) {
		return { m: 0n, e: 0 }
	}
	f64View[0] = x
	const bits = u64View[0]
	const negative = (bits >> 63n) !== 0n
	const biasedExp = Number((bits >> 52n) & 0x7ffn)
	const frac = bits & 0xfffffffffffffn

	let m
	let e
	if (biasedExp === 0) {
		// Subnormal: (-1)^s * frac * 2^-1074
		m = frac
		e = -1074
	} else {
		// Normal: (-1)^s * (2^52 + frac) * 2^(biasedExp - 1075)
		m = (1n << 52n) | frac
		e = biasedExp - 1075
	}

	// Strip trailing zero bits to keep the mantissa minimal.
	while ((m & 1n) === 0n) {
		m >>= 1n
		e += 1
	}

	return { m: negative ? -m : m, e }
}

/**
 * Converts a validated complex number `{ re, im }` to its exact dyadic representation.
 *
 * @param {{ re: number, im: number }} z
 * @returns {{ re: { m: bigint, e: number }, im: { m: bigint, e: number } }}
 */
function complexToDyadic(z) {
	return {
		re: numberToDyadic(z.re),
		im: numberToDyadic(z.im),
	}
}

/**
 * Converts an exact dyadic rational `m * 2^e` to the nearest IEEE-754 binary64 number
 * using round-to-nearest, ties-to-even. Normalizes `-0` to `0`.
 *
 * @param {bigint} m
 * @param {number} e
 * @returns {number}
 */
function dyadicToNumber(m, e) {
	if (m === 0n) {
		return 0
	}

	const negative = m < 0n
	const mag = negative ? -m : m
	const bits = bitLength(mag)
	let exp = e + bits - 1

	// Guaranteed overflow above max binary64 exponent.
	if (exp > 1023) {
		return negative ? -Infinity : Infinity
	}
	// Strictly below half of Number.MIN_VALUE (2^-1075) -> underflows to +0.
	if (exp < -1075) {
		return 0
	}

	const isSubnormal = exp < -1022
	const shift = isSubnormal ? -1074 - e : bits - 53

	let sig
	if (shift <= 0) {
		sig = mag << BigInt(-shift)
	} else {
		const s = BigInt(shift)
		const q = mag >> s
		const half = 1n << (s - 1n)
		const rem = mag & ((1n << s) - 1n)
		const roundUp = rem > half || (rem === half && (q & 1n) === 1n)
		sig = roundUp ? q + 1n : q
	}

	let biasedExp
	let frac
	if (isSubnormal) {
		if (sig === 0n) {
			return 0
		}
		if (sig === 1n << 52n) {
			// Rounded up from largest subnormal to smallest normal (2^-1022).
			biasedExp = 1n
			frac = 0n
		} else {
			biasedExp = 0n
			frac = sig
		}
	} else {
		if (sig === 1n << 53n) {
			sig >>= 1n
			exp += 1
		}
		if (exp > 1023) {
			return negative ? -Infinity : Infinity
		}
		biasedExp = BigInt(exp + 1023)
		frac = sig & 0xfffffffffffffn
	}

	u64View[0] = (negative ? 1n << 63n : 0n) | (biasedExp << 52n) | frac
	const result = f64View[0]
	return result === 0 ? 0 : result
}

/**
 * Recursive divide-and-conquer Karatsuba multiplication for non-negative BigInts.
 * Splits operands at half their maximum bit width down to 26-bit base cases
 * evaluated via exact IEEE-754 integer multiplication.
 *
 * @param {bigint} x
 * @param {bigint} y
 * @returns {bigint}
 */
function karatsubaUnsigned(x, y) {
	if (x === 0n || y === 0n) {
		return 0n
	}
	const n = Math.max(bitLength(x), bitLength(y))
	if (n <= KARATSUBA_BASE_BITS) {
		return BigInt(Number(x) * Number(y))
	}

	const half = BigInt(n >> 1)
	const mask = (1n << half) - 1n

	const x0 = x & mask
	const x1 = x >> half
	const y0 = y & mask
	const y1 = y >> half

	const z0 = karatsubaUnsigned(x0, y0)
	const z2 = karatsubaUnsigned(x1, y1)
	const z1 = karatsubaUnsigned(x0 + x1, y0 + y1) - z2 - z0

	return (z2 << (half << 1n)) + (z1 << half) + z0
}

/**
 * Signed recursive Karatsuba multiplication for BigInts.
 *
 * @param {bigint} x
 * @param {bigint} y
 * @returns {bigint}
 */
function karatsubaBigInt(x, y) {
	if (x === 0n || y === 0n) {
		return 0n
	}
	const negative = (x < 0n) !== (y < 0n)
	const prod = karatsubaUnsigned(x < 0n ? -x : x, y < 0n ? -y : y)
	return negative ? -prod : prod
}

/**
 * Adds two exact dyadic rationals `d1 + d2`.
 *
 * @param {{ m: bigint, e: number }} d1
 * @param {{ m: bigint, e: number }} d2
 * @returns {{ m: bigint, e: number }}
 */
function addDyadic(d1, d2) {
	if (d1.m === 0n) return d2
	if (d2.m === 0n) return d1

	if (d1.e >= d2.e) {
		const diff = BigInt(d1.e - d2.e)
		return { m: (d1.m << diff) + d2.m, e: d2.e }
	}
	const diff = BigInt(d2.e - d1.e)
	return { m: d1.m + (d2.m << diff), e: d1.e }
}

/**
 * Multiplies two exact dyadic rationals via recursive Karatsuba multiplication.
 *
 * @param {{ m: bigint, e: number }} d1
 * @param {{ m: bigint, e: number }} d2
 * @returns {{ m: bigint, e: number }}
 */
function mulDyadic(d1, d2) {
	if (d1.m === 0n || d2.m === 0n) {
		return { m: 0n, e: 0 }
	}
	return { m: karatsubaBigInt(d1.m, d2.m), e: d1.e + d2.e }
}

/**
 * Multiplies two exact dyadic complex numbers using Gauss's 3-multiplication
 * divide-and-conquer complex formula (when exponents are closely aligned) and
 * recursive Karatsuba multiplication for all integer products.
 *
 * @param {{ re: { m: bigint, e: number }, im: { m: bigint, e: number } }} z1
 * @param {{ re: { m: bigint, e: number }, im: { m: bigint, e: number } }} z2
 * @returns {{ re: { m: bigint, e: number }, im: { m: bigint, e: number } }}
 */
function multiplyComplexDyadic(z1, z2) {
	const da = z1.re
	const db = z1.im
	const dc = z2.re
	const dd = z2.im

	if ((da.m === 0n && db.m === 0n) || (dc.m === 0n && dd.m === 0n)) {
		return { re: { m: 0n, e: 0 }, im: { m: 0n, e: 0 } }
	}

	if (
		da.m !== 0n &&
		db.m !== 0n &&
		dc.m !== 0n &&
		dd.m !== 0n &&
		Math.abs(da.e - db.e) <= MAX_GAUSS_EXP_GAP &&
		Math.abs(dc.e - dd.e) <= MAX_GAUSS_EXP_GAP
	) {
		// Align operands to common binary exponents and apply Gauss's 3-multiplication
		// divide-and-conquer identity in exact integer arithmetic (zero cancellation error):
		//   p1 = A * (C + D)
		//   p2 = D * (A + B)
		//   p3 = C * (B - A)
		//   Re = p1 - p2 = A*C - B*D
		//   Im = p1 + p3 = A*D + B*C
		const e1 = Math.min(da.e, db.e)
		const e2 = Math.min(dc.e, dd.e)
		const A = da.m << BigInt(da.e - e1)
		const B = db.m << BigInt(db.e - e1)
		const C = dc.m << BigInt(dc.e - e2)
		const D = dd.m << BigInt(dd.e - e2)

		const p1 = karatsubaBigInt(A, C + D)
		const p2 = karatsubaBigInt(D, A + B)
		const p3 = karatsubaBigInt(C, B - A)

		const exp = e1 + e2
		return {
			re: { m: p1 - p2, e: exp },
			im: { m: p1 + p3, e: exp },
		}
	}

	// Sparse or widely-separated exponents: compute exact dyadic terms via recursive Karatsuba.
	const ac = mulDyadic(da, dc)
	const bd = mulDyadic(db, dd)
	const ad = mulDyadic(da, dd)
	const bc = mulDyadic(db, dc)

	return {
		re: addDyadic(ac, { m: -bd.m, e: bd.e }),
		im: addDyadic(ad, bc),
	}
}

/**
 * Recursive divide-and-conquer product tree over a slice `[lo, hi)` of exact dyadic
 * complex numbers.
 *
 * @param {Array<{ re: { m: bigint, e: number }, im: { m: bigint, e: number } }>} operands
 * @param {number} lo
 * @param {number} hi
 * @returns {{ re: { m: bigint, e: number }, im: { m: bigint, e: number } }}
 */
function multiplyRangeDyadic(operands, lo, hi) {
	const count = hi - lo
	if (count === 1) {
		return operands[lo]
	}
	if (count === 2) {
		return multiplyComplexDyadic(operands[lo], operands[lo + 1])
	}
	const mid = (lo + hi) >>> 1
	const left = multiplyRangeDyadic(operands, lo, mid)
	const right = multiplyRangeDyadic(operands, mid, hi)
	return multiplyComplexDyadic(left, right)
}

/**
 * Multiplies two or more complex numbers `{ re, im }` using a recursive
 * divide-and-conquer algorithm.
 *
 * Algorithm:
 * - Decomposes each finite IEEE-754 binary64 component into its exact dyadic rational
 *   `m * 2^e`.
 * - For each binary complex product `(a + bi)(c + di)`, applies Gauss's 3-multiplication
 *   divide-and-conquer identity in exact integer arithmetic when component exponents are
 *   within 128 bits (eliminating floating-point cancellation), and evaluates every integer
 *   product via recursive bit-splitting Karatsuba multiplication down to exact 26-bit
 *   base cases.
 * - For more than two operands, reduces the product via a balanced recursive
 *   divide-and-conquer binary tree in exact dyadic arithmetic, avoiding intermediate
 *   rounding error and spurious overflow/underflow.
 * - Rounds the exact real and imaginary parts back to IEEE-754 binary64 using
 *   round-to-nearest-even.
 *
 * Conventions:
 * - Complex numbers are represented as objects `{ re, im }` with finite real numbers.
 * - `-0` is normalized to `0` in both `re` and `im`.
 * - Intermediate overflows/underflows that cancel out are avoided; true mathematical
 *   overflow beyond `Number.MAX_VALUE` yields `±Infinity`, and underflow below half
 *   of `Number.MIN_VALUE` yields `0`.
 *
 * @param {{ re: number, im: number }} a First complex operand.
 * @param {{ re: number, im: number }} b Second complex operand.
 * @param {...{ re: number, im: number }} rest Optional additional complex operands.
 * @returns {{ re: number, im: number }} The complex product `{ re, im }`.
 * @throws {TypeError} If fewer than two arguments are provided, or any operand is not
 *   an object with numeric `re` and `im` properties.
 * @throws {RangeError} If any operand has a non-finite `re` or `im` (`NaN`, `±Infinity`).
 */
export function multiplyComplexRecursive(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError('multiplyComplexRecursive requires at least two complex operands')
	}
	validateComplex(a, 'a')
	validateComplex(b, 'b')
	for (let i = 0; i < rest.length; i += 1) {
		validateComplex(rest[i], `operand[${i + 2}]`)
	}

	const resultDyadic =
		rest.length === 0
			? multiplyComplexDyadic(complexToDyadic(a), complexToDyadic(b))
			: multiplyRangeDyadic([a, b, ...rest].map(complexToDyadic), 0, rest.length + 2)

	return {
		re: dyadicToNumber(resultDyadic.re.m, resultDyadic.re.e),
		im: dyadicToNumber(resultDyadic.im.m, resultDyadic.im.e),
	}
}
