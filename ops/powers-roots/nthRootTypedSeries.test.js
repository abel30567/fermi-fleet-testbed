import { test } from 'node:test'
import assert from 'node:assert'
import { nthRootTypedSeries } from './nthRootTypedSeries.js'

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-14) {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= limit,
		`Expected ${actual} to be within ${limit} of ${expected} (diff=${diff})`
	)
}

/**
 * Independent Newton-Raphson solver for y^n = x (positive x, integer n >= 2).
 */
function newtonNthRoot(x, n) {
	let y = x >= 1 ? x / n : 1
	if (y === 0) y = 1
	for (let iter = 0; iter < 200; iter++) {
		let yPow = 1
		for (let k = 0; k < n - 1; k++) {
			yPow *= y
		}
		const next = ((n - 1) * y + x / yPow) / n
		if (Math.abs(next - y) <= 1e-15 * Math.abs(next)) {
			return next
		}
		y = next
	}
	return y
}

test('normal cases: scalar integer degrees (square, cube, fourth, fifth roots)', () => {
	const squares = new Float64Array([1, 4, 9, 16, 25, 2.25, 100])
	const sqRoots = nthRootTypedSeries(squares, 2)
	assert.ok(sqRoots instanceof Float64Array)
	assert.equal(sqRoots.length, squares.length)
	const expectedSq = [1, 2, 3, 4, 5, 1.5, 10]
	for (let i = 0; i < expectedSq.length; i++) {
		assertClose(sqRoots[i], expectedSq[i])
	}

	const cubes = new Float64Array([1, 8, 27, 64, 125, 0.125])
	const cbRoots = nthRootTypedSeries(cubes, 3)
	const expectedCb = [1, 2, 3, 4, 5, 0.5]
	for (let i = 0; i < expectedCb.length; i++) {
		assertClose(cbRoots[i], expectedCb[i])
	}

	const fifths = new Float64Array([32, 243, 1024, 3125])
	const fifthRoots = nthRootTypedSeries(fifths, 5)
	const expectedFifth = [2, 3, 4, 5]
	for (let i = 0; i < expectedFifth.length; i++) {
		assertClose(fifthRoots[i], expectedFifth[i])
	}
})

test('normal cases: element-wise Float64Array degrees', () => {
	const radicands = new Float64Array([16, 27, 81, 32, 1.21, 0.25, 8])
	const degrees = new Float64Array([2, 3, 4, 5, 2, -2, -3])
	const actual = nthRootTypedSeries(radicands, degrees)
	const expected = [4, 3, 3, 2, 1.1, 2, 0.5]

	assert.ok(actual instanceof Float64Array)
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assertClose(actual[i], expected[i])
	}
})

test('binomial series regime: radicands near 1 match high-precision values', () => {
	const nearOne = new Float64Array([
		0.75,
		0.8,
		0.95,
		0.999999,
		1 - 1e-12,
		1,
		1 + 1e-12,
		1.000001,
		1.05,
		1.2,
		1.25
	])
	const degrees = new Float64Array([2, 3, 4, 5, 3, 7, 3, 5, 2.5, -3, -2])
	const actual = nthRootTypedSeries(nearOne, degrees)

	for (let i = 0; i < nearOne.length; i++) {
		const ref = Math.pow(nearOne[i], 1 / degrees[i])
		assertClose(actual[i], ref, 1e-14, 1e-15)
	}

	// Verify continuity across the series/exp-ln transition boundary at x = 0.75 and x = 1.25
	const boundary = new Float64Array([0.749999999, 0.75, 0.750000001, 1.249999999, 1.25, 1.250000001])
	const roots = nthRootTypedSeries(boundary, 3)
	assert.ok(roots[0] < roots[1] && roots[1] < roots[2])
	assert.ok(roots[3] < roots[4] && roots[4] < roots[5])
	assertClose(roots[1], Math.cbrt(0.75), 1e-14)
	assertClose(roots[4], Math.cbrt(1.25), 1e-14)
})

test('negative radicands with positive and negative odd integer degrees', () => {
	const radicands = new Float64Array([-1, -8, -27, -32, -1.1, -0.8, -8, -27])
	const degrees = new Float64Array([3, 3, 3, 5, 3, 5, -3, -3])
	const actual = nthRootTypedSeries(radicands, degrees)

	assertClose(actual[0], -1)
	assertClose(actual[1], -2)
	assertClose(actual[2], -3)
	assertClose(actual[3], -2)
	assertClose(actual[4], -Math.cbrt(1.1), 1e-14)
	assertClose(actual[5], -Math.pow(0.8, 1 / 5), 1e-14)
	assertClose(actual[6], -0.5)
	assertClose(actual[7], -1 / 3)
})

