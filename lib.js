export function add(a, b) {
	return a + b
}

export function surfaceArea(f, x0, x1, y0, y1, nx = 40, ny = 40) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Number.isFinite(x0) || !Number.isFinite(x1) || !Number.isFinite(y0) || !Number.isFinite(y1)) {
		throw new RangeError('integration bounds must be finite numbers')
	}
	if (!Number.isInteger(nx) || nx < 1 || !Number.isInteger(ny) || ny < 1) {
		throw new RangeError('nx and ny must be positive integers')
	}

	const ax = Math.min(x0, x1)
	const bx = Math.max(x0, x1)
	const ay = Math.min(y0, y1)
	const by = Math.max(y0, y1)

	const dx = (bx - ax) / nx
	const dy = (by - ay) / ny
	if (dx === 0 || dy === 0) {
		return 0
	}

	const g = 0.5 / Math.sqrt(3)
	const offsets = [0.5 - g, 0.5 + g]
	const cellWeight = 0.25 * dx * dy

	let area = 0
	for (let i = 0; i < nx; i++) {
		const cellX = ax + i * dx
		for (let j = 0; j < ny; j++) {
			const cellY = ay + j * dy
			for (let px = 0; px < 2; px++) {
				const x = cellX + offsets[px] * dx
				const hx = Math.min(1e-6 * Math.max(1, Math.abs(x)), 0.1 * dx)
				const denomX = (x + hx) - (x - hx)
				for (let py = 0; py < 2; py++) {
					const y = cellY + offsets[py] * dy
					const hy = Math.min(1e-6 * Math.max(1, Math.abs(y)), 0.1 * dy)
					const denomY = (y + hy) - (y - hy)

					const fx = (f(x + hx, y) - f(x - hx, y)) / denomX
					const fy = (f(x, y + hy) - f(x, y - hy)) / denomY
					area += Math.sqrt(1 + fx * fx + fy * fy)
				}
			}
		}
	}

	return area * cellWeight
}
