import BillCreditEdit from "./BillCreditEdit";
import { keyedByPublicId } from "../../routing/keyedByPublicId";

/**
 * U-465 — a different bill credit gets a different BillCreditEdit instance.
 *
 * See `src/routing/keyedByPublicId.tsx` for the defect this closes: one Route
 * per entity means React reconciles the same instance across a param change,
 * and BillCreditEdit's form is seeded once and never reset.
 */
export default keyedByPublicId(BillCreditEdit);
