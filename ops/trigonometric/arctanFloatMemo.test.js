import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arctanFloatMemo } from './arctanFloatMemo.js'

const EPS = 1e-15

function assertClose(actual, expected, tol = EPS, msg = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${msg}expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

/**
 * Independent numerical quadrature for arctan(x) = integral_0^x dt / (1 + t^2)
 * using composite Simpson's rule (no Math.atan or Math.tan).
 */
function simpsonArctan(x, steps = 2000) {
	const h = x / steps
	let sum = 1 + 1 / (1 + x * x)
	for (let i = 1; i < steps; i++) {
		const t = i * h
		sum += (i % 2 === 0 ? 2 : 4) / (1 + t * t)
	}
	return (h / 3) * sum
}

describe('arctanFloatMemo', () => {
	test('exact and well-known trigonometric landmarks', () => {
		assertClose(arctanFloatMemo(1), Math.PI / 4)
		assertClose(arctanFloatMemo(-1), -Math.PI / 4)
		assertClose(arctanFloatMemo(Math.sqrt(3)), Math.PI / 3)
		assertClose(arctanFloatMemo(-Math.sqrt(3)), -Math.PI / 3)
		assertClose(arctanFloatMemo(1 / Math.sqrt(3)), Math.PI / 6)
		assertClose(arctanFloatMemo(-1 / Math.sqrt(3)), -Math.PI / 6)
		assertClose(arctanFloatMemo(2 - Math.sqrt(3)), Math.PI / 12)
		assertClose(arctanFloatMemo(2 + Math.sqrt(3)), (5 * Math.PI) / 12)
	})

	test('IEEE-754 special values: signed zeros, infinities, NaN', () => {
		assert.ok(Object.is(arctanFloatMemo(0), 0))
		assert.ok(Object.is(arctanFloatMemo(-0), -0))
		assert.equal(arctanFloatMemo(Infinity), Math.PI / 2)
		assert.equal(arctanFloatMemo(-Infinity), -Math.PI / 2)
		assert.ok(Number.isNaN(arctanFloatMemo(Number.NaN)))
	})

	test('extreme magnitudes, subnormals, and boundary around |x| = 1', () => {
		const smallValues = [
			Number.MIN_VALUE,
			-Number.MIN_VALUE,
			1e-300,
			-1e-300,
			1e-20,
			-1e-20,
			Number.EPSILON,
			-Number.EPSILON,
			1e-8,
			-1e-8,
		]
		for (const x of smallValues) {
			assertClose(arctanFloatMemo(x), Math.atan(x), 1e-15, `small x=${x}: `)
		}

		const largeValues = [
			1e6,
			-1e6,
			1e12,
			-1e12,
			1e100,
			-1e100,
			Number.MAX_VALUE,
			-Number.MAX_VALUE,
		]
		for (const x of largeValues) {
			assertClose(arctanFloatMemo(x), Math.atan(x), 1e-15, `large x=${x}: `)
		}

		const nearOne = [
			1 - 1e-12,
			1 - Number.EPSILON,
			1,
			1 + Number.EPSILON,
			1 + 1e-12,
			-1 + Number.EPSILON,
			-1 - Number.EPSILON,
		]
		for (const x of nearOne) {
			assertClose(arctanFloatMemo(x), Math.atan(x), 1e-15, `nearOne x=${x}: `)
		}
	})

	test('input validation rejects non-number types with TypeError', () => {
		const invalid = [
			undefined,
			null,
			'0',
			'1.5',
			true,
			false,
			{},
			[],
			[1],
			1n,
			Symbol('x'),
			() => 0,
		]
		for (const value of invalid) {
			assert.throws(() => arctanFloatMemo(value), TypeError)
		}
	})

	test('memoization consistency, sign symmetry, and bounded cache eviction', () => {
		const probes = [0.123456789, 0.5, 1.73205, 42.5, 1e-5]
		for (const x of probes) {
			const first = arctanFloatMemo(x)
			const second = arctanFloatMemo(x)
			const neg = arctanFloatMemo(-x)
			assert.ok(Object.is(first, second), `repeated call mismatch for ${x}`)
			assert.ok(Object.is(neg, -first), `odd symmetry mismatch for ${x}`)
		}

		// Exceed cache capacity (4096) to verify bounded eviction preserves accuracy
		for (let i = 1; i <= 5000; i++) {
			const x = i * 0.00137
			assertClose(arctanFloatMemo(x), Math.atan(x), 1e-15)
		}
		// Re-query evicted entry and verify exact agreement
		assertClose(arctanFloatMemo(0.00137), Math.atan(0.00137), 1e-15)
	})

	test('independent cross-check: Math.atan sweep across table nodes, midpoints, and wide range', () => {
		// All 257 table nodes and 256 midpoints in [0, 1]
		for (let k = 0; k <= 256; k++) {
			const node = k / 256
			assertClose(arctanFloatMemo(node), Math.atan(node), 1e-15, `node k=${k}: `)
			assertClose(arctanFloatMemo(-node), Math.atan(-node), 1e-15, `neg node k=${k}: `)
			if (k < 256) {
				const mid = (k + 0.5) / 256
				assertClose(arctanFloatMemo(mid), Math.atan(mid), 1e-15, `mid k=${k}: `)
			}
		}

		// Logarithmic sweep across positive and negative values
		for (let exp = -15; exp <= 15; exp++) {
			for (const mantissa of [1.1, 2.718281828, 5.5, 9.87654321]) {
				const x = mantissa * 10 ** exp
				assertClose(arctanFloatMemo(x), Math.atan(x), 1e-15, `x=${x}: `)
				assertClose(arctanFloatMemo(-x), Math.atan(-x), 1e-15, `x=${-x}: `)
			}
		}
	})

	test('independent cross-check: Machin formula, reciprocal identity, tan inverse, and Simpson quadrature', () => {
		// Machin's formula: 4*atan(1/5) - atan(1/239) = pi/4
		const machin = 4 * arctanFloatMemo(1 / 5) - arctanFloatMemo(1 / 239)
		assertClose(machin, Math.PI / 4, 1e-15, 'Machin formula: ')

		// Reciprocal identity: atan(x) + atan(1/x) = pi/2 for x > 0
		for (const x of [0.01, 0.25, 0.7, 1, 1.5, 3.7, 100]) {
			assertClose(
				arctanFloatMemo(x) + arctanFloatMemo(1 / x),
				Math.PI / 2,
				1e-15,
				`reciprocal x=${x}: `,
			)
		}

		// Inverse tangent identity: tan(atan(x)) == x
		for (const x of [-50, -3.5, -1, -0.25, 0.25, 0.8, 2.5, 10]) {
			const reconstructed = Math.tan(arctanFloatMemo(x))
			assertClose(reconstructed, x, 1e-12 * Math.max(1, Math.abs(x)), `tan(atan(${x})): `)
		}

		// Independent numerical quadrature via Simpson's rule (no Math.atan / Math.tan)
		for (const x of [-3.2, -1.5, -0.4, 0.3, 0.75, 1.25, 4.0]) {
			assertClose(arctanFloatMemo(x), simpsonArctan(x), 1e-12, `Simpson x=${x}: `)
		}

		// Strict monotonicity over ordered finite values
		const ordered = [-1e6, -10, -1, -0.5, -1e-6, 0, 1e-6, 0.5, 1, 10, 1e6]
		for (let i = 1; i < ordered.length; i++) {
			assert.ok(
				arctanFloatMemo(ordered[i - 1]) < arctanFloatMemo(ordered[i]),
				`monotonicity failed between ${ordered[i - 1]} and ${ordered[i]}`,
			)
		}
	})
})
