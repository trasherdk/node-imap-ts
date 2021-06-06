export class IMAPError extends Error {
	public source: string;
	public readonly wrappedError?: Error;

	constructor(msg: string);
	constructor(wrappedError: Error);
	constructor(msg: string, wrappedError: Error);
	constructor(msgOrErr: string | Error, wrappedError?: Error) {
		super(typeof msgOrErr === "string" ? msgOrErr : msgOrErr.message);
		if (wrappedError) {
			this.wrappedError = wrappedError;
		} else if (typeof msgOrErr !== "string") {
			this.wrappedError = msgOrErr;
		}
	}
}

export class InvalidParsedDataError extends Error {
	constructor(
		public readonly expected: string[],
		public readonly actual: string | string[],
	) {
		super();
	}

	toString(): string {
		return [
			this.message,
			`\tExpected: ${this.expected}`,
			`\tActual:   ${this.actual}`,
		].join("\n");
	}
}
