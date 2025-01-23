import {
	BlobReader,
	BlobWriter,
	Uint8ArrayReader,
	ZipReader,
} from '@zip.js/zip.js'

/**
 * @param {Blob|Uint8Array} zipFile
 * @param {string?} password
 * @returns {Promise<Uint8Array[]>}
 */
export async function extractPngsFromZip(zipFile, password = null) {
	let reader
	if (zipFile instanceof Blob) reader = new BlobReader(zipFile)
	else reader = new Uint8ArrayReader(zipFile)
	const zip = new ZipReader(reader, { password })
	const entries = await zip.getEntries()
	const pngs = []
	for (const entry of entries)
		if (entry.filename.endsWith('.png')) {
			const data = await entry.getData(new BlobWriter())
			pngs.push(data)
		}

	return pngs
}

/**
 * @param {Blob|Uint8Array} zipFile
 * @returns {Promise<Boolean>} true if zip is an fount part(contains fount.json)
 */
export async function isFoundPart(zipFile) {
	let reader
	if (zipFile instanceof Blob) reader = new BlobReader(zipFile)
	else reader = new Uint8ArrayReader(zipFile)
	const zip = new ZipReader(reader)
	const entries = await zip.getEntries()
	for (const entry of entries)
		if (entry.filename == 'fount.json') return true
	return false
}
