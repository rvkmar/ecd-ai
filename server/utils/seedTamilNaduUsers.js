/**
 * Idempotent Tamil Nadu user seed — inserts missing accounts only.
 * Safe to re-run; never overwrites an existing username's password.
 *
 * Usage:
 *   SEED_TEMP_PASSWORD='WalkPass!2026' node server/utils/seedTamilNaduUsers.js
 *   npm run seed:tn-users
 */

import "dotenv/config";
import { createUserRecord } from "../routes/usersRoutes.js";
import {
  buildTamilNaduSeedUsers,
  countSeedByRole,
  resolveSeedTempPassword,
} from "./tnSeedUsers.js";
import { TAMIL_NADU_DISTRICTS } from "../data/tamilNaduDistricts.js";

function isAlreadyPresentError(message = "") {
  return /already exists|duplicate key|E11000/i.test(message);
}

async function seed() {
  const password = resolveSeedTempPassword();
  const planned = buildTamilNaduSeedUsers(password);
  const counts = countSeedByRole(planned);

  console.log(
    `TN seed plan: ${planned.length} users ` +
      `(admin ${counts.admin}, district ${counts.district}, ` +
      `teacher ${counts.teacher}, student ${counts.student}); ` +
      `${TAMIL_NADU_DISTRICTS.length} districts`
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of planned) {
    const result = await createUserRecord({
      username: row.username,
      password: row.password,
      role: row.role,
      email: row.email,
      profile: row.profile,
      authProvider: row.authProvider,
      mustChangePassword: row.mustChangePassword,
    });

    if (result.ok) {
      created += 1;
      console.log(`✅ ${row.username} (${row.role})`);
      continue;
    }

    if (isAlreadyPresentError(result.error)) {
      skipped += 1;
      continue;
    }

    failed += 1;
    console.error(`❌ ${row.username}: ${result.error}`);
  }

  console.log(
    `\nDone. created=${created} skipped=${skipped} failed=${failed}. ` +
      `Temporary password for new accounts: ${password}`
  );
  console.log("Accounts with mustChangePassword should rotate after first login.\n");

  if (failed > 0) process.exitCode = 1;
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
