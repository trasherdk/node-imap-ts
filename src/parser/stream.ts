import { Readable, ReadableOptions } from "stream";

export default class ParserStream extends Readable {
	public readCallback: (size: number) => void;

	constructor(options?: ReadableOptions) {
		super(options);
	}

	_read(size: number) {
		if (this.readCallback) {
			return this.readCallback(size);
		}
	}
}
