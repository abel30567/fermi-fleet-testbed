import { test } from 'node:test'
import assert from 'node:assert'
import { add } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})
