/**
 * Ordering for the course library.
 *
 * Study, practice and exam each build their list from two queries — courses
 * the student's department owns, plus courses shared to it — merged and
 * de-duplicated client side. Both queries ordered by `created_at desc`, so the
 * final list came out in admin-upload order, which is meaningless to a student
 * and differed between the three modes depending on what was shared.
 *
 * Sorting here rather than in the queries is deliberate: an `.order()` on each
 * query cannot order ACROSS the two result sets once they are merged.
 */

type SortableCourse = {
  code?: string | null;
  title?: string | null;
};

/**
 * The course code, or null when there isn't one.
 *
 * Lives here, beside `sortKey`, precisely so the two cannot drift: the list
 * sorts on code-then-title, so anything that DISPLAYS a code column has to
 * agree with this about what counts as having a code. A course whose code is
 * absent, empty or whitespace sorts by its title alone, and must therefore
 * render without a code rather than with a blank one.
 */
export function courseCode(course: SortableCourse): string | null {
  const code = String(course.code ?? "").trim();
  return code.length > 0 ? code : null;
}

/**
 * Sort key. Code first, because it groups a department's courses together
 * (CSC 201, CSC 202, MTH 101) while still reading A-Z. Title carries the sort
 * on its own when a course has no code, and breaks ties when two share one.
 */
function sortKey(course: SortableCourse) {
  // Uses courseCode so a whitespace-only code sorts as absent, matching what
  // the code column will show.
  return `${courseCode(course) ?? ""} ${course.title ?? ""}`.trim();
}

/**
 * Alphabetical by course code, then title.
 *
 * `numeric` so CSC 2 sorts before CSC 10 rather than after it, and
 * `sensitivity: "base"` so casing and accents do not split the ordering.
 *
 * Returns a new array; the input is not mutated.
 */
export function sortCoursesAlphabetically<T extends SortableCourse>(courses: T[]): T[] {
  return [...courses].sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b), undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}
