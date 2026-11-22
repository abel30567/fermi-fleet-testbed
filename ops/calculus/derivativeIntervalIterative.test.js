import { test } from 'node:test'
import assert from 'node:assert/strict'
import { derivativeIntervalIterative } from './derivativeIntervalIterative.js'

const _f64 = new Float64Array(1)
const _u64 = new BigUint64Array(_f64.buffer)

/**
 * Converts a finite IEEE-754 binary64 number to an exact dyadic rational
 * `{ num: bigint, shift: number }` representing `num * 2^shift`.
 */
function floatToExactDyadic(x) {
	if (!Number.isFinite(x)) {
		throw new RangeError(`Expected finite float, got ${x}`)
	}
	if (x === 0) return { num: 0n, shift: 0 }
	_f64[0] = x
	const bits = _u64[0]
	const sign = bits >> 63n === 1n ? -1n : 1n
	const expBits = Number((bits >> 52n) & 0x7ffn)
	const fracBits = bits & 0xfffffffffffffn
	if (expBits === 0) {
		// Subnormal: (-1)^s * frac * 2^(-1074)
		return { num: sign * fracBits, shift: -1074 }
	}
	// Normal: (-1)^s * (2^52 + frac) * 2^(expBits - 1023 - 52)
	return { num: sign * ((1n << 52n) + fracBits), shift: expBits - 1075 }
}

function addDyadic(a, b) {
	if (a.num === 0n) return b
	if (b.num === 0n) return a
	if (a.shift === b.shift) return { num: a.num + b.num, shift: a.shift }
	if (a.shift > b.shift) {
		return {
			num: (a.num << BigInt(a.shift - b.shift)) + b.num,
			shift: b.shift,
		}
	}
	return {
		num: a.num + (b.num << BigInt(b.shift - a.shift)),
		shift: a.shift,
	}
}

function mulDyadic(a, b) {
	if (a.num === 0n || b.num === 0n) return { num: 0n, shift: 0 }
	return { num: a.num * b.num, shift: a.shift + b.shift }
}

/**
 * Compares two exact dyadic rationals: returns -1, 0, or 1.
 */
function cmpDyadic(a, b) {
	if (a.num === 0n && b.num === 0n) return 0
	const minShift = Math.min(a.shift, b.shift)
	const aScaled = a.num << BigInt(a.shift - minShift)
	const bScaled = b.num << BigInt(b.shift - minShift)
	if (aScaled < bScaled) return -1
	if (aScaled > bScaled) return 1
	return 0
}

/**
 * Independent exact symbolic derivative evaluator over arbitrary-precision
 * dyadic rationals for p(x) = sum_{k=0}^n c_k x^k.
 */
function exactSymbolicDerivative(scalarCoeffs, x, order = 1) {
	let dCoeffs = scalarCoeffs.map(floatToExactDyadic)
	for (let step = 0; step < order; step++) {
		if (dCoeffs.length <= 1) return { num: 0n, shift: 0 }
		const next = []
		for (let k = 1; k < dCoeffs.length; k++) {
			next.push(mulDyadic({ num: BigInt(k), shift: 0 }, dCoeffs[k]))
		}
		dCoeffs = next
	}
	const xDyadic = floatToExactDyadic(x)
	let acc = { num: 0n, shift: 0 }
	let xPow = { num: 1n, shift: 0 }
	for (let k = 0; k < dCoeffs.length; k++) {
		acc = addDyadic(acc, mulDyadic(dCoeffs[k], xPow))
		xPow = mulDyadic(xPow, xDyadic)
	}
	return acc
}

function assertEnclosesExact(interval, exactValue, label = '') {
	const [lo, hi] = interval
	assert.ok(lo <= hi, `${label}: interval must satisfy lo <= hi`)
	if (Number.isFinite(lo)) {
		assert.ok(
			cmpDyadic(floatToExactDyadic(lo), exactValue) <= 0,
			`${label}: lower bound ${lo} exceeds exact value`,
		)
	}
	if (Number.isFinite(hi)) {
		assert.ok(
			cmpDyadic(exactValue, floatToExactDyadic(hi)) <= 0,
			`${label}: exact value exceeds upper bound ${hi}`,
		)
	}
}

