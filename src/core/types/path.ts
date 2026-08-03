/**
 * One step of a path: an object property key or an array index.
 */
export type PathSegment = string | number;

/**
 * A path from the form root to a field. Paths are runtime values — our
 * schemas come from the database, so there is no type-level path inference.
 */
export type Path = PathSegment[];
