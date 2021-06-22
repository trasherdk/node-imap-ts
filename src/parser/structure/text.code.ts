import { ParsingError } from "../../errors";
import { NumberToken, SPToken } from "../../lexer/tokens";
import { ILexerToken, TokenTypes } from "../../lexer/types";
import { getOriginalInput, splitSpaceSeparatedList } from "../utility";
import { ICapability, createCapabilityFromString } from "./capability";
import Flag from "./flag";

export default class TextCode {
	public readonly innerTokens: ILexerToken<unknown>[];
	public readonly kind?: string;

	protected static isOpenToken(token: ILexerToken<unknown>) {
		return (
			token && token.type === TokenTypes.operator && token.value === "["
		);
	}

	protected static isCloseToken(token: ILexerToken<unknown>) {
		return (
			token && token.type === TokenTypes.operator && token.value === "]"
		);
	}

	public static match(
		tokens: ILexerToken<unknown>[],
		startingIndex = 0,
	): null | TextCode {
		const matchedTokens: ILexerToken<unknown>[] = [];
		let i = startingIndex;
		if (TextCode.isOpenToken(tokens[startingIndex])) {
			for (; i < tokens.length; i++) {
				const token = tokens[i];
				matchedTokens.push(token);
				if (TextCode.isCloseToken(token)) {
					break;
				}
			}
		}

		if (TextCode.isCloseToken(matchedTokens[matchedTokens.length - 1])) {
			// We found a full text code so initiate and return it
			return new TextCode(matchedTokens, startingIndex, i);
		}

		// TODO: Should we throw if we find an opening "[" value, but
		//       not a close one? Technically speaking the spec allows
		//       `text` to include an "[" (and even a "]") so, while it
		//       would be extremely confusing for the parser, a valid
		//       response can look like a text code without being one.
		//       So maybe a throw here isn't correct?

		// If we didn't find a code, return null indicating as much
		return null;
	}

	constructor(
		public readonly tokens: ILexerToken<unknown>[],
		public readonly startingIndex: number,
		public readonly endingIndex: number,
	) {
		this.kind = tokens[1]?.value; // First token is "["
		this.innerTokens = tokens.slice(1, tokens.length - 2);

		const firstToken = this.innerTokens[0];
		if (firstToken && firstToken instanceof SPToken) {
			// We can skip the first space token
			this.innerTokens.shift();
		}
	}

	public get badcharset(): string[] {
		if (this.kind !== "BADCHARSET") {
			return null;
		}

		// spec: "BADCHARSET" [SP "(" astring *(SP astring) ")" ]
		const tokenBlocks = splitSpaceSeparatedList(this.innerTokens);
		return tokenBlocks.map((block) => getOriginalInput(block));
	}

	public get capabilities(): ICapability[] {
		if (this.kind !== "CAPABILITIES") {
			return null;
		}

		const tokenBlocks = splitSpaceSeparatedList(
			this.innerTokens,
			null, // This list does not have a start or end character
			null,
		);
		// For each set of tokens, get their raw values and make capabilities
		return tokenBlocks.map((block) =>
			createCapabilityFromString(getOriginalInput(block)),
		);
	}

	public get flags(): Flag[] {
		if (this.kind !== "PERMANENTFLAGS") {
			return null;
		}

		// spec: "PERMANENTFLAGS" SP "(" [flag-perm *(SP flag-perm)] ")"
		const tokenBlocks = splitSpaceSeparatedList(this.innerTokens);
		return tokenBlocks.map((block) => new Flag(getOriginalInput(block)));
	}

	public get uidNext(): number {
		return this.getNZNumberTextCodeValue("UIDNEXT");
	}

	public get uidValidity(): number {
		return this.getNZNumberTextCodeValue("UIDVALIDITY");
	}

	public get unseen(): number {
		return this.getNZNumberTextCodeValue("UNSEEN");
	}

	private getNZNumberTextCodeValue(kindToValidate: string) {
		if (this.kind !== kindToValidate) {
			return null;
		}

		// spec: "UIDNEXT" SP nz-number
		const numToken = this.innerTokens[0];
		if (!numToken || !(numToken instanceof NumberToken)) {
			throw new ParsingError(
				`Recieved invalid format for ${kindToValidate}`,
				this.innerTokens,
			);
		}

		const num = numToken.getTrueValue();
		if (num === 0) {
			throw new ParsingError(
				`Recieved invalid number for ${kindToValidate}`,
				numToken.value,
			);
		}
		return num;
	}
}
