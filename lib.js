export function add(a, b) {
	return a + b
}

export function quadraticForm2(m, v) {
	const [x, y] = v
	return (
		x * (m[0][0] * x + m[0][1] * y) + y * (m[1][0] * x + m[1][1] * y)
	)
}
