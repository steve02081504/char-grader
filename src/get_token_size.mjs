import llama3Tokenizer from 'llama3-tokenizer-js'

function encode(text) {
	return llama3Tokenizer.encode(text, { eos: false, bos: false })
}
function decode(tokens) {
	return llama3Tokenizer.decode(tokens)
}
function decode_single(token) {
	return llama3Tokenizer.decode([token])
}
function free() {}
let encoder = {
	encode,
	decode,
	decode_single,
	free
}

function get_token_size(obj) {
	if (!obj) return 0
	if (Object(obj) instanceof String) return encode(obj).length
	let aret = 0
	for (let key in obj) aret += get_token_size(obj[key])
	return aret
}
function split_by_tokenize(text) {
	let tokens = encode(text)
	let result = []
	for (let token of tokens) result.push(decode_single(token))
	return result
}

export {
	encoder,
	get_token_size,
	split_by_tokenize
}
