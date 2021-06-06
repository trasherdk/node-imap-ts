export interface IReplaces {
	fromOffset: number;
	toOffset: number;
	val: string;
}
export interface ISequence {
	buf: undefined | Buffer;
	consecutive: boolean;
	charset: string;
	chunk: string;
	encoding: string;
	index: number;
	length: number;
	pendoffset: undefined | number;
}
export interface IState {
	buffer: undefined | Buffer;
	consecutive: boolean;
	curReplace: undefined | IReplaces[];
	encoding: undefined | string;
	remainder: undefined | undefined;
	replaces: (IReplaces | IReplaces[])[];
}
