import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fourierTransformDecimalIterative } from './fourierTransformDecimalIterative.js'

/**
 * Helper to convert a fixed-precision decimal string into a scaled BigInt.
 */
function decimalToScaledBigInt(str, precision) {
	const neg = str.startsWith('-')
	const body = neg ? str.slice(1) : str
	const [intPart, fracPart = ''] = body.split('.')
	const paddedFrac = fracPart.padEnd(precision, '0').slice(0, precision)
	const mag = BigInt(intPart + paddedFrac)
	return neg ? -mag : mag
}

/**
 * Independent IEEE-754 floating-point DFT for cross-checking against the
 * arbitrary-precision BigInt implementation.
 */
function referenceFloatDft(samples, inverse = false) {
	const n = samples.length
	const sign = inverse ? 1 : -1
	const out = []
	for (let k = 0; k < n; k++) {
		let sumRe = 0
		let sumIm = 0
		for (let j = 0; j < n; j++) {
			const s = samples[j]
			const a = typeof s === 'string' ? Number(s) : Number(s.re)
			const b = typeof s === 'string' ? 0 : Number(s.im ?? '0')
			const angle = (2 * Math.PI * k * j) / n
			const c = Math.cos(angle)
			const sn = sign * Math.sin(angle)
			sumRe += a * c - b * sn
			sumIm += a * sn + b * c
		}
		if (inverse) {
			sumRe /= n
			sumIm /= n
		}
		out.push({ re: sumRe, im: sumIm })
	}
	return out
}

test('exact closed-form DFT for N = 1, 2, 4', () => {
	assert.deepEqual(fourierTransformDecimalIterative(['42.125'], 4), [
		{ re: '42.1250', im: '0.0000' },
	])

	assert.deepEqual(fourierTransformDecimalIterative(['3.5', '-1.25'], 3), [
		{ re: '2.250', im: '0.000' },
		{ re: '4.750', im: '0.000' },
	])

	assert.deepEqual(fourierTransformDecimalIterative(['1', '2', '3', '4'], 6), [
		{ re: '10.000000', im: '0.000000' },
		{ re: '-2.000000', im: '2.000000' },
		{ re: '-2.000000', im: '0.000000' },
		{ re: '-2.000000', im: '-2.000000' },
	])
})

test('edge cases: empty input, all zeros, precision 0, scientific notation, large magnitudes', () => {
	assert.deepEqual(fourierTransformDecimalIterative([]), [])

	assert.deepEqual(fourierTransformDecimalIterative(['0', '-0.0', '0.000', '0'], 4), [
		{ re: '0.0000', im: '0.0000' },
		{ re: '0.0000', im: '0.0000' },
		{ re: '0.0000', im: '0.0000' },
		{ re: '0.0000', im: '0.0000' },
	])

	assert.deepEqual(fourierTransformDecimalIterative(['1.2', '2.3', '3.4', '4.1'], 0), [
		{ re: '11', im: '0' },
		{ re: '-2', im: '2' },
		{ re: '-2', im: '0' },
		{ re: '-2', im: '-2' },
	])

	// Scientific notation and omitted im in complex object
	const sciOut = fourierTransformDecimalIterative([{ re: '1.5e-2' }, { re: '2.5e-2', im: '-1e-2' }], 4)
	assert.deepEqual(sciOut, [
		{ re: '0.0400', im: '-0.0100' },
		{ re: '-0.0100', im: '0.0100' },
	])

	// Large-magnitude input (1e30) preserves precision at the fractional digits
	const bigOut = fourierTransformDecimalIterative(['1e30', '0', '1e30', '0'], 6)
	assert.deepEqual(bigOut, [
		{ re: '2000000000000000000000000000000.000000', im: '0.000000' },
		{ re: '0.000000', im: '0.000000' },
		{ re: '2000000000000000000000000000000.000000', im: '0.000000' },
		{ re: '0.000000', im: '0.000000' },
	])
})