test('edge cases: empty arrays, zeros, signed zero, degree 1/-1, fractional degrees, extreme magnitudes', () => {
	// Empty Float64Arrays
	const emptyScalar = nthRootTypedSeries(new Float64Array(0), 2)
	assert.ok(emptyScalar instanceof Float64Array)
	assert.equal(emptyScalar.length, 0)

	const emptyArray = nthRootTypedSeries(new Float64Array(0), new Float64Array(0))
	assert.ok(emptyArray instanceof Float64Array)
	assert.equal(emptyArray.length, 0)

	// Zeros and signed zeros
	const zeros = new Float64Array([0, -0, 0, -0])
	const zeroDegrees = new Float64Array([2, 2, 3, 3])
	const zeroRoots = nthRootTypedSeries(zeros, zeroDegrees)
	assert.ok(Object.is(zeroRoots[0], 0))
	assert.ok(Object.is(zeroRoots[1], 0))
	assert.ok(Object.is(zeroRoots[2], 0))
	assert.ok(Object.is(zeroRoots[3], -0))

	// Degree 1 and -1 (including negative radicands)
	const vals = new Float64Array([-4, -1, 0.5, 1, 7.25])
	const deg1 = nthRootTypedSeries(vals, 1)
	for (let i = 0; i < vals.length; i++) {
		assert.equal(deg1[i], vals[i])
	}
	const degNeg1 = nthRootTypedSeries(vals, -1)
	for (let i = 0; i < vals.length; i++) {
		assertClose(degNeg1[i], 1 / vals[i], 1e-15)
	}

	// Fractional degrees (|n| < 1 exercises |p * u| guard and powers > 1)
	const fracRadicands = new Float64Array([2, 1.01, 0.99, 1.2, 4])
	const fracDegrees = new Float64Array([0.5, 0.25, 0.25, 0.1, -0.5])
	const fracRoots = nthRootTypedSeries(fracRadicands, fracDegrees)
	for (let i = 0; i < fracRadicands.length; i++) {
		assertClose(fracRoots[i], Math.pow(fracRadicands[i], 1 / fracDegrees[i]), 1e-13)
	}

	// Extreme magnitudes (very large and very small positive radicands)
	const extremes = new Float64Array([1e-300, 1e300, Number.MIN_VALUE, 1])
	const extremeRoots = nthRootTypedSeries(extremes, new Float64Array([3, 3, 2, 1e308]))
	assertClose(extremeRoots[0], 1e-100, 1e-12)
	assertClose(extremeRoots[1], 1e100, 1e-12)
	assertClose(extremeRoots[2], Math.sqrt(Number.MIN_VALUE), 1e-12)
	assert.equal(extremeRoots[3], 1)
})

test('does not mutate input Float64Arrays and returns a new instance', () => {
	const radicands = new Float64Array([4, 9, 16])
	const degrees = new Float64Array([2, 2, 2])
	const radCopy = Float64Array.from(radicands)
	const degCopy = Float64Array.from(degrees)

	const out = nthRootTypedSeries(radicands, degrees)
	assert.notEqual(out, radicands)
	assert.notEqual(out, degrees)
	assert.deepEqual(radicands, radCopy)
	assert.deepEqual(degrees, degCopy)
})

test('independent cross-checks: Newton-Raphson solver, round-trip inversion, and algebraic identities', () => {
	// 1. Cross-check against independent Newton-Raphson solver across series and exp/ln regimes
	const testValues = new Float64Array([0.001, 0.5, 0.75, 0.99, 1.0001, 1.25, 2, 10, 1234.5678])
	for (const n of [2, 3, 4, 5, 7]) {
		const actual = nthRootTypedSeries(testValues, n)
		for (let i = 0; i < testValues.length; i++) {
			const newton = newtonNthRoot(testValues[i], n)
			assertClose(actual[i], newton, 1e-13)

			// Round-trip inverse: (x^(1/n))^n == x
			let power = 1
			for (let k = 0; k < n; k++) {
				power *= actual[i]
			}
			assertClose(power, testValues[i], 1e-12)
		}
	}

	// 2. Cross-check against Math.sqrt and Math.cbrt
	const pos = new Float64Array([0.01, 0.76, 1.0005, 1.24, 3, 42, 9999.5])
	const sqrtOut = nthRootTypedSeries(pos, 2)
	const cbrtOut = nthRootTypedSeries(pos, 3)
	for (let i = 0; i < pos.length; i++) {
		assertClose(sqrtOut[i], Math.sqrt(pos[i]), 1e-14)
		assertClose(cbrtOut[i], Math.cbrt(pos[i]), 1e-14)
	}

	// 3. Algebraic identities: product rule, nested root rule, reciprocal degree rule
	const a = new Float64Array([0.8, 1.15, 3.5, 12])
	const b = new Float64Array([1.2, 0.9, 7.2, 0.25])
	const ab = new Float64Array(a.length)
	for (let i = 0; i < a.length; i++) ab[i] = a[i] * b[i]

	const rootA = nthRootTypedSeries(a, 3)
	const rootB = nthRootTypedSeries(b, 3)
	const rootAB = nthRootTypedSeries(ab, 3)
	for (let i = 0; i < a.length; i++) {
		assertClose(rootAB[i], rootA[i] * rootB[i], 1e-13)
	}

	// Nested root: (x^(1/3))^(1/2) == x^(1/6)
	const nested = nthRootTypedSeries(nthRootTypedSeries(a, 3), 2)
	const directSixth = nthRootTypedSeries(a, 6)
	for (let i = 0; i < a.length; i++) {
		assertClose(nested[i], directSixth[i], 1e-13)
	}

	// Reciprocal degree: x^(1/-4) == 1 / x^(1/4)
	const posFourth = nthRootTypedSeries(a, 4)
	const negFourth = nthRootTypedSeries(a, -4)
	for (let i = 0; i < a.length; i++) {
		assertClose(negFourth[i], 1 / posFourth[i], 1e-13)
	}
})

