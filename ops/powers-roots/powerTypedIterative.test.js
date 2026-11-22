import { test } from 'node:test'
import assert from 'node:assert/strict'
import { powerTypedIterative } from './powerTypedIterative.js'

/**
 * Independent reference implementation for integer exponents using
 * exponentiation by squaring (binary exponentiation).
 */
function intPowBySquaring(base, exp) {
	if (exp === 0) return 1
	let negative = false
	let e = exp
	if (e < 0) {
		negative = true
		e = -e
	}
	let acc = 1
	let factor = base
	while (e > 0) {
		if ((e & 1) === 1) {
			acc *= factor
		}
		factor *= factor
		e >>= 1
	}
	return negative ? 1 / acc : acc
}

test('powerTypedIterative computes element-wise powers for typical values', () => {
	const bases = new Float64Array([2, 3, 4, 9, 10, -2, -2])
	const exponents = new Float64Array([3, 2, 0.5, -0.5, 0, 3, 4])

	const out = powerTypedIterative(bases, exponents)

	assert.ok(out instanceof Float64Array)
	assert.equal(out.length, bases.length)
	assert.deepEqual(Array.from(out), [8, 9, 2, 1 / 3, 1, -8, 16])
})

test('powerTypedIterative does not mutate input arrays and returns a new Float64Array', () => {
	const bases = new Float64Array([2, 5, 7])
	const exponents = new Float64Array([3, 2, 1])

	const out = powerTypedIterative(bases, exponents)

	assert.notEqual(out, bases)
	assert.notEqual(out, exponents)
	assert.deepEqual(Array.from(bases), [2, 5, 7])
	assert.deepEqual(Array.from(exponents), [3, 2, 1])
})

test('powerTypedIterative handles empty Float64Array inputs', () => {
	const emptyBases = new Float64Array(0)
	const emptyExponents = new Float64Array(0)

	const out = powerTypedIterative(emptyBases, emptyExponents)

	assert.ok(out instanceof Float64Array)
	assert.equal(out.length, 0)
	assert.notEqual(out, emptyBases)
})

test('powerTypedIterative handles Float64Array subarray views with non-zero byteOffset', () => {
	const buffer = new ArrayBuffer(6 * Float64Array.BYTES_PER_ELEMENT)
	const full = new Float64Array(buffer)
	full.set([99, 2, 3, 4, 2, 3])

	const basesView = new Float64Array(buffer, Float64Array.BYTES_PER_ELEMENT, 3) // [2, 3, 4]
	const expView = new Float64Array(buffer, 3 * Float64Array.BYTES_PER_ELEMENT, 3) // [4, 2, 3]

	const out = powerTypedIterative(basesView, expView)
	assert.deepEqual(Array.from(out), [16, 9, 64])
})

test('powerTypedIterative handles special IEEE 754 values and boundaries', () => {
	const bases = new Float64Array([
		0,
		0,
		-0,
		-2,
		Infinity,
		Infinity,
		1,
		NaN,
		NaN,
		1e200,
		1e-200
	])
	const exponents = new Float64Array([
		0,
		-1,
		-3,
		0.5,
		2,
		-1,
		Infinity,
		2,
		0,
		2,
		2
	])

	const out = powerTypedIterative(bases, exponents)

	assert.equal(out[0], 1) // 0^0 === 1
	assert.equal(out[1], Infinity) // 0^-1 === Infinity
	assert.equal(out[2], -Infinity) // (-0)^-3 === -Infinity
	assert.ok(Number.isNaN(out[3])) // (-2)^0.5 === NaN
	assert.equal(out[4], Infinity) // Infinity^2 === Infinity
	assert.equal(out[5], 0) // Infinity^-1 === 0
	assert.ok(Number.isNaN(out[6])) // 1^Infinity === NaN per IEEE 754 / ECMAScript
	assert.ok(Number.isNaN(out[7])) // NaN^2 === NaN
	assert.equal(out[8], 1) // NaN^0 === 1
	assert.equal(out[9], Infinity) // overflow to Infinity
	assert.equal(out[10], 0) // underflow to 0
})

