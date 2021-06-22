import { ILexerToken } from "../../../src/lexer/types";

export type TestSpec = {
	name: string;
	input: string;
	results:
		| {
				lexer: ILexerToken<unknown>[];
				parser?: Record<string, any>;
		  }
		| {
				error: Error;
		  };
};
