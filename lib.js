export function add(a, b) {
	return a + b
}

export function averageValue2(f, ax, bx, ay, by, n = 100) {
	const dx = (bx - ax) / n
	const dy = (by - ay) / n
	let sum = 0
	for (let i = 0; i < n; i++) {
		const x = ax + (i + 0.5) * dx
		for (let j = 0; j < n; j++) {
			const y = ay + (j + 0.5) * dy
			sum += f(x, y)
		}
	}
	const integral = sum * dx * dy
	const area = (bx - ax) * (by - ay)
	return integral / area
}
