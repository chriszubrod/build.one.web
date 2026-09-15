import ExpenseEdit from "./ExpenseEdit";
import { keyedByPublicId } from "../../routing/keyedByPublicId";

/**
 * U-465 — a different expense gets a different ExpenseEdit instance.
 *
 * See `src/routing/keyedByPublicId.tsx` for the defect this closes: one Route
 * per entity means React reconciles the same instance across a param change,
 * and ExpenseEdit's form is seeded once and never reset.
 */
export default keyedByPublicId(ExpenseEdit);
