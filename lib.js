export function add(a, b) {
	return a + b
}

export function tripleIntegral(f, x0, x1, y0, y1, z0, z1, n = 20) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (
		!Number.isFinite(x0) ||
		!Number.isFinite(x1) ||
		!Number.isFinite(y0) ||
		!Number.isFinite(y1) ||
		!Number.isFinite(z0) ||
		!Number.isFinite(z1)
	) {
		throw new TypeError('integration bounds must be finite numbers')
	}
	if (!Number.isInteger(n) || n < 1) {
		throw new RangeError('n must be a positive integer')
	}

	if (x0 === x1 || y0 === y1 || z0 === z1) {
		return 0
	}

	const hx = (x1 - x0) / n
	const hy = (y1 - y0) / n
	const hz = (z1 - z0) / n

	let sum = 0
	for (let i = 0; i < n; i++) {
		const x = x0 + (i + 0.5) * hx
		for (let j = 0; j < n; j++) {
			const y = y0 + (j + 0.5) * hy
			for (let k = 0; k < n; k++) {
				const z = z0 + (k + 0.5) * hz
				sum += f(x, y, z)
			}
		}
	}

	return sum * hx * hy * hz
}