test('powerTypedIterative throws TypeError on non-Float64Array inputs', () => {
	const valid = new Float64Array([1, 2])
	const invalidInputs = [
		null,
		undefined,
		[1, 2],
		new Float32Array([1, 2]),
		new Int32Array([1, 2]),
		'12',
		42,
		{ 0: 1, 1: 2, length: 2 }
	]

	for (const bad of invalidInputs) {
		assert.throws(() => powerTypedIterative(bad, valid), TypeError)
		assert.throws(() => powerTypedIterative(valid, bad), TypeError)
	}
})

test('powerTypedIterative throws RangeError when input lengths differ', () => {
	const shortArr = new Float64Array([1, 2])
	const longArr = new Float64Array([1, 2, 3])

	assert.throws(() => powerTypedIterative(shortArr, longArr), RangeError)
	assert.throws(() => powerTypedIterative(longArr, shortArr), RangeError)
})

test('cross-check: matches exp(b * ln(a)) and algebraic power identities for positive bases', () => {
	const a = new Float64Array([0.25, 0.5, 1.5, 2.5, Math.E, Math.PI, 7.25])
	const b = new Float64Array([-2.3, -0.5, 0.25, 1.4, 2.0, 3.1, -1.75])
	const c = new Float64Array([1.1, 2.5, -0.75, 0.6, -1.5, 0.5, 2.25])

	const ab = powerTypedIterative(a, b)
	const ac = powerTypedIterative(a, c)
	const bPlusC = new Float64Array(a.length)
	const bTimesC = new Float64Array(a.length)
	const invB = new Float64Array(a.length)

	for (let i = 0; i < a.length; i += 1) {
		bPlusC[i] = b[i] + c[i]
		bTimesC[i] = b[i] * c[i]
		invB[i] = 1 / b[i]
	}

	const aPowBPlusC = powerTypedIterative(a, bPlusC)
	const abPowC = powerTypedIterative(ab, c)
	const aPowBTimesC = powerTypedIterative(a, bTimesC)
	const recoveredA = powerTypedIterative(ab, invB)

	for (let i = 0; i < a.length; i += 1) {
		// Analytical identity: a^b = exp(b * ln(a))
		const expLogRef = Math.exp(b[i] * Math.log(a[i]))
		assert.ok(
			Math.abs(ab[i] - expLogRef) <= 1e-12 * Math.max(1, Math.abs(expLogRef)),
			`exp(b*ln(a)) mismatch at ${i}: ${ab[i]} vs ${expLogRef}`
		)

		// Product rule: a^b * a^c = a^(b + c)
		const product = ab[i] * ac[i]
		assert.ok(
			Math.abs(product - aPowBPlusC[i]) <= 1e-12 * Math.max(1, Math.abs(aPowBPlusC[i])),
			`a^b * a^c mismatch at ${i}: ${product} vs ${aPowBPlusC[i]}`
		)

		// Power of power: (a^b)^c = a^(b * c)
		assert.ok(
			Math.abs(abPowC[i] - aPowBTimesC[i]) <= 1e-12 * Math.max(1, Math.abs(aPowBTimesC[i])),
			`(a^b)^c mismatch at ${i}: ${abPowC[i]} vs ${aPowBTimesC[i]}`
		)

		// Inverse operation: (a^b)^(1/b) = a
		assert.ok(
			Math.abs(recoveredA[i] - a[i]) <= 1e-12 * Math.max(1, Math.abs(a[i])),
			`(a^b)^(1/b) mismatch at ${i}: ${recoveredA[i]} vs ${a[i]}`
		)
	}
})

test('cross-check: matches binary exponentiation for integer exponents', () => {
	const bases = new Float64Array([-3, -2, -1, 0.5, 1, 2, 3, 5, 1.5])
	const exponents = new Float64Array([5, 4, 7, -3, 10, 12, 0, -2, 6])

	const out = powerTypedIterative(bases, exponents)

	for (let i = 0; i < bases.length; i += 1) {
		const ref = intPowBySquaring(bases[i], exponents[i])
		assert.ok(
			Math.abs(out[i] - ref) <= 1e-12 * Math.max(1, Math.abs(ref)),
			`binary exponentiation mismatch at ${i}: ${out[i]} vs ${ref}`
		)
	}
})
