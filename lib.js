export function add(a, b) {
	return a + b
}

export function surfaceAreaGraph(f, ax, bx, ay, by, n = 100) {
	const dx = (bx - ax) / n
	const dy = (by - ay) / n
	const h = 1e-6
	let total = 0
	for (let i = 0; i < n; i++) {
		const x = ax + (i + 0.5) * dx
		for (let j = 0; j < n; j++) {
			const y = ay + (j + 0.5) * dy
			const fx = (f(x + h, y) - f(x - h, y)) / (2 * h)
			const fy = (f(x, y + h) - f(x, y - h)) / (2 * h)
			total += Math.sqrt(1 + fx * fx + fy * fy) * dx * dy
		}
	}
	return total
}
