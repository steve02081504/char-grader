import { createExtractorFromData } from 'node-unrar-js'

let wasmBinary

export async function extractPngsFromRar(rarFile, password = null) {
	wasmBinary ??= await (await fetch('https://cdn.jsdelivr.net/npm/node-unrar-js/dist/js/unrar.wasm')).arrayBuffer()
	if (rarFile instanceof File) rarFile = await rarFile.arrayBuffer()
	let extractor = await createExtractorFromData({
		wasmBinary,
		data: rarFile,
		password
	})
	let filesIter = extractor.getFileList()
	const fileHeaders = [...filesIter.fileHeaders]
	let pngFileNames = fileHeaders.map(header => header.name).filter(name => name.endsWith('.png'))
	let pngFilesLoader = extractor.extract({
		files: pngFileNames
	})
	/** @type {Uint8Array[]} */
	let pngFiles = [...pngFilesLoader.files].map(file => file.extraction).filter(x => x)

	return pngFiles
}
