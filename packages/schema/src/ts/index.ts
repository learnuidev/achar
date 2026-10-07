/**
 * TypeScript as a schema, and a schema as TypeScript.
 *
 * The three functions an editor needs and nothing else: `parseTypeDeclaration`
 * reads a declaration into fields, `printTypeDeclaration` writes fields back out,
 * and `inferFields` reads a sample of data into fields — which is the fastest way
 * into a content type, and the reason the two directions exist at all.
 *
 * See `parse.ts` for the subset of TypeScript this understands, which it states
 * the way the GROQ implementation states its own.
 */

export * from './parse';
export * from './print';
export * from './infer';
