export function add(a, b) {
	return a + b
}

export function mass2(density, ax, bx, ay, by, n = 100) {
	const dx = (bx - ax) / n
	const dy = (by - ay) / n
	let total = 0
	for (let i = 0; i < n; i++) {
		const x = ax + (i + 0.5) * dx
		for (let j = 0; j < n; j++) {
			const y = ay + (j + 0.5) * dy
			total += density(x, y) * dx * dy
		}
	}
	return total
}
