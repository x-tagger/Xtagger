/**
 * @module result
 * @layer Core / Shared
 * @description Discriminated union Result type for explicit, type-safe error handling.
 * NO exceptions are thrown in core code — all fallible operations return Result<T, E>.
 *
 * @example
 *   const result = parseTag(raw);
 *   if (!result.ok) {
 *     console.error(result.error.message);
 *     return result; // propagate
 *   }
 *   use(result.value); // TypeScript knows value is T here
 */

// ─── Core Types ───────────────────────────────────────────────────────────────

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = Error> = Ok<T> | Err<E>;

// ─── Factory Functions ────────────────────────────────────────────────────────

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

// ─── Type Guards ──────────────────────────────────────────────────────────────

export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result.ok;
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => !result.ok;

// ─── Combinators ─────────────────────────────────────────────────────────────

/**
 * Transform the value inside an Ok result; pass Err unchanged.
 * @example mapResult(ok(5), x => x * 2) // => ok(10)
 */
export const mapResult = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> => (result.ok ? ok(fn(result.value)) : result);

/**
 * Chain Result-returning computations. Short-circuits on first Err.
 * @example flatMapResult(ok(5), x => x > 0 ? ok(x) : err('negative'))
 */
export const flatMapResult = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> => (result.ok ? fn(result.value) : result);

/**
 * Collect an array of Results into a single Result<T[], E>.
 * Returns the first Err encountered, or Ok with all values.
 */
export const collectResults = <T, E>(results: ReadonlyArray<Result<T, E>>): Result<T[], E> => {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    values.push(result.value);
  }
  return ok(values);
};

/**
 * Unwrap value or return a default. Does NOT throw.
 */
export const getOrElse = <T, E>(result: Result<T, E>, fallback: T): T =>
  result.ok ? result.value : fallback;
