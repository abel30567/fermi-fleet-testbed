import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { subtractComplexLazy } from './subtractComplexLazy.js'

describe('subtractComplexLazy', () => {
	test('subtracts two arrays of complex numbers', () => {
		const a = [
			{ re: 5, im: 3 },
			{ re: -2, im: 7 },
			{ re: 0, im: 0 },
		]
		const b = [
			{ re: 2, im: 1 },
			{ re: 4, im: -3 },
			{ re: 1.5, im: -2.5 },
		]

		const result = [...subtractComplexLazy(a, b)]
		assert.deepEqual(result, [
			{ re: 3, im: 2 },
			{ re: -6, im: 10 },
			{ re: -1.5, im: 2.5 },
		])
	})

	test('subtracts two scalar complex numbers as a single-element stream', () => {
		const result = [...subtractComplexLazy({ re: 7, im: -4 }, { re: 3, im: 2 })]
		assert.deepEqual(result, [{ re: 4, im: -6 }])
	})

	test('broadcasts scalar subtrahend over an iterable minuend', () => {
		const seq = [
			{ re: 1, im: 2 },
			{ re: 3, im: 4 },
			{ re: 5, im: 6 },
		]
		const offset = { re: 1, im: 1 }
		assert.deepEqual([...subtractComplexLazy(seq, offset)], [
			{ re: 0, im: 1 },
			{ re: 2, im: 3 },
			{ re: 4, im: 5 },
		])
	})

	test('broadcasts scalar minuend over an iterable subtrahend', () => {
		const base = { re: 10, im: 10 }
		const seq = new Set([
			{ re: 1, im: 2 },
			{ re: 4, im: 6 },
		])
		assert.deepEqual([...subtractComplexLazy(base, seq)], [
			{ re: 9, im: 8 },
			{ re: 6, im: 4 },
		])
	})

	test('consumes infinite generators lazily without exhausting them', () => {
		let pulledA = 0
		let pulledB = 0
		let closedA = false
		let closedB = false

		function* genA() {
			try {
				let i = 1
				while (true) {
					pulledA++
					yield { re: i * 10, im: i }
					i++
				}
			} finally {
				closedA = true
			}
		}

		function* genB() {
			try {
				let i = 1
				while (true) {
					pulledB++
					yield { re: i, im: i * 2 }
					i++
				}
			} finally {
				closedB = true
			}
		}

		const stream = subtractComplexLazy(genA(), genB())
		// Nothing should be pulled before first .next()
		assert.equal(pulledA, 0)
		assert.equal(pulledB, 0)

		const taken = []
		for (const item of stream) {
			taken.push(item)
			if (taken.length === 3) break
		}

		assert.deepEqual(taken, [
			{ re: 9, im: -1 },
			{ re: 18, im: -2 },
			{ re: 27, im: -3 },
		])
		assert.equal(pulledA, 3)
		assert.equal(pulledB, 3)
		assert.equal(closedA, true)
		assert.equal(closedB, true)
	})

	test('stops at the shorter iterable and cleans up the longer one', () => {
		let closedLong = false
		let pulledLong = 0

		function* longGen() {
			try {
				for (let i = 0; i < 100; i++) {
					pulledLong++
					yield { re: i, im: i }
				}
			} finally {
				closedLong = true
			}
		}

		const shortArr = [
			{ re: 10, im: 20 },
			{ re: 30, im: 40 },
		]

		const result = [...subtractComplexLazy(shortArr, longGen())]
		assert.deepEqual(result, [
			{ re: 10, im: 20 },
			{ re: 29, im: 39 },
		])
		// When shortArr finishes on the 3rd iteration, longGen is not pulled a 3rd time
		assert.equal(pulledLong, 2)
		assert.equal(closedLong, true)
	})

	test('handles empty iterables and normalizes -0 to 0', () => {
		assert.deepEqual([...subtractComplexLazy([], [{ re: 1, im: 2 }])], [])
		assert.deepEqual([...subtractComplexLazy([{ re: 1, im: 2 }], [])], [])
		assert.deepEqual([...subtractComplexLazy([], { re: 1, im: 2 })], [])

		const [zero] = [...subtractComplexLazy({ re: -0, im: -0 }, { re: 0, im: 0 })]
		assert.equal(Object.is(zero.re, 0), true)
		assert.equal(Object.is(zero.im, 0), true)
	})

	test('validates top-level inputs eagerly', () => {
		assert.throws(() => subtractComplexLazy(null, { re: 0, im: 0 }), TypeError)
		assert.throws(() => subtractComplexLazy({ re: 0, im: 0 }, undefined), TypeError)
		assert.throws(() => subtractComplexLazy('1+2i', { re: 0, im: 0 }), TypeError)
		assert.throws(() => subtractComplexLazy(42, { re: 0, im: 0 }), TypeError)
		assert.throws(() => subtractComplexLazy({ re: 1 }, { re: 0, im: 0 }), TypeError)
		assert.throws(() => subtractComplexLazy({ re: '1', im: 2 }, { re: 0, im: 0 }), TypeError)
		assert.throws(() => subtractComplexLazy({ re: NaN, im: 0 }, { re: 0, im: 0 }), RangeError)
		assert.throws(() => subtractComplexLazy({ re: 0, im: Infinity }, { re: 0, im: 0 }), RangeError)
		assert.throws(() => subtractComplexLazy({ re: 0, im: 0 }, { re: -Infinity, im: 0 }), RangeError)
	})

	test('validates stream elements lazily and cleans up on error', () => {
		let closedB = false
		function* genB() {
			try {
				yield { re: 1, im: 1 }
				yield { re: 2, im: 2 }
				yield { re: 3, im: 3 }
			} finally {
				closedB = true
			}
		}

		const badA = [{ re: 5, im: 5 }, { re: NaN, im: 0 }, { re: 9, im: 9 }]
		const stream = subtractComplexLazy(badA, genB())

		assert.deepEqual(stream.next(), { value: { re: 4, im: 4 }, done: false })
		assert.throws(() => stream.next(), RangeError)
		assert.equal(closedB, true)
	})

	test('independent cross-check: algebraic identities and Law of Cosines in polar form', () => {
		const pairs = [
			[
				{ re: 3, im: 4 },
				{ re: -1, im: 2 },
			],
			[
				{ re: -5.5, im: -2.25 },
				{ re: 7.25, im: -8.5 },
			],
			[
				{ re: 12, im: -9 },
				{ re: 12, im: -9 },
			],
			[
				{ re: 0.1, im: 0.2 },
				{ re: 0.3, im: -0.4 },
			],
		]

		const a = pairs.map(([x]) => x)
		const b = pairs.map(([, y]) => y)

		const diffs = [...subtractComplexLazy(a, b)]
		const reversed = [...subtractComplexLazy(b, a)]
		const selfDiffs = [...subtractComplexLazy(a, a)]
		const conjDiffs = [
			...subtractComplexLazy(
				a.map(({ re, im }) => ({ re, im: -im })),
				b.map(({ re, im }) => ({ re, im: -im })),
			),
		]

		for (let i = 0; i < pairs.length; i++) {
			const z1 = a[i]
			const z2 = b[i]
			const d = diffs[i]

			// 1. Round-trip reconstruction: (z1 - z2) + z2 === z1
			assert.ok(Math.abs(d.re + z2.re - z1.re) < 1e-12)
			assert.ok(Math.abs(d.im + z2.im - z1.im) < 1e-12)

			// 2. Anti-commutativity: z1 - z2 === -(z2 - z1)
			assert.equal(d.re, reversed[i].re === 0 ? 0 : -reversed[i].re)
			assert.equal(d.im, reversed[i].im === 0 ? 0 : -reversed[i].im)

			// 3. Self-subtraction yields additive identity (0 + 0i)
			assert.deepEqual(selfDiffs[i], { re: 0, im: 0 })

			// 4. Conjugation homomorphism: conj(z1 - z2) === conj(z1) - conj(z2)
			assert.equal(conjDiffs[i].re, d.re)
			assert.equal(conjDiffs[i].im, d.im === 0 ? 0 : -d.im)

			// 5. Independent polar / Law of Cosines modulus-squared check:
			// |z1 - z2|^2 === |z1|^2 + |z2|^2 - 2|z1||z2|cos(arg(z1) - arg(z2))
			const r1 = Math.hypot(z1.re, z1.im)
			const r2 = Math.hypot(z2.re, z2.im)
			const theta1 = Math.atan2(z1.im, z1.re)
			const theta2 = Math.atan2(z2.im, z2.re)
			const expectedModSq = r1 * r1 + r2 * r2 - 2 * r1 * r2 * Math.cos(theta1 - theta2)
			const actualModSq = d.re * d.re + d.im * d.im
			assert.ok(Math.abs(actualModSq - expectedModSq) < 1e-10)
		}
	})
})
