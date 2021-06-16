import { ILexerToken, TokenTypes } from "../types";

/**
 * Atom Token
 *
 * From the spec:
 * > An atom consists of one or more non-special characters.
 */
export class AtomToken implements ILexerToken<string> {
	public readonly type: TokenTypes;

	constructor(public readonly value: string) {
		this.type = TokenTypes.atom;
	}

	getTrueValue(): string {
		// An atom token is just a raw string-like value. Most often
		// for our lexer an atom will just be a keyword but we will
		// be unopinionated here.
		return this.value;
	}
}