test('constant polynomial derivative is [0, 0]', () => {
	assert.deepStrictEqual(derivativeIntervalIterative([42], [-10, 10]), [0, 0])
	assert.deepStrictEqual(
		derivativeIntervalIterative([[3.5, 7.25]], [-100, 100]),
		[0, 0],
	)
})

test('linear polynomial derivative returns exact slope interval', () => {
	assert.deepStrictEqual(
		derivativeIntervalIterative([5, -7], [-10, 10]),
		[-7, -7],
	)
	assert.deepStrictEqual(
		derivativeIntervalIterative([[1, 2], [-3.5, 4.25]], [-5, 5]),
		[-3.5, 4.25],
	)
})

test('quadratic and cubic polynomials with exact integer arithmetic', () => {
	// p(x) = 1 + 2x + 3x^2 => p'(x) = 2 + 6x; on [1, 4] exact range is [8, 26]
	assert.deepStrictEqual(derivativeIntervalIterative([1, 2, 3], [1, 4]), [8, 26])

	// p(x) = 1 - 2x + 3x^2 - 4x^3 => p'(x) = -2 + 6x - 12x^2
	// At point x = 2: p'(2) = -2 + 12 - 48 = -38
	assert.deepStrictEqual(
		derivativeIntervalIterative([1, -2, 3, -4], [2, 2]),
		[-38, -38],
	)
})

test('zero-straddling interval encloses true extrema', () => {
	// p(x) = x^3 - 3x => p'(x) = 3x^2 - 3
	// On [-2, 2], true range of p'(x) is [-3, 9].
	const [lo, hi] = derivativeIntervalIterative([0, -3, 0, 1], [-2, 2])
	assert.ok(lo <= -3, `expected lo <= -3, got ${lo}`)
	assert.ok(hi >= 9, `expected hi >= 9, got ${hi}`)

	// With subdivisions, enclosure tightens toward [-3, 9] while still enclosing it
	const [loSub, hiSub] = derivativeIntervalIterative([0, -3, 0, 1], [-2, 2], {
		subdivisions: 64,
	})
	assert.ok(loSub <= -3, `expected subdivided lo <= -3, got ${loSub}`)
	assert.ok(hiSub >= 9, `expected subdivided hi >= 9, got ${hiSub}`)
	assert.ok(
		hiSub - loSub < hi - lo,
		`expected subdivisions to tighten enclosure: ${hiSub - loSub} < ${hi - lo}`,
	)
})

test('higher-order derivatives and order 0', () => {
	// p(x) = 2 + 3x + 4x^2 + 5x^3
	// p'(x) = 3 + 8x + 15x^2
	// p''(x) = 8 + 30x
	// p'''(x) = 30
	// p''''(x) = 0
	const coeffs = [2, 3, 4, 5]
	assert.deepStrictEqual(
		derivativeIntervalIterative(coeffs, [1, 2], { order: 0 }),
		[14, 64],
	)
	assert.deepStrictEqual(
		derivativeIntervalIterative(coeffs, [1, 2], { order: 2 }),
		[38, 68],
	)
	assert.deepStrictEqual(
		derivativeIntervalIterative(coeffs, [-5, 5], { order: 3 }),
		[30, 30],
	)
	assert.deepStrictEqual(
		derivativeIntervalIterative(coeffs, [-5, 5], { order: 4 }),
		[0, 0],
	)
	assert.deepStrictEqual(
		derivativeIntervalIterative(coeffs, [-5, 5], { order: 10 }),
		[0, 0],
	)
})

test('interval coefficients and trailing zeros', () => {
	// p(x) = [0, 1] + [2, 3]x + [1, 2]x^2 + [0, 0]x^3
	// p'(x) = [2, 3] + [2, 4]x
	// On [1, 2]: lo = 2 + 2*1 = 4, hi = 3 + 4*2 = 11
	assert.deepStrictEqual(
		derivativeIntervalIterative(
			[
				[0, 1],
				[2, 3],
				[1, 2],
				[0, 0],
			],
			[1, 2],
		),
		[4, 11],
	)
})

