import hre from "hardhat";

import { EventEmitter } from "../typechain-types";

const { ethers } = hre;

async function main() {
  const fromBlk = 102492197;
  const toBlk = 103370567;
  const e = (await ethers.getContract("EventEmitter")) as EventEmitter;
  const events = await e.queryFilter(e.filters.EventLog(), fromBlk, toBlk);
  console.log(events.length);
  const events1 = await e.queryFilter(e.filters.EventLog1(), fromBlk, toBlk);
  console.log(events1.length);
  const events2 = await e.queryFilter(e.filters.EventLog2(), fromBlk, toBlk);
  console.log(events2.length);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
