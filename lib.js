export function add(a, b) {
	return a + b
}

export function fluxIntegralZ(F, g, x0, x1, y0, y1, nx = 30, ny = 30) {
	if (typeof F !== 'function' || typeof g !== 'function') {
		throw new TypeError('F and g must be functions')
	}
	if (!Number.isInteger(nx) || nx <= 0 || !Number.isInteger(ny) || ny <= 0) {
		throw new RangeError('nx and ny must be positive integers')
	}
	if (x0 === x1 || y0 === y1) {
		return 0
	}

	const dx = (x1 - x0) / nx
	const dy = (y1 - y0) / ny
	const offset = 0.5 / Math.sqrt(3)
	const gaussOffsets = [0.5 - offset, 0.5 + offset]
	const cellWeight = 0.25 * dx * dy

	let total = 0
	for (let i = 0; i < nx; i++) {
		const xi = x0 + i * dx
		for (let j = 0; j < ny; j++) {
			const yj = y0 + j * dy
			for (let a = 0; a < 2; a++) {
				const x = xi + gaussOffsets[a] * dx
				const hx = 1e-6 * Math.max(1, Math.abs(x))
				for (let b = 0; b < 2; b++) {
					const y = yj + gaussOffsets[b] * dy
					const hy = 1e-6 * Math.max(1, Math.abs(y))
					const z = g(x, y)
					const gx = (g(x + hx, y) - g(x - hx, y)) / (2 * hx)
					const gy = (g(x, y + hy) - g(x, y - hy)) / (2 * hy)
					const [fx, fy, fz] = F(x, y, z)
					total += -fx * gx - fy * gy + fz
				}
			}
		}
	}

	return total * cellWeight
}