test('negative zero normalization and tiny ULP-wide intervals with subdivisions', () => {
	const zeroResult = derivativeIntervalIterative([-0, -0], [-0, -0])
	assert.ok(Object.is(zeroResult[0], 0))
	assert.ok(Object.is(zeroResult[1], 0))

	// ULP-wide interval with subdivisions > number of representable floats in interval
	const xLo = 1
	const xHi = 1 + Number.EPSILON
	const res = derivativeIntervalIterative([0, 0.1, 0.2, 0.3], [xLo, xHi], {
		subdivisions: 16,
	})
	assertEnclosesExact(res, exactSymbolicDerivative([0, 0.1, 0.2, 0.3], xLo), 'ulp lo')
	assertEnclosesExact(res, exactSymbolicDerivative([0, 0.1, 0.2, 0.3], xHi), 'ulp hi')
})

test('outward rounding guarantees exact enclosure for non-dyadic floats', () => {
	// Polynomial with non-dyadic IEEE-754 coefficients evaluated at non-dyadic points
	const coeffs = [Math.PI, 0.1, 1 / 3, -Math.SQRT2, 0.7, -1 / 7]
	const points = [-1.3, -1 / 3, -0.1, 0, 0.1, 1 / 3, 0.7, Math.SQRT2]
	for (const pt of points) {
		const enclosure = derivativeIntervalIterative(coeffs, [pt, pt])
		const exact = exactSymbolicDerivative(coeffs, pt, 1)
		assertEnclosesExact(enclosure, exact, `point ${pt}`)
		// Point evaluation width should be very tight (at most a few ULPs)
		const scale = Math.max(1, Math.abs(enclosure[0]), Math.abs(enclosure[1]))
		assert.ok(
			enclosure[1] - enclosure[0] <= 16 * Number.EPSILON * scale,
			`point enclosure unexpectedly wide at x=${pt}: [${enclosure[0]}, ${enclosure[1]}]`,
		)
	}
})

test('cross-check against independent symbolic derivative and dense sampling', () => {
	// Interval polynomial: c_k in [lo_k, hi_k]
	const intervalCoeffs = [
		[-0.5, 0.5],
		[0.1, 0.3],
		[-1 / 3, 0.2],
		[0.7, 1.1],
		[-0.25, -0.1],
	]
	const domain = [-1.5, 2.25]

	const direct = derivativeIntervalIterative(intervalCoeffs, domain)
	const refined = derivativeIntervalIterative(intervalCoeffs, domain, {
		subdivisions: 32,
	})

	// Refined enclosure must be valid and tighter or equal in width
	assert.ok(refined[0] <= refined[1])
	assert.ok(refined[1] - refined[0] <= direct[1] - direct[0])

	// Sample 201 x points across domain and multiple coefficient realizations
	// (lower endpoints, upper endpoints, midpoints, alternating corners)
	const coeffSamples = [
		intervalCoeffs.map(([lo]) => lo),
		intervalCoeffs.map(([, hi]) => hi),
		intervalCoeffs.map(([lo, hi]) => (lo + hi) / 2),
		intervalCoeffs.map(([lo, hi], i) => (i % 2 === 0 ? lo : hi)),
		intervalCoeffs.map(([lo, hi], i) => (i % 2 === 0 ? hi : lo)),
	]

	const steps = 200
	for (let i = 0; i <= steps; i++) {
		const t = i / steps
		const x = domain[0] + (domain[1] - domain[0]) * t
		for (const sampleCoeffs of coeffSamples) {
			const exact = exactSymbolicDerivative(sampleCoeffs, x, 1)
			assertEnclosesExact(direct, exact, `direct x=${x}`)
			assertEnclosesExact(refined, exact, `refined x=${x}`)
		}
	}
})

