import crypto from "crypto";
import urlLib from "url";

import got from "got";
import { BigNumber, ethers } from "ethers";
import hre from "hardhat";

const coder = ethers.utils.defaultAbiCoder;

export type RealtimeFeedReport = {
  feedId: string;
  observationTimestamp: number;
  medianPrice: BigNumber;
  minPrice: BigNumber;
  maxPrice: BigNumber;
  minBlockNumber: number;
  maxBlockNumber: number;
  maxBlockHash: string;
  maxBlockTimestamp: number;
  blob: string;
};

function getBaseUrl() {
  if (hre.network.name === "arbitrum") {
    return "https://dataengine.chain.link";
  } else if (hre.network.name === "arbitrumGoerli") {
    return "https://mercury-arbitrum-testnet.chain.link";
  }
  throw new Error("Unsupported network");
}

function generateHmacString(url: string, body: string, timestamp: number, clientId: string) {
  const method = "GET";
  const parsedUrl = urlLib.parse(url);

  const bodyDigest = crypto.createHash("sha256").update(body).digest("hex");

  const authString = `${method} ${parsedUrl.path} ${bodyDigest} ${clientId} ${timestamp}`;
  return authString;
}

function computeHmacSignature(message: string, clientSecret: string) {
  return crypto
    .createHmac("sha256", clientSecret as string)
    .update(message)
    .digest("hex");
}

function signRequest(url: string, clientId: string, clientSecret: string) {
  if (!clientId || !clientSecret) {
    throw new Error("clientId and clientSecret are required");
  }

  const timestamp = Date.now();
  const signatureString = generateHmacString(url, "", timestamp, clientId);
  const signature = computeHmacSignature(signatureString, clientSecret);

  return {
    timestamp,
    signature,
  };
}

type ClientBulkResponse = {
  chainlinkBlob: string[];
};

export function decodeBlob(blob: string): {
  reportContext: string[];
  report: RealtimeFeedReport;
  rs: string[];
  ss: string[];
  rawVs: string;
} {
  const [reportContext, reportData, rs, ss, rawVs] = coder.decode(
    ["bytes32[3]", "bytes", "bytes32[]", "bytes32[]", "bytes32"],
    blob
  );

  const [
    feedId,
    observationTimestamp,
    medianPrice,
    minPrice,
    maxPrice,
    maxBlockNumber,
    maxBlockHash,
    minBlockNumber,
    maxBlockTimestamp,
  ] = coder.decode(
    [
      "bytes32", // feed id
      "uint32", // observation timestamp
      "int192", // median
      "int192", // bid
      "int192", // ask
      "uint64", // max block number
      "bytes32", // max block hash
      "uint64", // min block number
      "uint64", // max block timestamp
    ],
    reportData
  );

  return {
    reportContext,
    report: {
      feedId,
      observationTimestamp,
      medianPrice,
      minPrice,
      maxPrice,
      minBlockNumber: minBlockNumber.toNumber(),
      maxBlockNumber: maxBlockNumber.toNumber(),
      maxBlockHash,
      maxBlockTimestamp: maxBlockTimestamp.toNumber(),
      blob,
    },
    rs,
    ss,
    rawVs,
  };
}

export async function fetchRealtimeFeedReport({ feedId, blockNumber, clientId, clientSecret }) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/client/bulk?feedIdHex=${feedId}&limit=20&afterBlockNumber=${blockNumber - 10}`;
  const { timestamp, signature } = signRequest(url, clientId, clientSecret);

  const headers = {
    Authorization: clientId,
    "X-Authorization-Timestamp": String(timestamp),
    "X-Authorization-Signature-SHA256": signature,
  };

  const res = await got(url, {
    headers: headers,
    timeout: 30000,
  }).json();
  const data = res as ClientBulkResponse;
  const reports = data.chainlinkBlob.map((blob) => {
    const decoded = decodeBlob(blob);
    return decoded.report;
  });

  return reports[reports.length - 1];
}

interface IReportResponse {
  report: IReport;
}

interface IReport {
  feedID: string;
  validFromTimestamp: number;
  observationsTimestamp: number;
  fullReport: string;
}

interface IRealtimeFeedReport {
  feedId: string;
  validFromTimestamp: number;
  observationsTimestamp: number;
  nativeFee: BigNumber;
  linkFee: BigNumber;
  expiresAt: number;
  price: BigNumber;
  bid: BigNumber;
  ask: BigNumber;
}

export function decodeBlobV2(blob: string): {
  reportContext: string[];
  report: IRealtimeFeedReport;
  rs: string[];
  ss: string[];
  rawVs: string;
} {
  const [reportContext, reportBlob, rawRs, rawSs, rawVs] = coder.decode(
    ["bytes32[3]", "bytes", "bytes32[]", "bytes32[]", "bytes32"],
    blob
  );

  const [feedId, validFromTimestamp, observationsTimestamp, nativeFee, linkFee, expiresAt, price, bid, ask] =
    coder.decode(
      [
        "bytes32", // feed id
        "uint32", // valid from timestamp
        "uint32", // observations timestamp
        "uint192", // native fee
        "uint192", // link fee
        "uint32", // expires at
        "int192", // price
        "int192", // bid
        "int192", // ask
      ],
      reportBlob
    );

  return {
    reportContext,
    report: {
      feedId,
      validFromTimestamp,
      observationsTimestamp,
      nativeFee,
      linkFee,
      expiresAt,
      price,
      bid,
      ask,
    },
    rs: rawRs,
    ss: rawSs,
    rawVs,
  };
}

export async function fetchRealtimeFeedReportV2({ feedId, timestamp, clientId, clientSecret }) {
  const baseUrl = "https://api.testnet-dataengine.chain.link";
  const url = `${baseUrl}/api/v1/reports?feedID=${feedId}&timestamp=${timestamp}`;
  const { timestamp: now, signature } = signRequest(url, clientId, clientSecret);

  const headers = {
    Authorization: clientId,
    "X-Authorization-Timestamp": String(now),
    "X-Authorization-Signature-SHA256": signature,
  };

  const res = await got(url, {
    headers: headers,
    timeout: 30000,
  }).json();
  const data = res as IReportResponse;

  const report = decodeBlobV2(data.report.fullReport);

  return {
    response: data,
    report: report,
  };
}
