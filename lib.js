export function add(a, b) {
	return a + b
}

export function doubleIntegral(f, x0, x1, y0, y1, nx = 50, ny = 50) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (
		!Number.isFinite(x0) ||
		!Number.isFinite(x1) ||
		!Number.isFinite(y0) ||
		!Number.isFinite(y1)
	) {
		throw new RangeError('Integration bounds must be finite numbers')
	}
	if (!Number.isInteger(nx) || nx < 1 || !Number.isInteger(ny) || ny < 1) {
		throw new RangeError('Subdivision counts nx and ny must be positive integers')
	}
	if (x0 === x1 || y0 === y1) {
		return 0
	}

	const mx = nx * 2
	const my = ny * 2
	const hx = (x1 - x0) / mx
	const hy = (y1 - y0) / my

	let sum = 0
	for (let i = 0; i <= mx; i++) {
		const wx = i === 0 || i === mx ? 1 : i % 2 === 1 ? 4 : 2
		const x = x0 + i * hx
		let inner = 0
		for (let j = 0; j <= my; j++) {
			const wy = j === 0 || j === my ? 1 : j % 2 === 1 ? 4 : 2
			const y = y0 + j * hy
			inner += wy * f(x, y)
		}
		sum += wx * inner
	}

	const result = (sum * hx * hy) / 9
	return result === 0 ? 0 : result
}
