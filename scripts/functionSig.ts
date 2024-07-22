import fs from "fs";
import path from "path";
import { ethers } from "ethers";

interface AbiItem {
  type: string;
  name?: string;
  inputs?: Array<{ type: string }>;
  stateMutability?: string;
}

interface ContractData {
  abi: AbiItem[];
}

async function main() {
  const deploymentsDir = path.join(__dirname, "..", "deployments", "seiTestnet");
  const files = fs.readdirSync(deploymentsDir);
  const outputFile = path.join(__dirname, "function_signatures.txt");
  let output = "";

  for (const file of files) {
    if (path.extname(file) === ".json") {
      const filePath = path.join(deploymentsDir, file);
      const contractData: ContractData = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const contractName = path.basename(file, ".json");

      output += `\nContract: ${contractName}\n`;
      output += "Function Name | Function Signature\n";
      output += "--------------------------------\n";
      if (!contractData.abi) {
        continue;
      }
      for (const item of contractData.abi) {
        if (item.name) {
          const functionName = item.name;
          const inputs = item.inputs ? item.inputs.map((input) => input.type).join(",") : "";
          const functionSignature = `${functionName}(${inputs})`;
          const functionSelector = ethers.utils.id(functionSignature).slice(0, 10);

          output += `${functionName.padEnd(20)} | ${functionSelector}\n`;
        }
      }
    }
  }

  fs.writeFileSync(outputFile, output);
  console.log(`Function signatures have been written to ${outputFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
