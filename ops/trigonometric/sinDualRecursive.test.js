import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sinDualRecursive } from './sinDualRecursive.js'

const EPS = 1e-13

function assertClose(actual, expected, tol = EPS, label = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
	)
}

describe('sinDualRecursive', () => {
	test('evaluates canonical angles and derivatives accurately', () => {
		const cases = [
			{ v: 0, d: 1, expV: 0, expD: 1 },
			{ v: 0, d: 0, expV: 0, expD: 0 },
			{ v: 0, d: -3.5, expV: 0, expD: -3.5 },
			{ v: Math.PI / 6, d: 1, expV: 0.5, expD: Math.sqrt(3) / 2 },
			{ v: Math.PI / 4, d: 2, expV: Math.SQRT1_2, expD: 2 * Math.SQRT1_2 },
			{ v: Math.PI / 3, d: 1, expV: Math.sqrt(3) / 2, expD: 0.5 },
			{ v: Math.PI / 2, d: 1, expV: 1, expD: 0 },
			{ v: Math.PI, d: 1, expV: 0, expD: -1 },
			{ v: (3 * Math.PI) / 2, d: 1, expV: -1, expD: 0 },
			{ v: 2 * Math.PI, d: 1, expV: 0, expD: 1 },
		]

		for (const { v, d, expV, expD } of cases) {
			const res = sinDualRecursive({ v, d })
			assertClose(res.v, expV, EPS, `sin(${v}).v`)
			assertClose(res.d, expD, EPS, `sin(${v}).d`)
		}
	})

	test('handles small angles within base case and across recursion boundary', () => {
		const angles = [0, 1e-12, 1e-8, 1e-5, 1 / 16, 1 / 15, 0.1, -1e-9, -1 / 16, -0.1]
		for (const v of angles) {
			const d = 1.75
			const res = sinDualRecursive({ v, d })
			assertClose(res.v, Math.sin(v), EPS, `small v=${v} value`)
			assertClose(res.d, Math.cos(v) * d, EPS, `small v=${v} derivative`)
		}
	})

	test('handles negative angles and satisfies odd symmetry', () => {
		const angles = [-0.25, -Math.PI / 4, -Math.PI / 2, -Math.PI, -2.7, -10.5]
		for (const v of angles) {
			const d = 2.3
			const neg = sinDualRecursive({ v, d })
			const pos = sinDualRecursive({ v: -v, d })
			assertClose(neg.v, Math.sin(v), EPS, `neg v=${v} value`)
			assertClose(neg.d, Math.cos(v) * d, EPS, `neg v=${v} derivative`)
			// sin(-x) = -sin(x), cos(-x) = cos(x)
			assertClose(neg.v, -pos.v, EPS, `odd symmetry v=${v}`)
			assertClose(neg.d, pos.d, EPS, `even derivative symmetry v=${v}`)
		}
	})

	test('handles large positive and negative angles via extended range reduction', () => {
		const largeAngles = [100, -100, 1e4, -1e4, 1e6, -1e6, 1e8, -1e8]
		for (const v of largeAngles) {
			const d = -0.75
			const res = sinDualRecursive({ v, d })
			assertClose(res.v, Math.sin(v), 1e-10, `large v=${v} value`)
			assertClose(res.d, Math.cos(v) * d, 1e-10, `large v=${v} derivative`)
		}
	})

	test('satisfies chain rule for non-unit tangent d and composite inputs', () => {
		// f(t) = sin(3t^2 + 1) at t = 0.8 -> g(t) = 3t^2 + 1, g'(t) = 6t
		const t = 0.8
		const g = { v: 3 * t * t + 1, d: 6 * t }
		const res = sinDualRecursive(g)
		assertClose(res.v, Math.sin(g.v), EPS, 'chain rule value')
		assertClose(res.d, Math.cos(g.v) * g.d, EPS, 'chain rule derivative')

		// Nested composition: sin(sin(x)) at x = 1.1
		const x = { v: 1.1, d: 1 }
		const inner = sinDualRecursive(x)
		const outer = sinDualRecursive(inner)
		assertClose(outer.v, Math.sin(Math.sin(1.1)), EPS, 'nested sin value')
		assertClose(outer.d, Math.cos(Math.sin(1.1)) * Math.cos(1.1), EPS, 'nested sin derivative')
	})

	test('cross-checks derivative against central finite differences', () => {
		const h = 1e-5
		const testPoints = [-4.2, -1.5, -0.3, 0, 0.42, 1.23, 2.71, 5.1]
		for (const v of testPoints) {
			const d = 1.5
			const res = sinDualRecursive({ v, d })
			const fPlus = sinDualRecursive({ v: v + h, d: 0 }).v
			const fMinus = sinDualRecursive({ v: v - h, d: 0 }).v
			const finiteDiff = ((fPlus - fMinus) / (2 * h)) * d
			assertClose(res.d, finiteDiff, 1e-9, `central finite diff at v=${v}`)
		}
	})

	test('cross-checks dense sweep against Math.sin and Math.cos', () => {
		for (let i = -50; i <= 50; i++) {
			const v = i * 0.37
			const d = (i % 7) - 3
			const res = sinDualRecursive({ v, d })
			assertClose(res.v, Math.sin(v), EPS, `sweep v=${v} value`)
			assertClose(res.d, Math.cos(v) * d, EPS, `sweep v=${v} derivative`)
		}
	})

	test('does not mutate input object', () => {
		const input = { v: 1.25, d: 2.5 }
		const snapshot = { ...input }
		sinDualRecursive(input)
		assert.deepEqual(input, snapshot)
	})

	test('validates invalid inputs strictly', () => {
		const typeErrorInputs = [
			undefined,
			null,
			42,
			'1.0',
			true,
			[1, 2],
			{},
			{ v: 1 },
			{ d: 1 },
			{ v: '1', d: 1 },
			{ v: 1, d: '1' },
			{ v: null, d: 1 },
			{ v: 1, d: undefined },
		]
		for (const bad of typeErrorInputs) {
			assert.throws(() => sinDualRecursive(bad), TypeError, `Expected TypeError for ${String(bad)}`)
		}

		const rangeErrorInputs = [
			{ v: Number.NaN, d: 1 },
			{ v: 1, d: Number.NaN },
			{ v: Number.POSITIVE_INFINITY, d: 1 },
			{ v: Number.NEGATIVE_INFINITY, d: 1 },
			{ v: 1, d: Number.POSITIVE_INFINITY },
			{ v: 1, d: Number.NEGATIVE_INFINITY },
		]
		for (const bad of rangeErrorInputs) {
			assert.throws(() => sinDualRecursive(bad), RangeError, `Expected RangeError for ${JSON.stringify(bad)}`)
		}
	})
})