test('arbitrary precision (50 decimal digits) algebraic cross-checks for N = 3, 5, 8', () => {
	const precision = 50
	const scale = 10n ** BigInt(precision)

	// N = 3 impulse at n=1: X[1] = (-1/2, -sqrt(3)/2)
	const dft3 = fourierTransformDecimalIterative(['0', '1', '0'], precision)
	assert.equal(dft3[1].re, `-0.5${'0'.repeat(precision - 1)}`)
	const im3 = decimalToScaledBigInt(dft3[1].im, precision)
	assert.ok(im3 < 0n)
	// Check (2 * im)^2 == 3 to within 10 ULPs of 10^50
	const lhs3 = (2n * im3) * (2n * im3)
	const rhs3 = 3n * scale * scale
	assert.ok((lhs3 > rhs3 ? lhs3 - rhs3 : rhs3 - lhs3) < 20n * scale)

	// N = 8 impulse at n=1: X[1] = (sqrt(2)/2, -sqrt(2)/2)
	const dft8 = fourierTransformDecimalIterative(['0', '1', '0', '0', '0', '0', '0', '0'], precision)
	const re8 = decimalToScaledBigInt(dft8[1].re, precision)
	const im8 = decimalToScaledBigInt(dft8[1].im, precision)
	assert.equal(re8, -im8)
	const lhs8 = 2n * re8 * re8
	const rhs8 = scale * scale
	assert.ok((lhs8 > rhs8 ? lhs8 - rhs8 : rhs8 - lhs8) < 20n * scale)

	// N = 5 impulse at n=1: cos(2*pi/5) = (sqrt(5) - 1) / 4 => (4*re + 1)^2 = 5
	const dft5 = fourierTransformDecimalIterative(['0', '1', '0', '0', '0'], precision)
	const re5 = decimalToScaledBigInt(dft5[1].re, precision)
	const expr5 = 4n * re5 + scale
	const lhs5 = expr5 * expr5
	const rhs5 = 5n * scale * scale
	assert.ok((lhs5 > rhs5 ? lhs5 - rhs5 : rhs5 - lhs5) < 50n * scale)
})

test('independent cross-check against IEEE-754 floating-point DFT for non-power-of-two complex signal', () => {
	const samples = [
		{ re: '1.25', im: '-0.5' },
		{ re: '-3.75', im: '2.125' },
		{ re: '0.1', im: '0.2' },
		{ re: '4.5', im: '-1.8' },
		{ re: '-0.333', im: '0.777' },
		{ re: '2.0', im: '0.0' },
		{ re: '-1.1', im: '-2.2' },
	]
	const actual = fourierTransformDecimalIterative(samples, 25)
	const expected = referenceFloatDft(samples, false)

	assert.equal(actual.length, expected.length)
	for (let k = 0; k < expected.length; k++) {
		assert.ok(Math.abs(Number(actual[k].re) - expected[k].re) < 1e-12)
		assert.ok(Math.abs(Number(actual[k].im) - expected[k].im) < 1e-12)
	}
})

test('forward and inverse DFT round-trip at 40-digit precision', () => {
	const input = [
		{ re: '1.2345678901234567890123456789012345678901', im: '-0.9876543210987654321098765432109876543210' },
		{ re: '-3.1415926535897932384626433832795028841971', im: '2.7182818284590452353602874713526624977572' },
		{ re: '0.0000000000000000000000000000000000000001', im: '100.5000000000000000000000000000000000000000' },
		{ re: '42.0000000000000000000000000000000000000000', im: '0.0000000000000000000000000000000000000000' },
		{ re: '-7.5000000000000000000000000000000000000000', im: '-1.2500000000000000000000000000000000000000' },
	]
	// Compute intermediate spectrum with extra precision, then invert back to 40 digits.
	const spectrum = fourierTransformDecimalIterative(input, 45)
	const recovered = fourierTransformDecimalIterative(spectrum, 40, { inverse: true })

	assert.deepEqual(recovered, input)
})

