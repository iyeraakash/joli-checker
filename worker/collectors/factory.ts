import {
  GreenhouseCollector,
} from "./greenhouse.js";

import {
  LeverCollector,
} from "./lever.js";

import type {
  JobCollector,
} from "./types.js";


export type CollectorConfiguration = {
  companyId: string;
  collectorType: string;
  sourceKey: string | null;
};


export function createCollector(
  configuration: CollectorConfiguration,
): JobCollector {
  switch (
    configuration.collectorType
  ) {
    case "GREENHOUSE": {
      if (
        !configuration.sourceKey
      ) {
        throw new Error(
          `Company ` +
            `${configuration.companyId} ` +
            `is missing a ` +
            `Greenhouse source key`,
        );
      }


      return new GreenhouseCollector(
        configuration.companyId,
        configuration.sourceKey,
      );
    }


    case "LEVER": {
      if (
        !configuration.sourceKey
      ) {
        throw new Error(
          `Company ` +
            `${configuration.companyId} ` +
            `is missing a ` +
            `Lever source key`,
        );
      }


      return new LeverCollector(
        configuration.companyId,
        configuration.sourceKey,
      );
    }


    default:
      throw new Error(
        `Unsupported collector type ` +
          `"${configuration.collectorType}" ` +
          `for company ` +
          `${configuration.companyId}`,
      );
  }
}