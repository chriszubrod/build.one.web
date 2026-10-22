import ExpenseView from "./ExpenseView";
import { keyedByPublicId } from "../../routing/keyedByPublicId";

/**
 * A different expense gets a different ExpenseView instance.
 *
 * Same defect class U-465 closed for ExpenseEdit: with one Route per entity,
 * React reconciles the SAME instance across a param change. ExpenseView now
 * navigates to the next draft after a submit, so a param change is the common
 * path, and per-instance state (the next-draft guard, line items, the receipt
 * object URL) must start fresh for each expense.
 */
export default keyedByPublicId(ExpenseView);
