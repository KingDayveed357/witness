// CI entry point: fail the build on any architecture rule violation.
import { checkRepo } from "./architecture-rules.ts";

const violations = checkRepo(process.cwd());
for (const v of violations) console.error(`✘ ${v.rule}: ${v.file} imports "${v.specifier}"`);
console.log(violations.length ? `${violations.length} architecture violation(s)` : "architecture rules: OK");
process.exit(violations.length ? 1 : 0);