test('extreme magnitudes and overflow preserve valid outer bounds without NaN', () => {
	// Wide domain where hi - lo overflows float64, with linear polynomial (constant derivative)
	const wideConst = derivativeIntervalIterative([0, 2], [-1e308, 1e308], {
		subdivisions: 4,
	})
	assert.deepStrictEqual(wideConst, [2, 2])

	// Overflowing cubic derivative still yields valid non-NaN bounds [-Infinity, Infinity] or finite/Infinity
	const overflow = derivativeIntervalIterative([0, 0, 0, 1e200], [1e100, 1e101])
	assert.ok(!Number.isNaN(overflow[0]) && !Number.isNaN(overflow[1]))
	assert.ok(overflow[0] <= overflow[1])
	assert.equal(overflow[1], Infinity)

	// Subnormal underflow product (0 < a*b < Number.MIN_VALUE)
	const tiny = derivativeIntervalIterative([0, 0, 1e-200], [1e-200, 1e-200])
	assert.equal(tiny[0], 0)
	assert.equal(tiny[1], Number.MIN_VALUE)
})

test('invalid inputs throw appropriate TypeError or RangeError', () => {
	// Invalid coeffs
	assert.throws(() => derivativeIntervalIterative(null, [0, 1]), TypeError)
	assert.throws(() => derivativeIntervalIterative('123', [0, 1]), TypeError)
	assert.throws(() => derivativeIntervalIterative([], [0, 1]), RangeError)
	assert.throws(() => derivativeIntervalIterative([NaN], [0, 1]), RangeError)
	assert.throws(() => derivativeIntervalIterative([Infinity], [0, 1]), RangeError)
	assert.throws(() => derivativeIntervalIterative(['1'], [0, 1]), TypeError)
	assert.throws(() => derivativeIntervalIterative([[2, 1]], [0, 1]), RangeError)
	assert.throws(() => derivativeIntervalIterative([[1]], [0, 1]), RangeError)
	assert.throws(
		() => derivativeIntervalIterative([[1, 2, 3]], [0, 1]),
		RangeError,
	)

	// Invalid x
	assert.throws(() => derivativeIntervalIterative([1, 2], 1), TypeError)
	assert.throws(() => derivativeIntervalIterative([1, 2], null), TypeError)
	assert.throws(() => derivativeIntervalIterative([1, 2], [1]), RangeError)
	assert.throws(
		() => derivativeIntervalIterative([1, 2], [1, 2, 3]),
		RangeError,
	)
	assert.throws(() => derivativeIntervalIterative([1, 2], [2, 1]), RangeError)
	assert.throws(() => derivativeIntervalIterative([1, 2], [NaN, 1]), RangeError)
	assert.throws(
		() => derivativeIntervalIterative([1, 2], [0, Infinity]),
		RangeError,
	)
	assert.throws(() => derivativeIntervalIterative([1, 2], ['0', 1]), TypeError)

	// Invalid options
	assert.throws(
		() => derivativeIntervalIterative([1, 2], [0, 1], null),
		TypeError,
	)
	assert.throws(
		() => derivativeIntervalIterative([1, 2], [0, 1], []),
		TypeError,
	)
	assert.throws(
		() => derivativeIntervalIterative([1, 2], [0, 1], { order: -1 }),
		RangeError,
	)
	assert.throws(
		() => derivativeIntervalIterative([1, 2], [0, 1], { order: 1.5 }),
		RangeError,
	)
	assert.throws(
		() => derivativeIntervalIterative([1, 2], [0, 1], { order: '1' }),
		TypeError,
	)
	assert.throws(
		() => derivativeIntervalIterative([1, 2], [0, 1], { subdivisions: 0 }),
		RangeError,
	)
	assert.throws(
		() => derivativeIntervalIterative([1, 2], [0, 1], { subdivisions: 1.5 }),
		RangeError,
	)
	assert.throws(
		() =>
			derivativeIntervalIterative([1, 2], [0, 1], { subdivisions: 1_000_001 }),
		RangeError,
	)
	assert.throws(
		() => derivativeIntervalIterative([1, 2], [0, 1], { subdivisions: '4' }),
		TypeError,
	)
})
