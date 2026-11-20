export function add(a, b) {
	return a + b
}

const SQRT_70 = Math.sqrt(70)
const GL5_X1 = Math.sqrt(5 - 2 * Math.sqrt(10 / 7)) / 3
const GL5_X2 = Math.sqrt(5 + 2 * Math.sqrt(10 / 7)) / 3
const GL5_W0 = 128 / 225
const GL5_W1 = (322 + 13 * SQRT_70) / 900
const GL5_W2 = (322 - 13 * SQRT_70) / 900

export function gaussLegendre5(f, a, b) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (
		typeof a !== 'number' ||
		typeof b !== 'number' ||
		!Number.isFinite(a) ||
		!Number.isFinite(b)
	) {
		throw new RangeError('a and b must be finite numbers')
	}
	if (a === b) return 0

	const mid = (a + b) / 2
	const half = (b - a) / 2
	const dx1 = half * GL5_X1
	const dx2 = half * GL5_X2

	return (
		half *
		(GL5_W0 * f(mid) +
			GL5_W1 * (f(mid - dx1) + f(mid + dx1)) +
			GL5_W2 * (f(mid - dx2) + f(mid + dx2)))
	)
}