test('Parseval energy conservation theorem verified at high precision', () => {
	const precision = 35
	const scale = 10n ** BigInt(precision)
	const samples = ['1.5', '-2.25', '0.75', '3.125', '-0.5', '4.0']
	const spectrum = fourierTransformDecimalIterative(samples, precision)

	let timeEnergy = 0n
	for (const s of samples) {
		const v = decimalToScaledBigInt(s, precision)
		timeEnergy += v * v
	}

	let freqEnergySum = 0n
	for (const bin of spectrum) {
		const re = decimalToScaledBigInt(bin.re, precision)
		const im = decimalToScaledBigInt(bin.im, precision)
		freqEnergySum += re * re + im * im
	}

	// timeEnergy * N should equal freqEnergySum within tiny rounding tolerance
	const lhs = timeEnergy * BigInt(samples.length)
	const diff = lhs > freqEnergySum ? lhs - freqEnergySum : freqEnergySum - lhs
	assert.ok(diff < 1000n * scale)
})

test('linearity property of DFT', () => {
	const x = ['1.2', '-0.4', '2.5', '0.3', '-1.1']
	const y = ['-0.7', '3.1', '0.0', '-2.2', '1.8']
	// z = 2*x - 3*y
	const z = ['4.5', '-10.1', '5.0', '7.2', '-7.6']
	const precision = 20

	const dx = fourierTransformDecimalIterative(x, precision)
	const dy = fourierTransformDecimalIterative(y, precision)
	const dz = fourierTransformDecimalIterative(z, precision)

	for (let k = 0; k < z.length; k++) {
		const combRe =
			2n * decimalToScaledBigInt(dx[k].re, precision) -
			3n * decimalToScaledBigInt(dy[k].re, precision)
		const combIm =
			2n * decimalToScaledBigInt(dx[k].im, precision) -
			3n * decimalToScaledBigInt(dy[k].im, precision)
		const dzRe = decimalToScaledBigInt(dz[k].re, precision)
		const dzIm = decimalToScaledBigInt(dz[k].im, precision)
		assert.ok((combRe > dzRe ? combRe - dzRe : dzRe - combRe) <= 5n)
		assert.ok((combIm > dzIm ? combIm - dzIm : dzIm - combIm) <= 5n)
	}
})

test('input validation rejects invalid arguments', () => {
	assert.throws(() => fourierTransformDecimalIterative('123'), TypeError)
	assert.throws(() => fourierTransformDecimalIterative(null), TypeError)
	assert.throws(() => fourierTransformDecimalIterative([1, 2, 3]), TypeError)
	assert.throws(() => fourierTransformDecimalIterative([{ re: 1, im: '0' }]), TypeError)
	assert.throws(() => fourierTransformDecimalIterative([{ re: '1', im: 2 }]), TypeError)
	assert.throws(() => fourierTransformDecimalIterative([null]), TypeError)
	assert.throws(() => fourierTransformDecimalIterative(['NaN']), RangeError)
	assert.throws(() => fourierTransformDecimalIterative(['Infinity']), RangeError)
	assert.throws(() => fourierTransformDecimalIterative(['']), RangeError)
	assert.throws(() => fourierTransformDecimalIterative(['1.2.3']), RangeError)
	assert.throws(() => fourierTransformDecimalIterative(['1'], -1), RangeError)
	assert.throws(() => fourierTransformDecimalIterative(['1'], 2.5), RangeError)
	assert.throws(() => fourierTransformDecimalIterative(['1'], NaN), RangeError)
	assert.throws(() => fourierTransformDecimalIterative(['1'], '10'), RangeError)
	assert.throws(() => fourierTransformDecimalIterative(['1'], 5, null), TypeError)
	assert.throws(() => fourierTransformDecimalIterative(['1'], 5, []), TypeError)
	assert.throws(() => fourierTransformDecimalIterative(['1'], 5, { inverse: 'yes' }), TypeError)
})
