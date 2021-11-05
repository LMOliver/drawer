export declare class UserInputError extends Error { }
type EReal = { type: 'real', min: number, max: number; };
type EInteger = { type: 'integer', min: number, max: number; };
type EBoolean = { type: 'boolean'; };
type EString = { type: 'string', pattern: RegExp; };
type EObject<entires extends { [key: string]: EValue; }> = { type: 'object', entires: entires; };
type EArray<item extends EValue> = { type: 'array', maxLength: number, item: item; };
type EValue = EReal | EInteger | EBoolean | EString | EObject<{ [key: string]: EValue; }> | EArray<any>;

type EEntires<entires extends { [key: string]: EValue; }>
	= { [key in keyof entires]: ETransform<entires[key]> };
type ETransform<E extends EValue>
	= E extends EReal ? number
	: E extends EInteger ? number
	: E extends EBoolean ? boolean
	: E extends EString ? string
	: E extends EObject<infer entires> ? EEntires<entires>
	: E extends EArray<infer item> ? ETransform<item>[]
	: never;

type Test1 = ETransform<{ type: 'array'; maxLength: 5, item: { type: 'object', entires: [['a', { type: 'boolean'; }]]; }; }>;

export declare function ensure<T extends EValue>(type: T): (value: unknown) => ETransform<T>;