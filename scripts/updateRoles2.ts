import hre from "hardhat";
import { grantRoleIfNotGranted } from "../utils/role";

async function main() {
  const rolesConfig = await hre.gmx.getRoles();
  for (const role in rolesConfig) {
    const accounts = rolesConfig[role];
    for (const account in accounts) {
      await grantRoleIfNotGranted(account, role);
    }
  }
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