test('invalid inputs: type errors', () => {
	assert.throws(() => nthRootTypedSeries([4, 9], 2), TypeError)
	assert.throws(() => nthRootTypedSeries(new Float32Array([4, 9]), 2), TypeError)
	assert.throws(() => nthRootTypedSeries(null, 2), TypeError)
	assert.throws(() => nthRootTypedSeries(undefined, 2), TypeError)
	assert.throws(() => nthRootTypedSeries(4, 2), TypeError)

	const valid = new Float64Array([4, 9])
	assert.throws(() => nthRootTypedSeries(valid, '2'), TypeError)
	assert.throws(() => nthRootTypedSeries(valid, null), TypeError)
	assert.throws(() => nthRootTypedSeries(valid, undefined), TypeError)
	assert.throws(() => nthRootTypedSeries(valid, [2, 2]), TypeError)
	assert.throws(() => nthRootTypedSeries(valid, new Int32Array([2, 2])), TypeError)
})

test('invalid inputs: range and domain errors', () => {
	// Mismatched lengths
	assert.throws(
		() => nthRootTypedSeries(new Float64Array([4, 9]), new Float64Array([2])),
		RangeError
	)

	// Invalid scalar degrees
	const valid = new Float64Array([4, 9])
	assert.throws(() => nthRootTypedSeries(valid, 0), RangeError)
	assert.throws(() => nthRootTypedSeries(valid, -0), RangeError)
	assert.throws(() => nthRootTypedSeries(valid, Number.NaN), RangeError)
	assert.throws(() => nthRootTypedSeries(valid, Number.POSITIVE_INFINITY), RangeError)
	assert.throws(() => nthRootTypedSeries(valid, Number.NEGATIVE_INFINITY), RangeError)

	// Invalid array degrees
	assert.throws(() => nthRootTypedSeries(valid, new Float64Array([2, 0])), RangeError)
	assert.throws(() => nthRootTypedSeries(valid, new Float64Array([2, Number.NaN])), RangeError)
	assert.throws(() => nthRootTypedSeries(valid, new Float64Array([Infinity, 2])), RangeError)

	// Non-finite radicands
	assert.throws(() => nthRootTypedSeries(new Float64Array([4, Number.NaN]), 2), RangeError)
	assert.throws(() => nthRootTypedSeries(new Float64Array([Infinity, 4]), 2), RangeError)
	assert.throws(() => nthRootTypedSeries(new Float64Array([-Infinity, 4]), 3), RangeError)

	// Negative radicands with even or non-integer degrees
	assert.throws(() => nthRootTypedSeries(new Float64Array([-4]), 2), RangeError)
	assert.throws(() => nthRootTypedSeries(new Float64Array([-16]), 4), RangeError)
	assert.throws(() => nthRootTypedSeries(new Float64Array([-4]), -2), RangeError)
	assert.throws(() => nthRootTypedSeries(new Float64Array([-8]), 2.5), RangeError)
	assert.throws(() => nthRootTypedSeries(new Float64Array([4, -8]), new Float64Array([2, 3.5])), RangeError)

	// Zero radicand with negative degree
	assert.throws(() => nthRootTypedSeries(new Float64Array([0]), -1), RangeError)
	assert.throws(() => nthRootTypedSeries(new Float64Array([0]), -3), RangeError)
	assert.throws(() => nthRootTypedSeries(new Float64Array([4, 0]), new Float64Array([2, -2])), RangeError)
})
